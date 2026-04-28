export type UciMove = string

export interface PatternMatePuzzle {
  id: string
  fen: string
  preMove?: UciMove
  rating?: number
  label: string
  theme: string
  chunkNumber: number
  chunkIndex: number
  solutionLine: UciMove[]
  userMoveIndexes: number[]
}

export interface PatternMateChunkFile {
  puzzles: PatternMatePuzzle[]
}

export interface PatternMateManifest {
  category?: string
  theme?: string
  totalChunks: number
  chunkSize: number
  totalPuzzles: number
  files: string[]
}

export interface PatternMateTrainerProps {
  title: string
  manifestPath: string
  progressKey?: string
  supabaseCourseId?: string
  allowChunkNavigation?: boolean
}

export type TrainerStatus =
  | "idle"
  | "loading"
  | "ready"
  | "correct"
  | "wrong"
  | "complete"
  | "error"

export interface PatternMateProgressState {
  currentChunkIndex: number
  currentPuzzleIndex: number
  solvedPuzzleIds: string[]
  updatedAt: number
}

export interface NormalizedPatternMatePuzzle {
  id: string
  fen: string
  preMove?: UciMove
  rating: number
  label: string
  theme: string
  chunkNumber: number
  chunkIndex: number
  solutionLine: UciMove[]
  userMoveIndexes: number[]
}

export interface LoaderState {
  manifest: PatternMateManifest | null
  chunkPuzzles: NormalizedPatternMatePuzzle[]
  isManifestLoading: boolean
  isChunkLoading: boolean
  error: string | null
  chunkFileName: string | null
  totalChunks: number
  totalPuzzles: number
}

export interface GameState {
  status: TrainerStatus
  currentPuzzle: NormalizedPatternMatePuzzle | null
  displayFen: string | null
  expectedUserMove: string | null
  expectedUserSan: string | null
  solutionIndex: number
  userStepNumber: number
  feedback: string
  isBusy: boolean
  isComplete: boolean
  canMoveNext: boolean
  canMovePrev: boolean
}

export interface SupabaseProgressPayload {
  course_id: string
  chunk_index: number
  puzzle_index: number
  solved_count: number
  solved_ids: string[]
  updated_at: string
}