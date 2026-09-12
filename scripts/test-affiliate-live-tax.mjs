// Operator-approved LIVE identities/prices; all provider calls below are fixtures.
// No network, checkout, database mutation, or charge.
import assert from 'node:assert/strict'
import { collectedTax, commission, minor, processAffiliateEvent } from '../server/affiliate-core.mjs'

const plans = [
  ['MONTHLY_STANDARD','P-8K241250GP028524CNJPKERA',0,899,899],
  ['MONTHLY_TAXED','P-79R96803Y5998842CNJPKERI',1800,1061,899],
  ['YEARLY_STANDARD','P-9UU59167C4437694QNJPKERA',0,5900,5900],
  ['YEARLY_TAXED','P-53J9623631171753BNJPKERI',1800,6962,5900],
  ['MONTHLY_STANDARD','P-16X17549W5490215PNKPRCFQ',0,809,809],
  ['MONTHLY_TAXED','P-2K610201RU325234SNKPR35Y',1800,955,809],
  ['YEARLY_STANDARD','P-4K286367YP6991142NKPR6CY',0,5310,5310],
  ['YEARLY_TAXED','P-5VR21182Y38239445NKPSAGQ',1800,6266,5310],
]
assert.equal(new Set(plans.map(p=>p[1])).size,8)
process.env.AFFILIATE_PROGRAM_ENABLED='true'
process.env.AFFILIATE_PAYPAL_TAX_BPS_JSON=JSON.stringify(Object.fromEntries(plans.map(p=>[p[1],p[2]])))
plans.forEach(([key,id],i)=>{process.env[`PAYPAL_${i<4?'':'AFFILIATE_'}PLAN_${key}`]=id})
const user='10000000-0000-4000-8000-000000000003'
for(const [i,[key,id,bps,first,firstNet]] of plans.entries()) {
  const normal=plans[i%4]
  for(const [gross,net] of [[first,firstNet],[normal[3],normal[4]]]) {
    for(const reported of [undefined,'0','0.00']) {
      assert.equal(collectedTax(gross,reported,bps),gross-net)
      const calls=[]
      const db={rpc:async(name,args)=>{calls.push(args.p);return {data:{processed:true}}},from:()=>({select(){return this},eq(){return this},async maybeSingle(){return {data:{user_id:user,subscription_id:'I-TAX'}}}})}
      const provider=async path=>path.includes('/sale/')?{id:'SALETAX',state:'completed',billing_agreement_id:'I-TAX',amount:{total:(gross/100).toFixed(2),currency:'USD',details:reported===undefined?{}:{tax:reported}},create_time:'2026-09-07T10:00:00Z'}:path.includes('/refund/')?{id:'REFUNDTAX',sale_id:'SALETAX',state:'completed',amount:{total:(gross/100).toFixed(2),currency:'USD',details:{tax:'0.00'}}}:{id:'I-TAX',plan_id:id,custom_id:`${user}|${key.startsWith('MONTHLY')?'monthly':'yearly'}`}
      await processAffiliateEvent({event_type:'PAYMENT.SALE.COMPLETED',resource:{id:'SALETAX'}},db,provider)
      assert.equal(calls[0].tax_minor,gross-net)
      assert.equal(calls[0].gross_minor-calls[0].tax_minor,net)
      await processAffiliateEvent({id:'REFUNDEVENT',event_type:'PAYMENT.SALE.REFUNDED',resource:{id:'REFUNDTAX',sale_id:'SALETAX'}},db,provider)
      assert.equal(Object.hasOwn(calls.at(-1),'refund_tax_minor'),bps===0)
    }
  }
  console.log(`PASS ${id}: first gross/net/VAT ${first}/${firstNet}/${first-firstNet}; renewal ${normal[3]}/${normal[4]}/${normal[3]-normal[4]}`)
}
assert.equal(collectedTax(1061,'1.00',1800),100)
assert.equal(collectedTax(1061,'1.00',undefined),100)
assert.throws(()=>collectedTax(1061,'10.62',1800),/exceeds/)
assert.throws(()=>collectedTax(1061,'bad',1800),/Invalid/)
for(const bps of [undefined,-1,1800.5,'1800',10001])for(const reported of [undefined,'0.00'])assert.throws(()=>collectedTax(1061,reported,bps),/mapping required/)
assert.equal(commission(809,1500),121)
assert.equal(commission(899,1500),135)
assert.equal(commission(5310,1500),797)
assert.equal(minor('9.55')-collectedTax(955,'0.00',1800),809)
console.log('PASS all eight IDs, first/renewal cents, zero/absent provider tax, positive tax precedence, refund zero handling, fail-closed mapping and Tier-1 commission')
