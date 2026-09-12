import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
const state={calls:0,user:'fixture',allowed:true,fail:false}
const result=await build({entryPoints:['src/training/autoChunkAllowance.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'isolated-account',setup(b){
 b.onResolve({filter:/lib\/supabase$/},()=>({path:'quota-db',namespace:'fixture'}))
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const supabase={auth:{getSession:async()=>({data:{session:{user:{id:globalThis.__quota.user}}}})},rpc:async()=>{globalThis.__quota.calls++;await new Promise(r=>setTimeout(r,2));return {data:globalThis.__quota.fail?null:{allowed:globalThis.__quota.allowed},error:null}}}` ,loader:'js'}))
}}]})
globalThis.__quota=state
globalThis.window=new EventTarget();window.location={pathname:'/mates/m1/back-rank',search:'?auto=1',origin:'http://fixture'}
const r=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'))
const unit={course:'pattern',trainerKey:'mate-back-rank',unitKey:'1'}
for(const path of ['/onboarding','/home','/manual','/analyze/board','/play-computer']){
 window.location.pathname=path;window.location.search='?auto=1&weekly=1'
 assert.equal(await r.admitAutoChunk(unit),true)
}
window.location.pathname='/mates/m1/back-rank';window.location.search=''
assert.equal(await r.admitAutoChunk(unit),true);assert.equal(state.calls,0,'Weekly/review/onboarding/Home/Manual/manual exercise do not claim')
window.location.search='?auto=1'
assert.equal(await r.admitAutoChunk(unit,()=>false),false);assert.equal(state.calls,0,'unmounted/prefetched loader cannot charge')
let active=true
const stale=r.admitAutoChunk(unit,()=>active);active=false
assert.equal(await stale,false);assert.equal(state.calls,0,'navigation during session lookup cannot charge')
assert.deepEqual(await Promise.all([r.admitAutoChunk(unit),r.admitAutoChunk(unit)]),[true,true]);assert.equal(state.calls,1,'same in-flight unit deduplicated')
assert.equal(r.carryAutoTraining('/openings/italian?family=italian'),'/openings/italian?family=italian&auto=1')
const stops=[];window.addEventListener(r.AUTO_ALLOWANCE_STOP,e=>stops.push(e.detail))
state.allowed=false;assert.equal(await r.admitAutoChunk({...unit,unitKey:'2'}),false);assert.equal(stops.at(-1).limited,true)
state.fail=true;assert.equal(await r.admitAutoChunk(unit),false);assert.equal(stops.at(-1).limited,false,'missing RPC fails closed, not unlimited')
assert.equal(r.AUTO_ALLOWANCE_TITLE,"Today's free training is complete.")
for (const file of ['src/trainers/patternMate/PatternMateTrainer.tsx','src/trainers/patternTactic/PatternTacticTrainer.tsx']) {
 const source=await readFile(file,'utf8')
 // Due-review hydration now reads persisted mastery without resetting it.
 // Admission must still precede the in-memory review setup, not a DB write.
 const admission = source.indexOf('await admitAutoChunk')
 const hydration = source.indexOf('let chunkReviewDue')
 const restored = source.indexOf('let restoredChunkProgress', hydration)
 assert.ok(admission >= 0 && hydration > admission && restored > hydration,
  'admission sees saved unlock evidence before review setup')
 const hydrationSource = source.slice(hydration, restored)
 assert.match(hydrationSource, /\.select\('is_mastered, review_stage, next_review_at'\)/)
 assert.doesNotMatch(hydrationSource, /\.(?:update|upsert|insert|delete|rpc)\s*\(/,
  'loading a due review must not reset mastery or advance scheduling')
}
console.log('PASS allowance client: exclusions, idempotent pending requests, continuation, cap, unavailable RPC, exact copy')
