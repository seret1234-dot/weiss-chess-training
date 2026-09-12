import { requestMasterPuzzleData } from '../masterPuzzles/dataSource'
import type { PatternTacticDataSource, PatternTacticMasterProvenance, PatternTacticSourcePuzzle } from '../trainers/patternTactic/PatternTacticTrainer'

export type MasterTacticDistance = 1 | 2 | 3 | 4
export type MasterTacticRef = { id: string; chunk: number }
export type MasterTacticIndex = { distance: MasterTacticDistance; theme?: string; refs: MasterTacticRef[] }
export type MasterTacticCatalog = {
 schemaVersion: number
 canonicalPuzzleCount: number
 tactics: Record<string, { count: number; themes: Record<string, number> }>
 mixed: Record<string, { count: number }>
}

type MasterCanonicalPuzzle = {
 id: string
 fen: string
 learnerSide: 'w' | 'b'
 learningDistance: MasterTacticDistance
 primaryTheme: string | null
 secondaryMotifs: string[]
 solution: { offset: number; side: 'learner' | 'opponent'; uci: string; san?: string }[]
 acceptedLearnerMoves: { plyOffset: number; canonicalMove: string; acceptedEquivalentMoves: string[] }[]
 equivalentOpponentDefenses: { plyOffset: number; canonicalMove: string; equivalentDefenses: string[] }[]
 provenance: PatternTacticMasterProvenance
}

type MasterCanonicalChunk = { puzzles: MasterCanonicalPuzzle[] }
type CourseGroup = { fileName: string; refs: MasterTacticRef[] }
export const MASTER_TACTIC_CHUNK_SIZE = 30

export function masterTacticDistanceLabel(distance: MasterTacticDistance) {
 return `Tactic in ${distance === 4 ? '4+' : distance}`
}

export function masterTacticIndexFile(distance: MasterTacticDistance, theme: string) {
 return theme === 'mixed' ? `indexes/mixed-distance-${distance}.json` : `indexes/tactics-course-${distance}-${theme}.json`
}

export async function loadMasterTacticCatalog() {
 return requestMasterPuzzleData<MasterTacticCatalog>('catalog.json')
}

export async function loadMasterTacticIndex(distance: MasterTacticDistance, theme: string) {
 return requestMasterPuzzleData<MasterTacticIndex>(masterTacticIndexFile(distance, theme))
}

function createCourseGroups(refs: MasterTacticRef[]) {
 const groups: CourseGroup[] = []
 for (let start = 0; start < refs.length; start += MASTER_TACTIC_CHUNK_SIZE) {
  groups.push({ fileName: `master-tactics-course-${String(groups.length + 1).padStart(4, '0')}.json`, refs: refs.slice(start, start + MASTER_TACTIC_CHUNK_SIZE) })
 }
 return groups
}

function toPatternTacticPuzzle(puzzle: MasterCanonicalPuzzle, theme: string, chunkNumber: number, chunkIndex: number): PatternTacticSourcePuzzle {
 const solution = [...puzzle.solution].sort((a, b) => a.offset - b.offset)
 const learnerMoves = solution.map((entry, index) => ({ entry, index })).filter(({ entry }) => entry.side === 'learner')
 return {
  id: puzzle.id,
  sourcePuzzleId: puzzle.id,
  fen: puzzle.fen,
  sourceFen: puzzle.fen,
  displayedFen: puzzle.fen,
  solutionLine: solution.map((entry) => entry.uci),
  userMoveIndexes: learnerMoves.map(({ index }) => index),
  acceptedEquivalentMovesByUserMove: learnerMoves.map(({ entry }) => {
   const evidence = puzzle.acceptedLearnerMoves.find((move) => move.plyOffset === entry.offset)
   return [...new Set([entry.uci, evidence?.canonicalMove, ...(evidence?.acceptedEquivalentMoves ?? [])].filter(Boolean) as string[])]
  }),
  equivalentOpponentDefenses: puzzle.equivalentOpponentDefenses,
  label: `Master Tactic · ${formatMasterTacticTheme(theme)}`,
  theme: formatMasterTacticTheme(theme),
  canonicalThemeKey: theme,
  canonicalThemeLabel: formatMasterTacticTheme(theme),
  sourceTheme: theme,
  sourceThemes: puzzle.secondaryMotifs,
  rawTags: puzzle.secondaryMotifs,
  chunkNumber,
  chunkIndex,
  puzzleId: puzzle.id,
  masterProvenance: puzzle.provenance,
 }
}

export function createMasterTacticCourseDataSource(distance: MasterTacticDistance, theme: string): PatternTacticDataSource {
 let groupsPromise: Promise<CourseGroup[]> | null = null
 const canonicalChunkCache = new Map<number, Promise<MasterCanonicalChunk>>()
 const loadGroups = async () => {
  if (!groupsPromise) groupsPromise = loadMasterTacticIndex(distance, theme).then((index) => {
   if (!Array.isArray(index.refs) || index.refs.length === 0) throw new Error(`No Master Tactics puzzles for ${distance}:${theme}`)
   return createCourseGroups(index.refs)
  })
  return groupsPromise
 }
 const loadCanonicalChunk = (chunk: number) => {
  let pending = canonicalChunkCache.get(chunk)
  if (!pending) {
   pending = requestMasterPuzzleData<MasterCanonicalChunk>(`puzzles/chunk-${String(chunk).padStart(5, '0')}.json`)
   canonicalChunkCache.set(chunk, pending)
  }
  return pending
 }
 return {
  async loadManifest() {
   const groups = await loadGroups()
   return { category: 'tactics', theme: `master-${theme}`, totalPuzzles: groups.reduce((total, group) => total + group.refs.length, 0), chunkSize: MASTER_TACTIC_CHUNK_SIZE, totalChunks: groups.length, files: groups.map((group) => group.fileName) }
  },
  async loadChunk(fileName) {
   const groups = await loadGroups()
   const groupIndex = groups.findIndex((group) => group.fileName === fileName)
   const group = groups[groupIndex]
   if (!group) throw new Error(`Unknown Master Tactics course chunk ${fileName}`)
   const payloads = await Promise.all([...new Set(group.refs.map((ref) => ref.chunk))].map(async (chunk) => [chunk, await loadCanonicalChunk(chunk)] as const))
   const puzzlesById = new Map(payloads.flatMap(([, payload]) => payload.puzzles.map((puzzle) => [puzzle.id, puzzle] as const)))
   return group.refs.map((ref, chunkIndex) => {
    const puzzle = puzzlesById.get(ref.id)
    if (!puzzle) throw new Error(`Master Tactic ${ref.id} is missing from canonical chunk ${ref.chunk}`)
    return toPatternTacticPuzzle(puzzle, theme, groupIndex + 1, chunkIndex)
   })
  },
 }
}

export function formatMasterTacticTheme(theme: string) {
 if (theme === 'mixed') return 'Mixed'
 if (theme === 'remove-the-defender') return 'Removing the Defender'
 return theme.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}
