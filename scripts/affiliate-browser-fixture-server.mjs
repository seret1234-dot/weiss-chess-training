// Loopback-only UI fixture server. NEVER deploy. No credentials, real users, provider calls or DB writes.
import express from 'express'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
export function startFixtureServer(port=4249) {
 const app=express();app.use(express.json());let account=null, role='member', requests=[], applications=[], payouts=[], audit=[], referrals=[], empty=false
 const commission={id:'aaaaaaaa-aaaa-4000-8000-aaaaaaaaaaaa',created_at:'2026-08-01T12:00:00Z',currency:'USD',eligible_minor:50000,rate_bps:1500,amount_minor:7500,reversed_minor:0,status:'available'}
 const detail=()=>({admin:role==='admin',account,clicks:10,signups:3,conversions:2,balances:{revenue:50000,pending:1000,available:7500,reserved:0,paid:0},commissions:empty?[]:[commission],applications,payouts,referrals,audit})
 app.post('/__affiliate_fixture', (req,res)=>{role=req.body.role||role;empty=req.body.empty??empty;if(req.body.reset){account=null;applications=[];payouts=[];requests=[];audit=[];referrals=[];empty=false}res.json({ok:true})})
 app.get('/__affiliate_fixture',(req,res)=>res.json({requests}))
 app.get('/api/price-profile',(_req,res)=>res.json({affiliateCheckout:true}))
 app.post('/api/affiliate',(req,res)=>{
  const b=req.body;requests.push(b)
  if(b.action==='track'||b.action==='bind')return res.json({valid:true})
  if(role==='guest')return res.status(401).json({error:'Sign in with your Weiss Chess account'})
  if(['list','detail','payout_items','manage','review','prepare_payout','pay','cancel_payout','adjust','reassign'].includes(b.action)&&role!=='admin')return res.status(403).json({error:'Affiliate administrator required'})
  if(b.action==='activate') {if(!b.accept_terms)return res.status(400).json({error:'Terms required'});account={id:'bbbbbbbb-bbbb-4000-8000-bbbbbbbbbbbb',user_id:'fixture-user',code:b.code,display_name:b.display_name,paypal_email:b.paypal_email,tier:1,status:'active',effective_bps:1500};return res.json(account)}
  if(b.action==='profile'){Object.assign(account,{display_name:b.display_name,paypal_email:b.paypal_email});return res.json(account)}
  if(b.action==='apply'){applications.push({id:`app${applications.length+1}`,requested_tier:b.tier,title:b.title,profile_url:b.profile_url,links:b.links,status:'pending'});return res.json({pending:true})}
  if(b.action==='dashboard'||b.action==='detail')return res.json(detail())
  if(b.action==='list')return res.json({accounts:account?[{...account,revenue_minor:50000,available_minor:7500}]:[]})
  if(b.action==='manage'){Object.assign(account,b);account.effective_bps=b.custom_bps??[0,1500,2000,3000,2500,3500][b.tier];audit.push({action:b.action,reason:b.reason});return res.json(account)}
  if(b.action==='review'){applications.find(x=>x.id===b.id).status=b.approve?'approved':'rejected';return res.json({ok:true})}
  if(b.action==='adjust'){audit.push({action:'adjust',amount_minor:b.amount_minor,reason:b.reason});return res.json({ok:true})}
  if(b.action==='reassign'){referrals.push({user_id:b.user_id,affiliate_id:b.id});audit.push({action:'reassign',reason:b.reason});return res.json({ok:true})}
  if(b.action==='prepare_payout'){const payout={id:'payout-fixture',batch_month:'2026-09-01',amount_minor:7500,paypal_email:account.paypal_email,status:'prepared'};payouts.push(payout);return res.json(payout)}
  if(b.action==='payout_items')return res.json({total:1,items:[{commission_id:commission.id,amount_minor:7500}]})
  if(b.action==='pay'){payouts[0].status='paid';payouts[0].reference=b.reference;return res.json(payouts[0])}
  return res.json({ok:true})
 })
 app.use('/api',(req,res)=>res.status(503).json({error:'UI fixture: unrelated API disabled'}))
 app.use(express.static(resolve('dist')));app.use((req,res)=>res.sendFile(resolve('dist/index.html')))
 return app.listen(port,'127.0.0.1',()=>console.log(`Synthetic affiliate UI fixtures http://127.0.0.1:${port}`))
}
if(import.meta.url===pathToFileURL(process.argv[1]).href) startFixtureServer()
