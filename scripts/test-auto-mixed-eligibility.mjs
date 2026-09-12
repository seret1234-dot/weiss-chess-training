import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runtime as r } from './test-auto-playable-resolution.mjs'
const empty = { chunks: [], themes: [] }
assert.equal(r.MIXED_THEME_MASTERY_THRESHOLD,1)
for(const area of ['mates','tactics']) {
 const themes=['a','b','c','d','e']
 for(const count of [0,4,5]) assert.equal(r.isMixedUnlocked(area,themes,{rating:600,themeMastery:{[area]:Object.fromEntries(themes.slice(0,count).map(t=>[t,{mastered:true}]))}}),count===5,`${area} ${count}/5 prerequisite`)
 assert.equal(r.isMixedUnlocked(area,[],{rating:600}),false,'unknown components fail closed')
}
const requiredMateThemes=r.getStageThemes('mates',1)
const focusedState={rating:600,activeStages:{mates:1},themeMastery:{mates:Object.fromEntries(requiredMateThemes.slice(0,-1).map(t=>[t,{mastered:true}]))}}
assert.equal(r.selectCurriculumItem({state:focusedState,area:'mates',selectionIndex:0}).theme,requiredMateThemes.at(-1),'curriculum chooses the remaining focused theme')
const completeState={...focusedState,themeMastery:{mates:Object.fromEntries(requiredMateThemes.map(t=>[t,{mastered:true}]))}}
assert.ok(r.selectCurriculumItem({state:completeState,area:'mates',selectionIndex:0}).route.endsWith('/mixed'),'curriculum unlocks Mixed after all themes')
assert.equal(r.isPlayableAutoRoute('/master-mates/1/kill-box'),false,'family browser is not an exercise')
assert.equal(r.isPlayableAutoRoute('/master-tactics/1/unknown-theme'),false,'unknown focused course is not playable')
const courses = ['bishop-fork','hanging-piece','pin','skewer','discovered-attack','mixed'].map(theme=>({theme,count:60,chunks:2}))
const mateCourses=['anastasia','back-rank','arabian','boden','smothered','mixed'].map(theme=>({theme,count:60,chunks:2}))
for(const family of ['master-mates','master-tactics']) for(const depth of [1,2,3,4]) {
 const route=`/${family}/${depth}/mixed`
 const almostNone={chunks:[{trainer_key:`${family}:${depth}:mixed`,chunk_index:1,is_mastered:false}],themes:[]}
 assert.equal(await r.isAutoMixedEligible('u',route,almostNone,courses),false,'opening Mixed does not unlock it')
 const basic=r.chooseMasterAutoCourse(family,depth,courses,almostNone)
 assert.equal(basic.route,`/${family}/${depth}/bishop-fork`)
 assert.equal(basic.chunkIndex,0)
 const partial={chunks:[{trainer_key:`${family}:${depth}:bishop-fork`,chunk_index:1,is_mastered:true}],themes:[]}
 assert.equal(r.chooseMasterAutoCourse(family,depth,courses,partial).chunkIndex,1,'resume first unmastered component chunk')
 const eighty={chunks:courses.slice(0,4).flatMap(c=>[1,2].map(chunk_index=>({trainer_key:`${family}:${depth}:${c.theme}`,chunk_index,is_mastered:true}))),themes:[]}
 assert.equal(await r.isAutoMixedEligible('u',route,eighty,courses),false,'80% / all except one stays locked')
 assert.equal(r.chooseMasterAutoCourse(family,depth,courses,eighty).route,`/${family}/${depth}/${courses[4].theme}`,'next unfinished focused course wins')
 const unlocked={chunks:courses.slice(0,5).flatMap(c=>[1,2].map(chunk_index=>({trainer_key:`${family}:${depth}:${c.theme}`,chunk_index,is_mastered:true}))),themes:[]}
 assert.equal(await r.isAutoMixedEligible('u',route,unlocked,courses),true,'100% required components unlocks Mixed')
 assert.equal(r.chooseMasterAutoCourse(family,depth,courses,unlocked).route,route)
 assert.equal(await r.isAutoMixedEligible('u',route,{...unlocked,chunks:unlocked.chunks.slice(1)},courses),false,'missing component chunk cannot count as theme mastery')
 assert.equal(await r.isAutoMixedEligible('u',route,empty,[]),false,'empty catalog fails closed')
}
for(const family of ['mates','tactics']) for(const depth of (family==='mates'?[1,2,3,4,5]:[1,2,3,4])) {
 const stage=Math.min(depth,4), route=`/${family}/m${depth}/mixed`, themes=r.getStageThemes(family,stage)
 assert.equal(await r.isAutoMixedEligible('u',route,empty),false)
 const mastered=[...new Set(themes)].map(theme_key=>({area:family,stage_order:stage,theme_key,permanent_mastery:true}))
 assert.equal(await r.isAutoMixedEligible('u',route,{chunks:[],themes:mastered.slice(0,Math.floor(mastered.length*.8))}),false,'80% stays locked')
 assert.equal(await r.isAutoMixedEligible('u',route,{chunks:[],themes:mastered}),true)
 const below=mastered.filter(t=>t.theme_key!==mastered[0].theme_key)
 assert.equal(await r.isAutoMixedEligible('u',route,{chunks:[],themes:below}),false,`${route}: below existing component threshold`)
}
const plan=r.buildPersonalTrainingPlan({detected_ratings:{rapid:605},daily_minutes:20})
const only=key=>({...plan,sections:plan.sections.map(s=>({...s,weight:s.key===key?100:0,eligible:true}))})
const foundation={source:'curriculum',route:'/tactics/m1/bishop-fork',trainerKey:'tactic-bishop-fork-m1',chunkIndex:0,selectionIndex:0,label:'Tactics',explanation:'Foundation'}
const deps={curriculum:async()=>foundation,opening:async()=>null,masterGame:async()=>null,
 masterPattern:async(_u,f,d)=>r.chooseMasterAutoCourse(f,d,f==='master-mates'?mateCourses:courses,empty),mixedEligible:async()=>false}
for(const key of ['masterMates','masterTactics']) {
 const before=structuredClone(only(key))
 const next=await r.resolvePlanAutoActivity(before,foundation,'u',0,[],deps)
 assert.equal(next.route,key==='masterMates'?'/master-mates/1/anastasia':'/master-tactics/1/bishop-fork')
 assert.deepEqual(before,only(key),'weights unchanged')
 assert.ok(!r.resolveAutoStartRoute({weeklyStatus:{status:'complete'},curriculumDecision:next}).includes('/mixed'))
}
for(const route of ['/mates/m1/mixed','/tactics/m1/mixed','/master-mates/1/mixed','/master-tactics/1/mixed']) {
 const locked={...foundation,source:'legacy',route}
 const next=await r.resolvePlanAutoActivity(only('openings'),locked,'u',0,[],deps)
 assert.ok(!next.route.includes('/mixed'),'legacy/fallback Mixed revalidated')
 assert.ok(!r.resolveAutoStartRoute({weeklyStatus:{status:'complete'},curriculumDecision:locked}).includes('/mixed'),'playable is not eligible at final navigation')
 const due=await r.resolvePlanAutoActivity(only('openings'),locked,'u',0,[],{...deps,mixedEligible:async()=>true})
 if(r.isPlayableAutoRoute(route)) {
  assert.equal(due.route,route,'genuinely unlocked available due item retains precedence')
  assert.ok(r.resolveAutoStartRoute({weeklyStatus:{status:'complete'},curriculumDecision:due}).includes('/mixed'))
 } else assert.ok(!due.route.includes('/mixed'),'unlock cannot resurrect an intentionally excluded legacy course')
}
console.log('PASS all four Mixed families/depths: 0%, 80%, all except one locked; 100% unlock; due precedence and unchanged weights')

// Real shipped catalogs, not just a hand-built list: next foundational course.
globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(await readFile('public'+new URL(url,'http://local.test').pathname,'utf8'))})
for(const family of ['master-mates','master-tactics']) for(const depth of [1,2,3,4]) {
 const actual=await r.readMasterAutoCourses(family,depth)
 const chosen=r.chooseMasterAutoCourse(family,depth,actual,empty)
 assert.ok(chosen && !chosen.route.endsWith('/mixed'))
 assert.equal(chosen.route,`/${family}/${depth}/${actual[0].theme}`)
 assert.equal(r.isPlayableAutoRoute(chosen.route),true)
 console.log(`PASS actual catalog novice: ${chosen.route}, chunk ${chosen.chunkIndex+1}`)
}

// Eligibility filters must retain the existing ordering of genuinely due items.
const rows=[
 {trainer_key:'mixed-mate-1',chunk_index:1,is_mastered:true,next_review_at:'2000-01-01T00:00:00Z'},
 {trainer_key:'back-rank-mate-1',chunk_index:1,is_mastered:true,next_review_at:'2001-01-01T00:00:00Z'},
]
let dueThemes=[]
globalThis.autoClient={from(table){const data=()=>table==='user_chunk_progress'?rows:dueThemes;const q={select(){return q},eq(){return q},order(){return q},range:async()=>({data:data()}),maybeSingle:async()=>({data:{mates_weight:30}}),then(resolve){return Promise.resolve({data:data()}).then(resolve)}};return q}}
assert.equal((await r.getNextDueReviewItem('u')).route,'/mates/m1/back-rank','default legacy lookup also blocks locked Mixed')
assert.equal((await r.getDueSummary('u')).nextItem.route,'/mates/m1/back-rank','summary cannot recommend locked Mixed')
const allDueThemes=r.getStageThemes('mates',1).map(theme_key=>({area:'mates',stage_order:1,theme_key,permanent_mastery:true}))
dueThemes=allDueThemes.slice(0,-1)
assert.equal((await r.getNextDueReviewItem('u')).route,'/mates/m1/back-rank','all except one cannot unlock a legacy review')
dueThemes=allDueThemes
assert.equal((await r.getNextDueReviewItem('u')).route,'/mates/m1/mixed','100% unlocked due review keeps priority')
for(const select of [r.getNextDueReviewItem,r.getNextDueItem]) {
 assert.equal((await select('u',async item=>!r.mixedAutoRoute(item.route))).route,'/mates/m1/back-rank','locked Mixed cannot hide the next eligible due review')
 assert.equal((await select('u',async()=>true)).route,'/mates/m1/mixed','unlocked Mixed review keeps original precedence')
}
console.log('PASS legacy due and fallback eligibility filtering preserves ordering')

const pages=[]
const largeProgress=Array.from({length:1001},(_,i)=>({trainer_key:'component',chunk_index:i+1,is_mastered:true,mastered_puzzles_count:30}))
globalThis.autoClient={from(table){const q={select(){return q},eq(){return q},order(){return q},range(from,to){pages.push([from,to]);return Promise.resolve({data:largeProgress.slice(from,to+1)})},then(resolve){return Promise.resolve({data:[]}).then(resolve)}};return q}}
assert.equal((await r.readAutoMixedEvidence('u')).chunks.length,1001,'mastered users beyond the API row limit retain all component evidence')
assert.deepEqual(pages,[[0,999],[1000,1999]])
console.log('PASS paginated component evidence read')
