import { supabase } from '../lib/supabase'
import { CURRICULUM_CATALOG, getStageThemes } from './curriculum/curriculumCatalog'
import { isMixedUnlocked } from './curriculum/curriculumMastery'
import { getM1LearnerCompletionByTrainer } from '../trainers/patternMate/m1LearnerCurriculum'
import { getM2ToM5LearnerCompletionByTrainer } from '../trainers/patternMate/m2toM5LearnerCurriculum'
import { getPatternTacticLearnerCompletionByTrainer } from '../trainers/patternTactic/m1toM4LearnerCurriculum'
import { loadMasterMateCatalog, MASTER_MATE_CHUNK_SIZE } from '../masterMates/data'
import { loadMasterTacticCatalog, MASTER_TACTIC_CHUNK_SIZE } from '../masterTactics/data'

export function mixedAutoRoute(route: string) {
 const match = route.split(/[?#]/)[0].match(/^\/(master-mates|master-tactics|mates|tactics)\/(?:m)?([1-5])\/mixed$/)
 return match ? { family: match[1], depth: Number(match[2]) } : null
}

type Chunk = { trainer_key: string; chunk_index: number; is_mastered?: boolean; mastered_puzzles_count?: number; next_review_at?: string | null }
type Theme = { area: string; stage_order: number; theme_key: string; permanent_mastery?: boolean }
export type AutoMixedEvidence = { chunks: Chunk[]; themes: Theme[] }
export type MasterAutoCourse = { theme: string; count: number; chunks: number }

export async function readAutoMixedEvidence(userId: string): Promise<AutoMixedEvidence> {
 const readChunks = async () => {
  const rows: Chunk[] = []
  for (let from = 0; ; from += 1000) {
   const result = await supabase.from('user_chunk_progress').select('trainer_key,chunk_index,is_mastered,mastered_puzzles_count,next_review_at')
    .eq('user_id', userId).order('trainer_key').order('chunk_index').range(from, from + 999)
   if (result.error) throw new Error('Mixed prerequisites could not be verified.')
   rows.push(...(result.data ?? []))
   if (!result.data || result.data.length < 1000) return rows
  }
 }
 const [chunks, themes] = await Promise.all([
  readChunks(),
  supabase.from('user_curriculum_theme_progress').select('area,stage_order,theme_key,permanent_mastery').eq('user_id', userId),
 ])
 if (themes.error) throw new Error('Mixed prerequisites could not be verified.')
 return { chunks, themes: themes.data ?? [] }
}

/** Use the existing catalog order, not an arbitrary fallback or an unmastered Mixed pool. */
export async function readMasterAutoCourses(family: string, depth: number): Promise<MasterAutoCourse[]> {
 const mates = family === 'master-mates'
 const catalog = mates ? await loadMasterMateCatalog() : await loadMasterTacticCatalog()
 const counts: Record<string, number> = mates
  ? (catalog as Awaited<ReturnType<typeof loadMasterMateCatalog>>).distances[String(depth)] ?? {}
  : { ...(catalog as Awaited<ReturnType<typeof loadMasterTacticCatalog>>).tactics[String(depth)]?.themes,
      mixed: (catalog as Awaited<ReturnType<typeof loadMasterTacticCatalog>>).mixed[String(depth)]?.count ?? 0 }
 const ordered = CURRICULUM_CATALOG.filter(item => item.available && item.area === (mates ? 'mates' : 'tactics') && item.variantLevel === depth && !item.isMixed)
  .map(item => item.route.split('/').slice(3).join('-'))
 const names = [...new Set(ordered)].filter(theme => counts[theme] > 0)
 // Only known focused curriculum themes are eligible; empty catalogs fail closed.
 return [...names, 'mixed'].filter(theme => counts[theme] > 0)
  .map(theme => ({ theme, count: counts[theme], chunks: Math.ceil(counts[theme] / (mates ? MASTER_MATE_CHUNK_SIZE : MASTER_TACTIC_CHUNK_SIZE)) }))
}

function masteredChunks(evidence: AutoMixedEvidence, key: string) {
 return new Set(evidence.chunks.filter(row => row.trainer_key === key && row.is_mastered === true).map(row => row.chunk_index))
}

export function chooseMasterAutoCourse(family: string, depth: number, courses: MasterAutoCourse[], evidence: AutoMixedEvidence) {
 const focused = courses.filter(course => course.theme !== 'mixed' && course.chunks > 0)
 const complete = (course: MasterAutoCourse) => {
  const chunks = masteredChunks(evidence, `${family}:${depth}:${course.theme}`)
  return Array.from({ length: course.chunks }, (_, i) => i + 1).every(index => chunks.has(index))
 }
 const area = family === 'master-mates' ? 'mates' : 'tactics'
 const unlocked = isMixedUnlocked(area, focused.map(c => c.theme), {
  rating: 0, themeMastery: { [area]: Object.fromEntries(focused.map(c => [c.theme, { mastered: complete(c) }])) },
 })
 const selected = (unlocked ? courses.find(c => c.theme === 'mixed') : null) ?? focused.find(c => !complete(c))
 if (!selected) return null
 const key = `${family}:${depth}:${selected.theme}`
 const mastered = masteredChunks(evidence, key)
 const first = Array.from({length:selected.chunks},(_,i)=>i).find(index=>!mastered.has(index+1)) ?? 0
 return { route: `/${family}/${depth}/${selected.theme}`, trainerKey: key, chunkIndex: first,
  ...(selected.theme === 'mixed' ? { mixedPrerequisitesVerified: true as const } : {}) }
}

export async function isAutoMixedEligible(userId: string, route: string, evidence?: AutoMixedEvidence, courses?: MasterAutoCourse[]) {
 const mixed = mixedAutoRoute(route)
 if (!mixed) return true
 const state = evidence ?? await readAutoMixedEvidence(userId)
 const { family, depth } = mixed
 if (family.startsWith('master-')) {
  const choice = chooseMasterAutoCourse(family, depth, courses ?? await readMasterAutoCourses(family, depth), state)
  return choice?.mixedPrerequisitesVerified === true
 }
 const area = family as 'mates' | 'tactics'
 const stage = Math.min(depth, 4)
 const completion = area === 'mates'
  ? { ...getM1LearnerCompletionByTrainer(state.chunks), ...getM2ToM5LearnerCompletionByTrainer(state.chunks) }
  : getPatternTacticLearnerCompletionByTrainer(state.chunks)
 const progress = Object.fromEntries(state.themes.filter(t => t.area === area && t.stage_order === stage)
  .map(t => [t.theme_key, { mastered: t.permanent_mastery === true }]))
 for (const item of CURRICULUM_CATALOG.filter(item => item.area === area && item.stageOrder === stage && !item.isMixed)) {
  const done = completion[item.trainerKey]
  // An empty/unavailable course (0 of 0 chunks) is not mastery evidence.
  if (item.theme && done?.complete && done.completedActiveChunks > 0) progress[item.theme] = { mastered: true }
 }
 return isMixedUnlocked(area, getStageThemes(area, stage), { rating: 0, themeMastery: { [area]: progress } })
}

export async function masterAutoActivity(userId: string, family: string, depth: number) {
 const [courses, evidence] = await Promise.all([readMasterAutoCourses(family, depth), readAutoMixedEvidence(userId)])
 return chooseMasterAutoCourse(family, depth, courses, evidence)
}

/** Shared by legacy recommendations/due summaries as well as Auto fallbacks. */
export function autoMixedEligibilityFilter(userId: string) {
 let evidence: Promise<AutoMixedEvidence> | undefined
 const checks = new Map<string, Promise<boolean>>()
 return (item: { route: string }): Promise<boolean> => {
  if (!mixedAutoRoute(item.route)) return Promise.resolve(true)
  if (!checks.has(item.route)) {
   evidence ??= readAutoMixedEvidence(userId)
   checks.set(item.route, evidence.then(state => isAutoMixedEligible(userId, item.route, state)).catch(() => false))
  }
  return checks.get(item.route)!
 }
}
