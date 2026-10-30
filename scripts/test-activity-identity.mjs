import assert from 'node:assert/strict'
import { build } from 'esbuild'

const compiled = await build({stdin:{resolveDir:process.cwd(),loader:'ts',contents:`
export * from './src/training/activityIdentity'
export * from './src/training/activityAdmissionIdentity'
export * from './src/training/getNextDueItem'
export * from './src/training/autoTrainingRoute'
export * from './src/training/curriculum/curriculumRuntime'
export * from './src/trainers/patternMate/m1LearnerCurriculum'
export * from './src/trainers/patternTactic/m1toM4LearnerCurriculum'
export * from './src/training/trainerCatalog'
`},bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'identity-db',setup(b){
 b.onResolve({filter:/lib\/supabase$/},()=>({path:'db',namespace:'test'}))
 b.onLoad({filter:/.*/,namespace:'test'},()=>({loader:'js',contents:`
 export const supabase={from(table){
  const filters=[];const q={select(){return q},eq(k,v){filters.push(r=>r[k]===v);return q},in(k,v){filters.push(r=>v.includes(r[k]));return q},
   maybeSingle:async()=>({data:globalThis.identityFixture.plan,error:null}),
   then(resolve,reject){const rows=table==='user_chunk_progress'?globalThis.identityFixture.rows:table==='auto_training_chunk_unlocks'?globalThis.identityFixture.ledger:[];return Promise.resolve({data:rows.filter(r=>filters.every(f=>f(r))),error:null}).then(resolve,reject)}};return q
 }};`}))
}}]})
const r=await import('data:text/javascript;base64,'+Buffer.from(compiled.outputFiles[0].text).toString('base64'))
const user='identity-test'
globalThis.identityFixture={rows:[],ledger:[],plan:{user_id:user,max_active_trainers:3,new_content_pace:'moderate',mates_weight:30,endgames_weight:25,board_vision_weight:20,openings_weight:15,master_games_weight:10}}
const past=new Date(Date.now()-86400000*2).toISOString(),future=new Date(Date.now()+86400000*5).toISOString()
const row=(trainer_key,extra={})=>({user_id:user,trainer_key,chunk_index:1,is_mastered:true,mastered_puzzles_count:30,next_review_at:past,...extra})
const due=async rows=>{globalThis.identityFixture.rows=rows;return r.getNextDueReviewItem(user,async()=>true)}

for(let d=1;d<=5;d++) for(const v of ['full-precut-v1',`m${d}-v1`]) {
 const key=`back-rank-mate-${d}`;assert.equal(r.logicalActivityKey(`${key}:${v}`),key)
}
for(let d=1;d<=4;d++) for(const v of ['full-precut-v1','verified-final-v1','semantic-v2','semantic-v3','semantic-v4','semantic-v5','v1']) {
 const key=`tactic-bishop-fork-m${d}`;assert.equal(r.logicalActivityKey(`${key}:m${d}-${v}`),key)
 assert.ok(r.activityReadKeys(key).includes(`${key}:m${d}-${v}`))
}
for(const key of ['master-mates:1:anastasia','master-tactics:2:bishop-fork','master-tactics:1:mixed','tactic-mixed-m1:mixed-v3:unlocked:blind','mixed-mate-1:full-precut-v1:mixed-v2:unlocked','back-rank-mate-1:unknown-v9','back-rank-mate-1:m2-v1','tactic-bishop-fork-m1:m2-full-precut-v1','opening:family:full-precut-v1','other:back-rank-mate-1:full-precut-v1']) {
 assert.equal(r.logicalActivityKey(key),key,`never strip structural/unknown suffix: ${key}`)
}
assert.equal(r.sameLogicalActivity('hook-mate-1:full-precut-v1','hook-mate-2'),false)
assert.equal(r.sameLogicalActivity('tactic-rook-fork-m1:m1-v1','tactic-bishop-fork-m1'),false)
assert.equal(r.sameLogicalActivity('master-mates:1:anastasia','anastasia-mate-1'),false)
console.log('PASS known suffix/depth allowlist; Master/Mixed/unknown keys and distinct names do not collide')

let item=await due([row('back-rank-mate-1:full-precut-v1')])
assert.equal(item.trainerKey,'back-rank-mate-1');assert.equal(item.chunkIndex,0)
assert.equal(item.progressTrainerKey,'back-rank-mate-1:full-precut-v1')
assert.equal(item.learnerCurriculumVersion,'full-precut-v1')
assert.equal(r.getTrainerByKey(item.progressTrainerKey).route,'/mates/m1/back-rank')
assert.equal(r.getM1LearnerProgressTrainerKey(item.progressTrainerKey),item.progressTrainerKey,'no double suffix when exact current key is passed')
const decision=await r.getCurriculumDecisionForUser(user,{
 getState:async()=>null,getSelectionIndex:async()=>0,getDepthSelectionIndex:async()=>0,getTacticThemeSelectionIndices:async()=>({1:0,2:0,3:0,4:0}),getM1LearnerCompletion:async()=>({}),getDueReviewItem:async()=>item,
 getLegacyItem:async()=>{throw Error('due review must win')},
})
const url=new URL(r.buildAutoTrainingRoute(decision),'https://test.invalid')
assert.equal(url.pathname,'/mates/m1/back-rank');assert.equal(url.searchParams.get('chunk'),'0')
assert.equal(url.searchParams.get('autoKey'),'back-rank-mate-1')
assert.equal(url.searchParams.get('autoProgressKey'),item.progressTrainerKey)
assert.equal(url.searchParams.get('learnerCurriculum'),'full-precut-v1')
console.log('PASS real due helper → curriculum due precedence → exact first chunk + versioned route/bookmark metadata')

item=await due([row('tactic-bishop-fork-m1:m1-full-precut-v1',{chunk_index:3})])
assert.equal(item.route,'/tactics/m1/bishop-fork');assert.equal(item.chunkIndex,2)
assert.equal(item.learnerCurriculumVersion,'m1-full-precut-v1')
assert.equal(r.getPatternTacticLearnerProgressTrainerKey(item.progressTrainerKey),item.progressTrainerKey)
assert.equal(await due([row('back-rank-mate-1:unknown-v9')]),null)
assert.equal(await due([row('back-rank-mate-1:m1-v1'),row('back-rank-mate-1:full-precut-v1',{next_review_at:future})]),null,'exact current chunk schedule supersedes old alias schedule')
assert.equal((await due([row('back-rank-mate-1:m1-v1'),row('back-rank-mate-1:full-precut-v1')])).progressTrainerKey,'back-rank-mate-1:full-precut-v1')
console.log('PASS Tactic revisions, one-based storage conversion, exact-current schedule precedence, unknown revision rejected')
item=await due([row('anastasia-mate-in-3:full-precut-v1')])
assert.equal(item.route,'/mates/m3/anastasia');assert.equal(item.chunkIndex,0)
assert.equal(r.logicalActivityKey('anastasia-mate-in-3:full-precut-v1'),'anastasia-mate-3')
assert.equal(r.getTrainerByKey('anastasia-mate-in-3:full-precut-v1').route,item.route)
assert.ok(r.activityReadKeys('anastasia-mate-3').includes('anastasia-mate-in-3:full-precut-v1'))

const unit={course:'pattern',trainerKey:'tactic-bishop-fork-m1:m1-full-precut-v1',unitKey:'1'}
assert.equal(r.existingAdmissionKey(unit,[],[row('tactic-bishop-fork-m1:m1-semantic-v2')]),'tactic-bishop-fork-m1:m1-semantic-v2')
assert.equal(r.existingAdmissionKey(unit,[],[row('tactic-bishop-fork-m1:m1-v1',{is_mastered:false,mastered_puzzles_count:0,next_review_at:null})]),unit.trainerKey,'empty loader rows do not unlock')
assert.equal(r.existingAdmissionKey(unit,[],[row('tactic-bishop-fork-m1:m1-v1',{chunk_index:2})]),unit.trainerKey,'other chunk is not exemption evidence')
assert.equal(r.existingAdmissionKey(unit,[],[row('tactic-rook-fork-m1:m1-v1')]),unit.trainerKey)
assert.equal(r.existingAdmissionKey(unit,[{trainer_key:unit.trainerKey,unit_key:'1'}],[row('tactic-bishop-fork-m1:m1-v1')]),unit.trainerKey,'existing current ledger wins')
globalThis.identityFixture.rows=[row('tactic-bishop-fork-m1:m1-semantic-v2')]
assert.equal(await r.readAdmissionActivityKey(user,unit),'tactic-bishop-fork-m1:m1-semantic-v2')
assert.equal(await r.readAdmissionActivityKey('different-user',unit),unit.trainerKey,'history query is account scoped')
assert.equal(await r.readAdmissionActivityKey(user,{...unit,unitKey:'2'}),unit.trainerKey)
console.log('PASS exact historical admission identity; no empty/other-unit/other-user exemption; new write identity unchanged')

// Logical lookup must not combine puzzle mastery from differently partitioned datasets.
const completion=r.getM1LearnerCompletionByTrainer([row('back-rank-mate-1:full-precut-v1')])['back-rank-mate-1']
assert.equal(completion.complete,false);assert.equal(completion.completedActiveChunks,1)
console.log('PASS existing course mastery criteria retained: one mastered chunk does not master the course')
assert.doesNotThrow(() => r.getPatternTacticLearnerCompletionByTrainer([row('tactic-bishop-fork-m1:m1-verified-final-v1')]), 'historical completion uses the existing prior-curriculum count helper')
