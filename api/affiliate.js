import { createClient } from '@supabase/supabase-js'
import { enabled, code, destination, profileInput, httpsUrl, visitor, command, createCheckout, previewCheckout } from '../server/affiliate-core.mjs'

export default async function handler(req,res) {
 res.setHeader('Cache-Control','private, no-store')
 if(!enabled()) return res.status(503).json({error:'Affiliate Program activation is pending. No application or referral was recorded.'})
 if(!['GET','POST'].includes(req.method)) return res.status(405).json({error:'Method not allowed'})
 try {
  if(req.method==='POST') {
   if(!String(req.headers['content-type'] || '').includes('application/json')) return res.status(415).json({error:'JSON required'})
   const origin=req.headers.origin
   const localProxy=!!origin && /^(localhost|127\.0\.0\.1):8787$/.test(req.headers.host || '') && ['localhost','127.0.0.1'].includes(new URL(origin).hostname) && ['5173','5174','5175'].includes(new URL(origin).port)
   if(req.headers['sec-fetch-site']==='cross-site' || (origin && new URL(origin).host!==req.headers.host && !localProxy)) return res.status(403).json({error:'Same-origin request required'})
  }
  const db=createClient(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
  const token=String(req.headers.authorization || '').replace(/^Bearer /,'')
  const {data,error}=token?await db.auth.getUser(token):{data:{user:null},error:null}
  if(token && error) return res.status(401).json({error:'Invalid session'})
  const user=data.user, body=req.body || {}, action=req.method==='GET'?String(req.query.action || 'dashboard'):String(body.action || '')
  if(req.method==='GET' && !['dashboard','list','detail','payout_items'].includes(action)) return res.status(405).json({error:'POST required for changes'})
  if(action==='track') {
   const cookie=visitor(req)
   const result=await command(db,user?.id || null,'track',{code:code(body.code),destination:destination(body.destination),token_hash:cookie.hash})
   if(result.valid) res.setHeader('Set-Cookie',`weiss_aff=${cookie.token}; Path=/; Max-Age=2592000; HttpOnly; SameSite=Lax${req.headers.host?.startsWith('127.0.0.1:') || req.headers.host?.startsWith('localhost:')?'':'; Secure'}`)
   return res.status(200).json(result)
  }
  if(!user) return res.status(401).json({error:'Sign in with your Weiss Chess account'})
  let input
  if(action==='checkout_preview') return res.status(200).json(await previewCheckout(db,user,req))
  if(action==='checkout') return res.status(200).json(await createCheckout(db,user,req))
  if(action==='bind') { const cookie=visitor(req); input={token_hash:cookie.hash} }
  else if(action==='activate') input={...profileInput(body),code:code(body.code),accept_terms:body.accept_terms===true,terms_version:body.terms_version}
  else if(action==='profile') input=profileInput(body)
  else if(action==='apply') input={tier:Number(body.tier),title:String(body.title || ''),profile_url:body.profile_url?httpsUrl(body.profile_url):null,links:(body.links || []).slice(0,8).map(httpsUrl)}
  else if(['dashboard','list','detail','payout_items'].includes(action)) input=req.method==='GET'?req.query:body
  else if(['manage','review','reassign','adjust','prepare_payout','pay','cancel_payout'].includes(action)) {
   input={...body}; delete input.action
   if(typeof input.reason!=='string' || !input.reason.trim() || input.reason.length>2000) throw new Error('Audit reason must contain 1–2000 characters')
   if(input.code!==undefined) input.code=code(input.code)
   if(input.amount_minor!==undefined && (!Number.isSafeInteger(input.amount_minor) || Math.abs(input.amount_minor)>100000000)) throw new Error('Adjustment must be integer cents within the safety limit')
  } else return res.status(400).json({error:'Unknown action'})
  const result=await command(db,user.id,action,input)
  return res.status(200).json(result)
 } catch(error) {
  if(error.code==='AFFILIATE_ELIGIBILITY_UNAVAILABLE') return res.status(503).json({error:'AFFILIATE_ELIGIBILITY_UNAVAILABLE',reason:error.reason,message:error.message})
  if(error.code==='AFFILIATE_TAX_CONFIG_INVALID') {
   console.error('Affiliate tax configuration invalid',error.reason)
   return res.status(503).json({error:'AFFILIATE_TAX_CONFIG_INVALID'})
  }
  console.error('Affiliate operation failed',error.message)
  return res.status(/administrator|Authentication|Verified account/.test(error.message)?403:400).json({error:error.message || 'Affiliate operation failed'})
 }
}
