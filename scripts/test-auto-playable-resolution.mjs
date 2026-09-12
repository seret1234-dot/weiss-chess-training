import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { createRequire } from 'node:module'

const bundle = await build({ stdin: { contents: `
export * from './src/training/resolvePlanAutoActivity';
export * from './src/training/resolveAutoStartRoute';
export * from './src/training/autoPlayableRoute';
export * from './src/training/buildPersonalTrainingPlan';
export * from './src/training/curriculum/curriculumRuntime';
export * from './src/training/curriculum/selectCurriculumItem';
export * from './src/training/curriculum/curriculumCatalog';
export * from './src/training/curriculum/curriculumMastery';
export * from './src/training/autoMixedEligibility';
export * from './src/training/getNextDueItem';
`, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, platform: 'node', format: 'cjs', write: false, define: { 'import.meta.env': '{}' },
plugins: [{ name: 'no-live-database', setup(b) {
  b.onLoad({filter:/[\\/]OpeningTrainerPage\.tsx$/},()=>({contents:'export const canAutoTrainOpening = async()=>true',loader:'js'}))
  b.onLoad({filter:/[\\/]MasterGamesPage\.tsx$/},()=>({contents:'export const canAutoTrainMasterGame = async(id,max)=> !max || max>=2',loader:'js'}))
  b.onLoad({ filter: /[\\/]lib[\\/]supabase\.ts$/ }, () => ({ contents: `export const supabase = { rpc: (...args) => globalThis.autoClient.rpc(...args), from: (...args) => globalThis.autoClient.from(...args) }; export const getMasterGamePgnUrl = key => 'https://fixture.invalid/'+key`, loader: 'js' }))
} }] })
const mod = { exports: {} }
new Function('require','module','exports',bundle.outputFiles[0].text)(createRequire(import.meta.url), mod, mod.exports)
const r = mod.exports
const plan = r.buildPersonalTrainingPlan({ manual_current_rating: 800 })
const state = { rating: 800, activeStages: {}, difficultyCeilings: {}, themeMastery: {} }
const base = r.buildCurriculumDecision(r.selectCurriculumItem({ state, area: 'mates', selectionIndex: 0 }), 0)
const deps = {
  curriculum: async (_user, areas) => {
    const recommendation = r.selectCurriculumItem({ state, selectionIndex: 0, excludedAreas: r.CURRICULUM_AREAS.filter(area => !areas.includes(area)) })
    return recommendation ? r.buildCurriculumDecision(recommendation, 0) : null
  },
  opening: async () => ({ route: '/openings/personal-italian-line?libraryPractice=1', trainerKey: 'opening-personal-id' }),
  masterGame: async () => ({ route: '/master-games/731?libraryPractice=1', trainerKey: 'master-game-731' }),
  masterPattern: async (_user,family,depth) => r.chooseMasterAutoCourse(family,depth,[{theme:family==='master-mates'?'back-rank':'bishop-fork',count:30,chunks:1},{theme:'mixed',count:30,chunks:1}],{chunks:[],themes:[]}),
}
function only(key) { return { ...plan, sections: plan.sections.map(s => ({ ...s, weight: s.key === key ? 100 : 0, eligible: true })) } }
for (const key of ['boardVision','openings','tactics','masterTactics','endgames','masterMates','masterGames']) {
  const selectedPlan = only(key), before = structuredClone(selectedPlan)
  const result = await r.resolvePlanAutoActivity(selectedPlan, base, 'user', 0, [], deps)
  assert.ok(r.isPlayableAutoRoute(result.route), `${key}: ${result.route}`)
  const route = r.resolveAutoStartRoute({ weeklyStatus: { status: 'completed' }, curriculumDecision: result })
  assert.ok(r.isPlayableAutoRoute(route))
  assert.deepEqual(selectedPlan, before, 'resolution cannot alter weights, placement or priorities')
  if (['openings','masterGames','masterMates','masterTactics'].includes(key)) {
    assert.equal(result.curriculumDecisionId, undefined, 'no unrelated stage/evidence key survives')
    assert.equal(result.chunkIndex, key==='masterMates'||key==='masterTactics' ? 0 : null)
  }
  console.log(`PASS ${key} -> ${route.split('&')[0]}`)
}
const due = { ...base, source: 'legacy', route: '/mates/m1/back-rank', chunkIndex: 25 }
assert.equal(await r.resolvePlanAutoActivity(only('openings'), due, 'user', 0, [], deps), due, 'due review wins')
assert.match((await r.resolvePlanAutoActivity(only('tactics'), {...due,route:'/openings'},'user',0,[],deps)).route,/^\/openings\/personal-italian-line/, 'legacy section route resolves within its original selection, not a new plan slot')
for (const key of ['openings','masterGames']) {
  assert.equal(await r.resolvePlanAutoActivity(only(key), base, 'user', 0, [], { ...deps, opening: async()=>null, masterGame: async()=>null }), base, 'empty section uses existing eligible curriculum decision')
}
for (const route of ['/openings','/mates','/mates/m1','/tactics','/endgames','/endgame','/endgame-studies','/master-games','/master-games/my-library','/openings/my-openings','/openings/family/italian','/home','/manual','//other.test/openings/a']) {
  assert.equal(r.isPlayableAutoRoute(route), false, route)
  const resolved = r.resolveAutoStartRoute({ weeklyStatus: {status:'completed'}, curriculumDecision: {...base,route} })
  assert.ok(r.isPlayableAutoRoute(resolved), `canonical guard: ${route}`)
}
assert.match(r.resolveAutoStartRoute({weeklyStatus:{status:'due'},curriculumDecision:base}),/^\/play-computer\?weekly=1/)
assert.equal(r.resolveAutoStartRoute({weeklyStatus:{status:'completed',reviewRoute:'/analyze/board?weekly=1'},curriculumDecision:base}),'/analyze/board?weekly=1')

// Default production adapter: both saved rotation and profile/family resolution.
let calls = [], saved = true
globalThis.autoClient = {
  from(table) {
    if (table==='master_games') {
      const q={select(){return q},eq(){return q},maybeSingle(){return Promise.resolve({data:{pgn_storage_key:'model.pgn'}})}}
      return q
    }
    assert.equal(table,'opening_lines')
    const q = {select(){return q},not(){return q},order(){return q},range(){return Promise.resolve({data:[{id:'o',slug:'italian-a',name:'Italian Game',family:'Italian',family_slug:'italian',ply_count:6}]})}}
    return q
  },
  async rpc(name,args) {
    calls.push({name,args})
    if (name === 'next_user_opening') return { data: saved ? [{id:'saved-o',slug:'saved-line'}] : [] }
    if (name === 'next_user_master_game') return { data: saved ? [{id:71,slug:'saved-game'}] : [] }
    if (name === 'get_due_openings_in_family') return {data:[]}
    if (name === 'get_next_unmastered_opening_in_family') return {data:[{id:'matched-o',slug:'italian-personal-next'}]}
    if (name === 'search_master_games_flexible') return {data:[{id:89,slug:'italian-model',opening:'Italian Game'}]}
    throw Error(`unexpected RPC ${name}`)
  }
}
for (const key of ['openings','masterGames']) {
  const result = await r.resolvePlanAutoActivity(only(key),base,'user',0)
  assert.match(result.route,/saved-(line|game)/)
}
saved = false
const relevant = key => ({...only(key),sections:only(key).sections.map(s=>({...s,detectedOpenings:['e4 e5 Nf3 Nc6 Bc4'],preferredOpeningKeys:['e4 e5 Nf3 Nc6 Bc4']}))})
assert.match((await r.resolvePlanAutoActivity(relevant('openings'),base,'user',0)).route,/italian-personal-next/)
assert.match((await r.resolvePlanAutoActivity(relevant('masterGames'),base,'user',0)).route,/italian-model/)
const tooLong = relevant('masterGames')
tooLong.sections = tooLong.sections.map(s=>({...s,maxMasterGameMoves:1}))
assert.equal(await r.resolvePlanAutoActivity(tooLong,base,'user',0),base,'ineligible long new game uses existing curriculum fallback')
assert.ok(calls.some(c=>c.name==='get_next_unmastered_opening_in_family' && c.args.p_user_id==='user' && c.args.p_family_slug==='italian'))
assert.ok(calls.some(c=>c.name==='search_master_games_flexible' && c.args.p_opening==='italian'))
console.log('PASS all seven sections, due/Weekly precedence, fail-closed library guard, saved/profile lookups and curriculum fallback')
export const runtime = r
