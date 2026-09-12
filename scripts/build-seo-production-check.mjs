import {spawnSync} from 'node:child_process'
import assert from 'node:assert/strict'
// Local release verification only. Read already-public browser configuration;
// never retrieve backend credentials or change a Vercel environment setting.
const origin='https://weisschess.com'
async function read(url){const response=await fetch(url,{signal:AbortSignal.timeout(20000)});assert(response.ok,'Public resource unavailable');return response.text()}
const html=await read(origin),asset=html.match(/<script[^>]+src="([^"]+)"/)[1]
const url=new URL(asset,origin);assert.equal(url.origin,origin)
const script=await read(url)
const paypal=[...new Set([...script.matchAll(/["'](A[A-Za-z0-9_-]{65,100})["']/g)].map(m=>m[1]))]
assert.equal(paypal.length,1,'Expected exactly one published PayPal client ID; do not guess')
const anonymous=[...new Set([...script.matchAll(/["'](eyJ[A-Za-z0-9_.-]+)["']/g)].map(m=>m[1]))].filter(value=>{
 try{const claim=JSON.parse(Buffer.from(value.split('.')[1],'base64url'));return claim.role==='anon'&&claim.ref==='lahzgtcpbshmzsqoqswf'}catch{return false}
})
if(anonymous.length===0)anonymous.push(...new Set([...script.matchAll(/["'](sb_publishable_[A-Za-z0-9_-]+)["']/g)].map(m=>m[1])))
assert.equal(anonymous.length,1,'Expected the public anonymous project key, never a privileged key')
const masterBase='https://lahzgtcpbshmzsqoqswf.supabase.co/storage/v1/object/public/master-puzzles/v1/v1'
// Bundle placement/tree-shaking is not a configuration contract. Verify the
// approved public corpus directly, and pass the same URL to the release build.
const catalog=JSON.parse(await read(masterBase+'/catalog.json'))
assert(catalog.schemaVersion&&catalog.tactics&&catalog.mixed&&catalog.canonicalPuzzleCount,'Approved public Master catalog must resolve')
const profile=JSON.parse(await read(origin+'/api/price-profile'))
assert.equal(typeof profile.affiliateCheckout,'boolean')
const publicBuild={VITE_SUPABASE_URL:'https://lahzgtcpbshmzsqoqswf.supabase.co',VITE_SUPABASE_ANON_KEY:anonymous[0],VITE_PAYPAL_CLIENT_ID:paypal[0],VITE_MASTER_PUZZLES_BASE_URL:masterBase,AFFILIATE_PROGRAM_ENABLED:String(profile.affiliateCheckout)}
console.log('Existing published frontend configuration verified. No backend credentials, settings changes or value logging.')
for(const args of [['node_modules/vite/bin/vite.js','build'],['scripts/generate-route-metadata-shells.mjs']]){
 const result=spawnSync(process.execPath,args,{env:{...process.env,...publicBuild},stdio:'inherit'})
 if(result.status!==0)process.exit(result.status||1)
}
