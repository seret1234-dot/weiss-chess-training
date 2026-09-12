// Read-only provider configuration audit. Does not create plans, charge, migrate or enable the program.
import { createClient } from '@supabase/supabase-js'
import { getPayPalMode, paypalRequest } from '../server/paypal-subscription-core.mjs'
import { validateIntroPlan, affiliateCheckoutOrigin } from '../server/affiliate-core.mjs'
import { affiliateTaxConfig } from '../server/affiliate-tax-config.mjs'
if(getPayPalMode()==='live'&&!process.argv.includes('--allow-live-read-only'))throw Error('Use sandbox first; live read-only inspection requires --allow-live-read-only')
affiliateCheckoutOrigin()
affiliateTaxConfig()
const allIds=new Set()
for(const period of ['MONTHLY','YEARLY'])for(const tax of ['STANDARD','TAXED']){
 const base=process.env[`PAYPAL_PLAN_${period}_${tax}`], intro=process.env[`PAYPAL_AFFILIATE_PLAN_${period}_${tax}`]
 if(!base||!intro||base===intro)throw Error(`Distinct base/intro plans required: ${period}/${tax}`)
 for(const id of [base,intro]){if(allIds.has(id))throw Error('Plan ID reused across billing variants; explicit reconciliation required');allIds.add(id)}
 const baseDetails=await paypalRequest(`/v1/billing/plans/${base}`), introDetails=await paypalRequest(`/v1/billing/plans/${intro}`)
 if(baseDetails.id!==base || introDetails.id!==intro)throw Error('Provider plan identity mismatch')
 validateIntroPlan(baseDetails,introDetails,period.toLowerCase())
 console.log(`PASS ${period}/${tax}: active native one-cycle 10% introduction and unchanged renewal`)
}
const db=createClient(process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}})
const admins=await db.from('affiliate_admins').select('user_id',{count:'exact',head:true})
if(admins.error)throw admins.error
if(!admins.count)throw Error('No approved affiliate administrator configured')
console.log('PASS affiliate schema readable by server and administrator provisioned. Next: provider sandbox checkout/webhook/renewal/refund acceptance. No deployment or mutation performed.')
