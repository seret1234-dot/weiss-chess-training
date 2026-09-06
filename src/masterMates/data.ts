import type {
 PatternMateDataSource,
 PatternMateMasterProvenance,
 PatternMateSourcePuzzle,
} from '../trainers/patternMate/PatternMateTrainer'
import { requestMasterPuzzleData } from '../masterPuzzles/dataSource'

export const MASTER_MATE_THEMES = [
 'smothered', 'back-rank', 'arabian', 'anastasia', 'boden', 'hook', 'dovetail', 'double-bishop',
 'kill-box-adjacent-rook', 'kill-box-rook-rail', 'kill-box-queen-fence', 'mixed',
] as const

export type MasterMateTheme = typeof MASTER_MATE_THEMES[number]
export type MasterMateDistance = 1 | 2 | 3 | 4

export type MasterMateRef = { id: string; chunk: number; distance?: MasterMateDistance }
type MasterMateIndex = { schemaVersion: number; distance?: MasterMateDistance; theme?: MasterMateTheme; refs: MasterMateRef[] }

export type MasterMateCatalog = {
 schemaVersion: number
 inputCount: number
 primaryOrder: MasterMateTheme[]
 primaryTotals: Record<MasterMateTheme, number>
 distances: Record<string, Record<MasterMateTheme, number>>
 indexes: {
  byTheme: Record<MasterMateTheme, string>
  byDistanceAndTheme: Record<string, string>
 }
}

export type MasterCanonicalPuzzle = {
 id: string
 fen: string
 learnerSide: 'w' | 'b'
 learningDistance: MasterMateDistance
 solution: { offset: number; side: 'learner' | 'opponent'; uci: string; san?: string }[]
 acceptedLearnerMoves: { plyOffset: number; canonicalMove: string; acceptedEquivalentMoves: string[] }[]
 equivalentOpponentDefenses: { plyOffset: number; canonicalMove: string; equivalentDefenses: string[] }[]
 provenance: PatternMateMasterProvenance
}

type MasterCanonicalChunk = { puzzles: MasterCanonicalPuzzle[] }
type CourseGroup = { fileName: string; refs: MasterMateRef[] }

const MASTER_MATE_CHUNK_SIZE = 30

export function masterMateThemeIndexFile(distance: MasterMateDistance, theme: MasterMateTheme) {
 return `indexes/mates-theme-${distance}-${theme}.json`
}

export async function loadMasterMateCatalog() {
 return requestMasterPuzzleData<MasterMateCatalog>('indexes/mates-theme-catalog.json')
}

export async function loadMasterMateThemeIndex(distance: MasterMateDistance, theme: MasterMateTheme) {
 return requestMasterPuzzleData<MasterMateIndex>(masterMateThemeIndexFile(distance, theme))
}

function createCourseGroups(refs: MasterMateRef[]) {
 const groups: CourseGroup[] = []
 for (let start = 0; start < refs.length; start += MASTER_MATE_CHUNK_SIZE) {
  const groupNumber = groups.length + 1
  groups.push({
   fileName: `master-mates-course-${String(groupNumber).padStart(4, '0')}.json`,
   refs: refs.slice(start, start + MASTER_MATE_CHUNK_SIZE),
  })
 }
 return groups
}

function toPatternMatePuzzle(
 puzzle: MasterCanonicalPuzzle,
 theme: MasterMateTheme,
 chunkNumber: number,
 chunkIndex: number,
): PatternMateSourcePuzzle {
 const solution = [...puzzle.solution].sort((a, b) => a.offset - b.offset)
 const learnerMoves = solution
  .map((entry, index) => ({ entry, index }))
  .filter(({ entry }) => entry.side === 'learner')

 return {
  id: puzzle.id,
  fen: puzzle.fen,
  solutionLine: solution.map((entry) => entry.uci),
  userMoveIndexes: learnerMoves.map(({ index }) => index),
  acceptedEquivalentMovesByUserMove: learnerMoves.map(({ entry }) => {
   const evidence = puzzle.acceptedLearnerMoves.find((move) => move.plyOffset === entry.offset)
   return [...new Set([entry.uci, evidence?.canonicalMove, ...(evidence?.acceptedEquivalentMoves ?? [])].filter(Boolean))]
  }),
  label: `Master Mate · ${formatMasterMateTheme(theme)}`,
  theme: formatMasterMateTheme(theme),
  chunkNumber,
  chunkIndex,
  puzzleId: puzzle.id,
  masterProvenance: puzzle.provenance,
 }
}

export function createMasterMateCourseDataSource(distance: MasterMateDistance, theme: MasterMateTheme): PatternMateDataSource {
 let groupsPromise: Promise<CourseGroup[]> | null = null
 const canonicalChunkCache = new Map<number, Promise<MasterCanonicalChunk>>()

 const loadGroups = async () => {
  if (!groupsPromise) {
   groupsPromise = loadMasterMateThemeIndex(distance, theme).then((index) => {
    if (!Array.isArray(index.refs) || index.refs.length === 0) throw new Error(`No Master Mate puzzles for ${distance}:${theme}`)
    return createCourseGroups(index.refs)
   })
  }
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
   return {
    category: 'mates',
    theme: `master-${theme}`,
    totalPuzzles: groups.reduce((total, group) => total + group.refs.length, 0),
    chunkSize: MASTER_MATE_CHUNK_SIZE,
    totalChunks: groups.length,
    files: groups.map((group) => group.fileName),
   }
  },
  async loadChunk(fileName) {
   const groups = await loadGroups()
   const groupIndex = groups.findIndex((group) => group.fileName === fileName)
   const group = groups[groupIndex]
   if (!group) throw new Error(`Unknown Master Mate course chunk ${fileName}`)

   const chunkPayloads = await Promise.all(
    [...new Set(group.refs.map((ref) => ref.chunk))].map(async (chunk) => [chunk, await loadCanonicalChunk(chunk)] as const),
   )
   const puzzlesById = new Map(chunkPayloads.flatMap(([, payload]) => payload.puzzles.map((puzzle) => [puzzle.id, puzzle])))

   return group.refs.map((ref, chunkIndex) => {
    const puzzle = puzzlesById.get(ref.id)
    if (!puzzle) throw new Error(`Master Mate ${ref.id} is missing from canonical chunk ${ref.chunk}`)
    return toPatternMatePuzzle(puzzle, theme, groupIndex + 1, chunkIndex)
   })
  },
 }
}

export function formatMasterMateTheme(theme: MasterMateTheme) {
 const labels: Record<MasterMateTheme, string> = {
  smothered: 'Smothered',
  'back-rank': 'Back Rank',
  arabian: 'Arabian',
  anastasia: "Anastasia's Mate",
  boden: "Boden's Mate",
  hook: 'Hook',
  dovetail: 'Dovetail',
  'double-bishop': 'Double Bishop',
  'kill-box-adjacent-rook': 'Kill Box — Adjacent Rook',
  'kill-box-rook-rail': 'Kill Box — Rook Rail',
  'kill-box-queen-fence': 'Kill Box — Queen Fence',
  mixed: 'Mixed',
 }
 return labels[theme]
}

export function masterMateLabel(distance: MasterMateDistance) {
 return `Mate in ${distance === 4 ? '4+' : distance}`
}
