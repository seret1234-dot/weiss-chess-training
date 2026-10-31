import { useAutoChunkAdmission } from '../../training/useAutoChunkAdmission'
import { accountStorageKey } from '../../auth/accountBrowserStorage'
import { updateCategoryStats } from '../../training/updateCategoryStats'
import { useAccountStorageKey, useAccountIdentity } from '../../auth/AccountIdentityContext'
import { applyReviewOutcome, PUZZLE_MASTERY_RULES, SPACED_REPETITION_LADDER_DAYS } from '../../training/learningPlanRules'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createChunkCompletionGate } from '../chunkCompletionGate'
import type { CSSProperties, ReactNode } from 'react'
import { Chess } from 'chess.js'
import { hideCoachMistake, showCoachMistake } from '../../services/coach/coachPopup'
import type { Square } from 'chess.js'
import ThemedChessboard from "../../theme/ThemedChessboard"
import PromotionChooser, { type PromotionPiece } from '../../components/chess/PromotionChooser'
import AccessibleMoveInput from '../../components/chess/AccessibleMoveInput'
import ThemePiece from "../../theme/ThemePiece"
import { supabase } from '../../lib/supabase'
import {
 saveTrainingProgress,
 loadTrainingProgressMap,
} from '../../lib/trainingProgress'
import { useRegisterPlayableBoard } from '../../hooks/useRegisterPlayableBoard'
import { useAnimatedReplies } from '../../hooks/useAnimatedReplies'
import { useSearchParams } from 'react-router-dom'
import { useHierarchicalNavigation } from '../../navigation/useHierarchicalNavigation'
import TrainerShell from '../../components/trainer/TrainerShell'
import PuzzleTrainerPanel from '../../components/trainer/PuzzleTrainerPanel'
import { ChunkCompletionOverlay, DEBUG_CHUNK_COMPLETION_RESULT, isChunkCompletionDebugEnabled, isChunkCompletionDebugHost, shouldShowChunkCompletionOverlay, type ChunkCompletionResult } from '../ChunkCompletionOverlay'
import { buildNextActiveLearnerChunkUrl, getNextActiveLearnerChunkIndex } from '../activeChunkNavigation'
import { SiteExplanationBox } from '../../components/SiteExplanationBox'
import { siteExplanations } from '../../content/siteExplanations'
import type { SiteExplanationKey } from '../../content/siteExplanations'
import {
 BigMessage,
 HintButton,
 PanelCard,
 PrimaryButton,
 ProgressBar,
 SectionTitle,
 SecondaryButton,
 ShellInput,
} from '../../components/trainer/ui'

import { reportTrainingItemCompleted } from "../../lib/trainingQuotaEvents"
import { announceAutoTrainingComplete } from '../../training/autoTrainingRoute'
import {
 createCanonicalExerciseIdentity,
 getOrCreateMixedSessionPlan,
 getRecentMixedCanonicalIdentities,
 recordMixedCanonicalIdentity,
 type MixedSessionCandidate,
} from "../../training/mixedSessionSelector"
import {
 getBlindMixedUnlockStatus,
 formatMixedThemeName,
 normaliseMixedThemeKey,
 readRememberedMixedPhase,
 readRememberedMixedScope,
 recordIdentifiedMixedSessionEvidence,
 rememberMixedPhase,
 rememberMixedScope,
 shouldRevealMixedTheme,
 themesForMixedScope,
 type MixedSessionPhase,
 type MixedSessionScope,
} from "../../training/mixedSessionScope"
import { readCurriculumState } from "../../training/curriculum/curriculumPersistence"
import { recordNormalizedCurriculumCompletion } from "../../training/curriculum/curriculumCompletion"
import { getChunkProgressDisplay } from "../chunkProgressDisplay"
import { isFinalPuzzleCompletion, useCorrectPuzzleAutoAdvance, useWrongMoveReset, WRONG_MOVE_FEEDBACK, SILENT_ERROR_FEEDBACK } from "../puzzleProgression"
import { preparePuzzleStartPosition } from '../puzzleStartPosition'
import { puzzleSuccessFeedback } from '../puzzleSuccessFeedback'
import type { CurriculumState } from "../../training/curriculum/curriculumTypes"
import { getStageThemes } from "../../training/curriculum/curriculumCatalog"
import { isMixedUnlocked } from "../../training/curriculum/curriculumMastery"
import {
 getPatternTacticLearnerCurriculum,
 getPatternTacticLearnerCurriculaForDistance,
 getPatternTacticLegacyCompletionCredit,
 getPatternTacticPriorLearnerProgressTrainerKey,
 getPatternTacticPriorLearnerActiveChunkCount,
 getPatternTacticLearnerProgressTrainerKey,
 formatPatternTacticThemeLabel,
 resolvePatternTacticLearnerFacingChunkIndex,
} from "./m1toM4LearnerCurriculum"
import { fetchPatternTacticJson, resolvePatternTacticPublicAssetUrl } from "./patternTacticAssetPaths"
import {
 completeInitialPremove,
 sameChessPosition,
 verifyInitialPremove,
} from "./initialPremove"
import {
 createInteractiveTrainingSequence,
 getOpponentMovesBeforeNextRequiredLearnerMove,
} from "./trainingSequence"
import { FULL_CHUNK_CURRICULUM_VERSION } from "../fullChunkCurriculumCatalog"
import { VERIFIED_FINAL_RUNTIME_PATH } from "./generatedFinalVerifiedTaxonomy"
import { capLegacyCreditAtOpenChunk, createProgressionResetCoordinator, resetCurrentChunkProgressPersistence } from "../progressionRestart.mjs"
import { createCurrentChunkResetPlan } from "../chunkProgressReset.mjs"
import { nextPerfectSolveCount, PUZZLE_MOVE_LIMIT_MS, PUZZLE_RECOGNITION_LIMIT_MS, PuzzlePerfectionTracker } from "../puzzlePerfection"
import { useTimedMastery } from "../../accessibility/TimedMasteryContext"
import VoiceMoveInput from '../voice/VoiceMoveInput'
import { useTrainerInputMode } from '../voice/useTrainerInputMode'
import { submitVoiceMove, submitIllegalVoiceAnswer } from '../voice/submitVoiceMove'

export type PatternTacticManifestFile = {
 category?: string
 theme?: string
 subtheme?: string
 totalPuzzles?: number
 chunkSize?: number
 totalChunks?: number
  files?: string[]
  chunks?: Array<{ file: string; count?: number }>
 note?: string
 sourceThemes?: string[]
 canonicalThemeKey?: string
 canonicalThemeLabel?: string
 rawTags?: string[]
 pedagogicalFamily?: string
 semanticAudit?: {
  status?: string
  tier?: string
  confidence?: number
  reason?: string
  detectedTheme?: string | null
  evidence?: Record<string, unknown>
 }
 learnerCurriculum?: {
  canonicalIdentity?: string
  pedagogicalFamily?: string
 }
}

export type PatternTacticMasterProvenance = {
 masterGame: Record<string, string | number | null | undefined>
 historicalMoveSan?: string
 historicalMoveUci?: string
 sourceFen?: string
 sourcePly?: number
 learnerSide?: 'w' | 'b'
}

export type PatternTacticSourcePuzzle = {
 id?: string
 exerciseId?: string
 sourcePuzzleId?: string
 sourceFen?: string
 displayedFen?: string
 preMoveSideToMove?: 'w' | 'b'
 lichessId?: string
 localId?: string
 fen?: string
 moves?: string[]
 preMove?: string
 solution?: string | string[]
 solutionLine?: string[]
 userMoveIndexes?: number[]
 stage?: string
 label?: string
 theme?: string
 subtheme?: string
 rating?: number
 themes?: string[]
 rawTags?: string[]
 gameUrl?: string
 openingTags?: string[]
 source?: string
 canonicalSubtype?: string | null
 structuralValidation?: string
 engineValidation?: Record<string, unknown>
 provenance?: Record<string, unknown>
 sourceTheme?: string
 sourceThemeTag?: string
 sourceThemeKeys?: string[]
 sourceThemes?: string[]
 canonicalThemeKey?: string
 canonicalThemeLabel?: string
 pedagogicalFamily?: string
 semanticAudit?: PatternTacticManifestFile['semanticAudit']
 learnerCurriculum?: PatternTacticManifestFile['learnerCurriculum']
 puzzleId?: string
 chunk?: number
 chunkNumber?: number
 chunkIndex?: number
 positionInChunk?: number

 lichess_id?: string
 PuzzleId?: string
 FEN?: string
 solution_move?: string
 full_solution?: string
 Moves?: string
 Themes?: string
 chunk_number?: number
 orderInChunk?: number
 acceptedEquivalentMovesByUserMove?: string[][]
 equivalentOpponentDefenses?: { plyOffset: number; canonicalMove: string; equivalentDefenses: string[] }[]
 masterProvenance?: PatternTacticMasterProvenance
}

export type PatternTacticDataSource = {
 loadManifest: () => Promise<PatternTacticManifestFile>
 loadChunk: (fileName: string) => Promise<PatternTacticSourcePuzzle[]>
}

export type PatternTacticPuzzle = {
 id: string
 fen: string
 preMove?: string
 solutionLine: string[]
 userMoveIndexes: number[]
 interactiveTrainingSequence: ReturnType<typeof createInteractiveTrainingSequence>
 sourceFen: string
 displayedFen: string
 label: string
 theme: string
 chunkNumber: number
 chunkIndex: number
 rating?: number
 sourceTheme?: string
 canonicalThemeKey?: string
 canonicalThemeLabel?: string
 canonicalSubtype?: string | null
 rawTags?: string[]
 sourceIdentity?: string
 canonicalIdentity?: string
 pedagogicalFamily?: string
 semanticAudit?: PatternTacticSourcePuzzle['semanticAudit']
 acceptedEquivalentMovesByUserMove?: string[][]
 equivalentOpponentDefenses?: { plyOffset: number; canonicalMove: string; equivalentDefenses: string[] }[]
 masterProvenance?: PatternTacticMasterProvenance
}

type PuzzleMastery = {
 fastSolves: number
}


type Phase = 'loading' | 'solving' | 'correct' | 'wrong' | 'finished'

export type PatternTacticTrainerConfig = {
 trainerKey: string
 trainerTitle: string
 dataBasePath: string
 dataSource?: PatternTacticDataSource
 explanationKey?: SiteExplanationKey
 backHref?: string
 studyCourse?: string
 studyTheme?: string
 onPuzzleSolved?: (payload: {
 puzzleId: string
 wasFast: boolean
 solvedInSeconds: number | null
 course?: string
 theme?: string
 }) => void
 renderPuzzleInfo?: (puzzle: PatternTacticPuzzle | null, solved: boolean) => ReactNode
 renderBoardPlayerLabels?: (
  puzzle: PatternTacticPuzzle | null,
  orientation: 'white' | 'black',
 ) => { top: ReactNode; bottom: ReactNode } | null
}

type PieceCode =
 | 'wP'
 | 'wN'
 | 'wB'
 | 'wR'
 | 'wQ'
 | 'wK'
 | 'bP'
 | 'bN'
 | 'bB'
 | 'bR'
 | 'bQ'
 | 'bK'

const FAST_SOLVES_TO_MASTER = PUZZLE_MASTERY_RULES.qualifyingFastSolves
const TACTIC_CHUNK_REVIEW_INTERVALS_DAYS = SPACED_REPETITION_LADDER_DAYS

function addTacticReviewDays(date: Date, days: number) {
 const next = new Date(date)
 next.setDate(next.getDate() + days)
 return next
}

function isTacticChunkReviewDue(
 nextReviewAt: string | null | undefined,
 now = new Date()
) {
 if (!nextReviewAt) return false
 const dueTime = new Date(nextReviewAt).getTime()
 if (!Number.isFinite(dueTime)) return false

 const tomorrow = new Date(
 now.getFullYear(),
 now.getMonth(),
 now.getDate() + 1
 )
 return dueTime < tomorrow.getTime()
}

const BOARD_ANIMATION_MS = 140
const REPLY_PAUSE_AFTER_MS = 80
const PREMOVE_START_DELAY_MS = 320

type SavedState = {
 currentChunkIndex: number
 currentPuzzleIndex: number
 chunkProgressByFile: Record<string, number[]>
 resetChunkIndexes?: number[]
}

const PIECE_URLS: Record<PieceCode, string> = {
 wP: '/pieces/react-chessboard-default/wp.svg',
 wN: '/pieces/react-chessboard-default/wn.svg',
 wB: '/pieces/react-chessboard-default/wb.svg',
 wR: '/pieces/react-chessboard-default/wr.svg',
 wQ: '/pieces/react-chessboard-default/wq.svg',
 wK: '/pieces/react-chessboard-default/wk.svg',
 bP: '/pieces/react-chessboard-default/bp.svg',
 bN: '/pieces/react-chessboard-default/bn.svg',
 bB: '/pieces/react-chessboard-default/bb.svg',
 bR: '/pieces/react-chessboard-default/br.svg',
 bQ: '/pieces/react-chessboard-default/bq.svg',
 bK: '/pieces/react-chessboard-default/bk.svg',
}

function renderPieceImage(code: PieceCode, size: number) {
 return (
 <img
 src={PIECE_URLS[code]}
 alt={code}
 draggable={false}
 style={{
 width: size,
 height: size,
 display: 'block',
 userSelect: 'none',
 pointerEvents: 'none',
 }}
 />
 )
}

function normalizeUci(uci: string) {
 return uci.trim().toLowerCase().replace(/\s+/g, '')
}

function parseMovesArray(input?: string[]) {
 if (!input || !Array.isArray(input)) return []
 return input.map(normalizeUci).filter(Boolean)
}

function parseMovesString(input?: string) {
 if (!input) return []
 return input
 .split(/\s+/)
 .map(normalizeUci)
 .filter(Boolean)
}

function parseUci(uci: string) {
 return {
 from: uci.slice(0, 2),
 to: uci.slice(2, 4),
 promotion:
 uci.length === 5 ? (uci[4] as 'q' | 'r' | 'b' | 'n') : undefined,
 }
}

function normalizeThemeName(input?: string) {
 if (!input) return 'tactic'
 return input.replace(/_/g, ' ')
}

function normalizePuzzle(
 raw: PatternTacticSourcePuzzle,
 index: number,
): PatternTacticPuzzle | null {
 const fen = raw.fen || raw.FEN || ''

 const directSolutionLine = Array.isArray(raw.solutionLine)
 ? raw.solutionLine.map(normalizeUci).filter(Boolean)
 : []

 const directUserMoveIndexes = Array.isArray(raw.userMoveIndexes)
 ? raw.userMoveIndexes.filter((n) => Number.isInteger(n) && n >= 0)
 : []

 const fullSolutionFromArray = parseMovesArray(raw.moves)
 const fullSolutionFromString = parseMovesString(raw.full_solution || raw.Moves)

 const solutionFromArray = Array.isArray(raw.solution)
 ? parseMovesArray(raw.solution)
 : []
 const solutionFromString =
 typeof raw.solution === 'string' ? normalizeUci(raw.solution) : ''

 let solutionLine =
 directSolutionLine.length > 0
 ? directSolutionLine
 : fullSolutionFromArray.length > 0
 ? fullSolutionFromArray
 : fullSolutionFromString

 if (solutionLine.length === 0) {
 const fallbackMove = normalizeUci(
 solutionFromArray[0] || solutionFromString || raw.solution_move || ''
 )
 if (fallbackMove) {
 solutionLine = [fallbackMove]
 }
 }

 if (!fen || solutionLine.length === 0) return null

 const sourceIdentity = String(raw.sourcePuzzleId || raw.puzzleId || raw.lichessId || raw.lichess_id || raw.PuzzleId || raw.localId || raw.id || index + 1)
 let sourceFen = fen
 let displayedFen = fen
 let preMove = raw.preMove

 const isVerifiedRuntimeExercise = String(raw.provenance?.corpus ?? '').startsWith('verified-lichess-final-')
 const hasEmbeddedPremove = Boolean(raw.sourceFen || raw.displayedFen || raw.preMove)

 if (isVerifiedRuntimeExercise && !hasEmbeddedPremove) {
  throw new Error(`Missing embedded verified premove provenance for ${sourceIdentity}`)
 }

 if (hasEmbeddedPremove && raw.sourceFen && raw.displayedFen && raw.preMove) {
  const verifiedPremove = verifyInitialPremove({
   sourceFen: raw.sourceFen,
   displayedFen: raw.displayedFen,
   preMove: raw.preMove,
  })
  if (!sameChessPosition(verifiedPremove.displayedFen, fen)) {
   throw new Error(`Embedded verified premove provenance does not match runtime displayed FEN for ${sourceIdentity}`)
  }
  sourceFen = verifiedPremove.sourceFen
  displayedFen = verifiedPremove.displayedFen
  preMove = verifiedPremove.preMove
 } else if (isVerifiedRuntimeExercise) {
  throw new Error(`Incomplete embedded verified premove provenance for ${sourceIdentity}`)
 }

 const chunkNumber = raw.chunkNumber ?? raw.chunk ?? raw.chunk_number ?? 1
 const chunkIndex =
 raw.chunkIndex ??
 (raw.positionInChunk != null
 ? raw.positionInChunk - 1
 : raw.orderInChunk != null
 ? raw.orderInChunk - 1
 : index)

 const userMoveIndexes =
 directUserMoveIndexes.length > 0
 ? directUserMoveIndexes
 : (() => {
 const result: number[] = []

 const startsWithPreMove =
 !!raw.preMove &&
 solutionLine.length > 0 &&
 normalizeUci(solutionLine[0]) === normalizeUci(raw.preMove)

 const startIndex = startsWithPreMove ? 1 : 0

 for (let i = startIndex; i < solutionLine.length; i += 2) {
 result.push(i)
 }

 return result
 })()

 let interactiveTrainingSequence: ReturnType<typeof createInteractiveTrainingSequence>
 try {
  interactiveTrainingSequence = createInteractiveTrainingSequence({
   sourceSolutionLine: solutionLine,
   userMoveIndexes,
   stage: raw.stage,
  })
 } catch {
  return null
 }

 return {
 id: String(
 raw.localId ||
 raw.lichessId ||
 raw.lichess_id ||
 raw.PuzzleId ||
 raw.id ||
 index + 1
 ),
 label: raw.label || `Puzzle ${index + 1}`,
 theme: raw.theme
 ? normalizeThemeName(raw.theme)
 : normalizeThemeName(raw.subtheme || raw.Themes || 'tactic'),
 fen: sourceFen,
 displayedFen,
 sourceFen,
 preMove,
 solutionLine,
 userMoveIndexes,
  interactiveTrainingSequence,
 chunkNumber,
  chunkIndex,
  rating: raw.rating,
  sourceTheme: raw.canonicalThemeKey || raw.sourceThemeTag || raw.sourceTheme || raw.sourceThemeKeys?.[0] || raw.sourceThemes?.[0] || raw.themes?.[0] || raw.theme || 'tactic',
  canonicalThemeKey: typeof raw.canonicalThemeKey === 'string' && raw.canonicalThemeKey.trim()
   ? normaliseMixedThemeKey(raw.canonicalThemeKey, 'tactics')
   : undefined,
  canonicalThemeLabel: typeof raw.canonicalThemeLabel === 'string' && raw.canonicalThemeLabel.trim()
   ? raw.canonicalThemeLabel
   : typeof raw.canonicalThemeKey === 'string' && raw.canonicalThemeKey.trim()
   ? formatPatternTacticThemeLabel(normaliseMixedThemeKey(raw.canonicalThemeKey, 'tactics'))
   : undefined,
  canonicalSubtype: raw.canonicalSubtype,
  rawTags: raw.rawTags,
  sourceIdentity,
  pedagogicalFamily: raw.pedagogicalFamily ?? raw.learnerCurriculum?.pedagogicalFamily,
  semanticAudit: raw.semanticAudit,
  acceptedEquivalentMovesByUserMove: raw.acceptedEquivalentMovesByUserMove,
  equivalentOpponentDefenses: raw.equivalentOpponentDefenses,
  masterProvenance: raw.masterProvenance,
  }
}

function getMoveHighlightStyles(moveUci: string | null) {
 if (!moveUci) return {}

 const from = moveUci.slice(0, 2)
 const to = moveUci.slice(2, 4)

 return {
 [from]: {
 background:
 'radial-gradient(circle, rgba(255,255,0,0.18) 35%, rgba(255,255,0,0.38) 36%)',
 },
 [to]: {
 background:
 'radial-gradient(circle, rgba(255,255,0,0.18) 35%, rgba(255,255,0,0.38) 36%)',
 },
 }
}

function squareToCoords(
 square: string,
 boardSize: number,
 orientation: 'white' | 'black'
) {
 const fileIndex = square.charCodeAt(0) - 97
 const rankIndexFromWhiteTop = 8 - Number(square[1])
 const squareSize = boardSize / 8

 const left =
 orientation === 'white'
 ? fileIndex * squareSize
 : (7 - fileIndex) * squareSize

 const top =
 orientation === 'white'
 ? rankIndexFromWhiteTop * squareSize
 : (7 - rankIndexFromWhiteTop) * squareSize

 return { left, top, squareSize }
}

function getStorageKey(trainerKey: string) {
 return `pattern_tactic_progress_${trainerKey}_v1`
}

function getSavedState(storageKey: string): SavedState {
 try {
 const raw = localStorage.getItem(storageKey)
 if (!raw) {
 return {
 currentChunkIndex: 0,
 currentPuzzleIndex: 0,
 chunkProgressByFile: {},
 }
 }
 const parsed = JSON.parse(raw) as SavedState
 return {
 currentChunkIndex: parsed.currentChunkIndex ?? 0,
 currentPuzzleIndex: parsed.currentPuzzleIndex ?? 0,
 chunkProgressByFile: parsed.chunkProgressByFile ?? {},
 resetChunkIndexes: Array.isArray(parsed.resetChunkIndexes)
  ? parsed.resetChunkIndexes.filter((index) => Number.isInteger(index) && index >= 0)
  : [],
 }
 } catch {
 return {
 currentChunkIndex: 0,
 currentPuzzleIndex: 0,
 chunkProgressByFile: {},
 }
 }
}

function saveState(storageKey: string, state: SavedState) {
 localStorage.setItem(storageKey, JSON.stringify(state))
}

function getUserMoveCount(puzzle?: PatternTacticPuzzle | null) {
 return puzzle?.interactiveTrainingSequence.requiredLearnerMoves ?? 1
}

function getExpectedUserMove(
 puzzle: PatternTacticPuzzle | undefined,
 solvedUserMoveCount: number
) {
 if (!puzzle) return null
 const lineIndex = puzzle.interactiveTrainingSequence.userMoveIndexes[solvedUserMoveCount]
 if (lineIndex == null) return null
 return puzzle.solutionLine[lineIndex] ?? null
}

function getAcceptedUserMoves(
 puzzle: PatternTacticPuzzle | undefined,
 solvedUserMoveCount: number
) {
 const expected = getExpectedUserMove(puzzle, solvedUserMoveCount)
 const equivalents = puzzle?.acceptedEquivalentMovesByUserMove?.[solvedUserMoveCount] ?? []
 return [...new Set([expected, ...equivalents].filter((move): move is string => Boolean(move)).map((move) => move.toLowerCase()))]
}

function getOpponentReplyBeforeNextRequiredLearnerMove(
 puzzle: PatternTacticPuzzle | undefined,
 solvedUserMoveCount: number
) {
 if (!puzzle) return []
 return getOpponentMovesBeforeNextRequiredLearnerMove(
  puzzle.interactiveTrainingSequence,
  solvedUserMoveCount
 )
}

export default function PatternTacticTrainer({
 config,
}: {
 config: PatternTacticTrainerConfig
}) {
 const admitAutoChunk = useAutoChunkAdmission()
 const accountId = useAccountIdentity()
 const trainerExplanation = config.explanationKey ? siteExplanations[config.explanationKey] : null
 const { backToParent } = useHierarchicalNavigation()
 const { timedMasteryEnabled } = useTimedMastery()
 const { mode: inputMode, setMode: setInputMode, mouseEnabled, setAiReady } = useTrainerInputMode()
 const isMixedPatternTactic = /^tactic-mixed-m[1-4]$/.test(config.trainerKey)

 const containerRef = useRef<HTMLDivElement | null>(null)
 const preMoveTimerRef = useRef<number | null>(null)
 const solveStartedAtRef = useRef<number | null>(null)
 const perfectionTrackerRef = useRef(new PuzzlePerfectionTracker())
 const timedMasteryEnabledRef = useRef(timedMasteryEnabled)
 const currentUserMoveIndexRef = useRef(0)
 const chunkProgressRef = useRef<PuzzleMastery[]>([])
 const chunkCanBeCompletedRef = useRef(false)
 const chunkCompletionGateRef = useRef(createChunkCompletionGate())
 const chunkMasterySaveKeyRef = useRef<string | null>(null)
 const chunkMasteryPromiseRef = useRef<Promise<boolean> | null>(null)
 const progressionResetRef = useRef(createProgressionResetCoordinator())
 const chunkStartMarkerRef = useRef<string | null>(null)
 const { cancelCorrectAutoAdvance, scheduleCorrectAutoAdvance } = useCorrectPuzzleAutoAdvance()
 const { cancelWrongMoveReset, scheduleWrongMoveReset } = useWrongMoveReset()

 useEffect(() => {
  timedMasteryEnabledRef.current = timedMasteryEnabled
 }, [timedMasteryEnabled])

 const {
 lastMoveHighlight,
 replySquare,
 animatedReply,
 suppressBoardAnimation,
 clearReplyTimer,
 clearReplyEffects,
 playReplySequence,
 setLastMoveHighlight,
 } = useAnimatedReplies()

 const [searchParams] = useSearchParams()
 const debugChunkCompleteAllowed = isChunkCompletionDebugHost(window.location.hostname)
 const debugChunkCompleteRequested = isChunkCompletionDebugEnabled(window.location.hostname, searchParams.get('debugChunkComplete'))
 const requestedLearnerCurriculumVersion = searchParams.get("learnerCurriculum")
 const tacticLearnerCurriculum = getPatternTacticLearnerCurriculum(config.trainerKey)
 const tacticDistance = Math.max(1, Number(config.trainerKey.match(/m([1-4])$/)?.[1] ?? 1))
 const mixedUnavailableReason = null
 const mixedLearnerCurricula = isMixedPatternTactic
  ? getPatternTacticLearnerCurriculaForDistance(tacticDistance)
  : []
 const learnerCurriculumVersion = tacticLearnerCurriculum?.version ?? (isMixedPatternTactic ? FULL_CHUNK_CURRICULUM_VERSION : null)
 const isLearnerFacingRequest = requestedLearnerCurriculumVersion === learnerCurriculumVersion
 const progressTrainerKey = tacticLearnerCurriculum
  ? getPatternTacticLearnerProgressTrainerKey(tacticLearnerCurriculum)
  : config.trainerKey
 const activeDataBasePath = config.dataSource
  ? config.dataBasePath
  : isMixedPatternTactic
  ? `${VERIFIED_FINAL_RUNTIME_PATH}/mixed-m${tacticDistance}`
  : tacticLearnerCurriculum?.learnerDataBasePath ?? ''
 const urlChunkParam = searchParams.get('chunk')
 const requestedChunkIndex =
 urlChunkParam !== null && !isNaN(Number(urlChunkParam))
 ? Math.max(0, Number(urlChunkParam))
 : null
 const forcedChunkIndex = requestedChunkIndex === null
  ? null
  : resolvePatternTacticLearnerFacingChunkIndex(requestedChunkIndex, tacticLearnerCurriculum, isLearnerFacingRequest)
 const requestedMixedPhase = searchParams.get("mixedPhase") === "blind" ? "blind" : null

 const manifestFetchPath = activeDataBasePath
  ? resolvePatternTacticPublicAssetUrl(activeDataBasePath, 'manifest.json')
  : ''
 const [currentUserId, setCurrentUserId] = useState<string | null>(null)
 const [mixedScope, setMixedScope] = useState<MixedSessionScope>(() => readRememberedMixedScope(accountStorageKey(config.trainerKey, accountId)))
 const [mixedPhase, setMixedPhase] = useState<MixedSessionPhase>(() => requestedMixedPhase ?? readRememberedMixedPhase(accountStorageKey(config.trainerKey, accountId)))
  const [mixedScopeConfirmed, setMixedScopeConfirmed] = useState(!isMixedPatternTactic)
 const [mixedAvailableThemes, setMixedAvailableThemes] = useState<string[]>([])
 const [mixedCurriculum, setMixedCurriculum] = useState<CurriculumState | null>(null)
  const [mixedSessionThemes, setMixedSessionThemes] = useState<string[]>([])
 const [blindThemeRevealed, setBlindThemeRevealed] = useState(false)
 const mixedSessionEvidenceRef = useRef({ attempts: 0, correct: 0, themes: new Set<string>(), recordedPuzzleIds: new Set<string>() })
 // The curriculum adapter uses real first-attempt session outcomes, without
 // replacing the legacy fast-solve and quota persistence paths.
 const curriculumSessionEvidenceRef = useRef({ attempts: 0, correct: 0, hints: 0, solveMsTotal: 0, recordedPuzzleIds: new Set<string>() })
 const curriculumCompletionInFlightRef = useRef(false)
 const mixedPuzzleNeededHelpRef = useRef(false)
 const storageKey = useAccountStorageKey(getStorageKey(
  isMixedPatternTactic ? `${config.trainerKey}:mixed-v3:${mixedScope}:${mixedPhase}` : progressTrainerKey
 ))

 const [chunkFiles, setChunkFiles] = useState<string[]>([])
 const [currentChunkIndex, setCurrentChunkIndex] = useState(0)
 const mixedSessionIdRef = useRef<string | null>(null)

 const [puzzles, setPuzzles] = useState<PatternTacticPuzzle[]>([])
 const [loading, setLoading] = useState(true)
 const [loadError, setLoadError] = useState('')
 const [currentIndex, setCurrentIndex] = useState(0)

 const [game, setGame] = useState(new Chess())
 const [boardFen, setBoardFen] = useState(() => new Chess().fen())
 const [transitionCover, setTransitionCover] = useState<null | {
 fen: string
 orientation: 'white' | 'black'
 }>(null)

 function setGameAndBoardFen(nextGame: Chess) {
 setGame(nextGame)
 setBoardFen(nextGame.fen())
 }
 const [message, setMessage] = useState('Loading puzzles...')
 const [phase, setPhase] = useState<Phase>('loading')
 const [solved, setSolved] = useState(false)
 const [hintMoveUci, setHintMoveUci] = useState<string | null>(null)


 function advanceUserMoveIndex(nextIndex: number) {
 currentUserMoveIndexRef.current = nextIndex
 setHintMoveUci(null)
 }
 const [boardLocked, setBoardLocked] = useState(true)
 const [selectedSquare, setSelectedSquare] = useState<string | null>(null)
 const [pendingPromotion, setPendingPromotion] = useState<{
  sourceSquare: string
  targetSquare: string
  color: 'w' | 'b'
 } | null>(null)
 const [legalTargets, setLegalTargets] = useState<string[]>([])
 const [displayTurn, setDisplayTurn] = useState<'w' | 'b'>('w')
 const puzzleLearnerSideRef = useRef<'w' | 'b'>('w')
 const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>(
 'white'
 )
 const [jumpChunkInput, setJumpChunkInput] = useState('')
 const [curriculumCompletionCard, setCurriculumCompletionCard] = useState<(ChunkCompletionResult & {
  mixedPhase?: MixedSessionPhase
  includedThemes?: string[]
  blindUnlockProgress?: { qualifyingSessions: number; remainingSessions: number } | null
 }) | null>(null)
 const [completionOverlayDismissed, setCompletionOverlayDismissed] = useState(false)
 const [debugCompletionOverlayOpen, setDebugCompletionOverlayOpen] = useState(false)

 useEffect(() => {
  setDebugCompletionOverlayOpen(debugChunkCompleteRequested)
  if (debugChunkCompleteRequested) setCompletionOverlayDismissed(false)
 }, [debugChunkCompleteRequested])

 const [boardSize, setBoardSize] = useState(720)
 const [isDragging, setIsDragging] = useState(false)
 const [isHandleHovered, setIsHandleHovered] = useState(false)
 const [disableBoardAnimation, setDisableBoardAnimation] = useState(false)

 const [correctSquare, setCorrectSquare] = useState<string | null>(null)

 const [chunkProgress, setChunkProgress] = useState<PuzzleMastery[]>([])
 const [restartingProgression, setRestartingProgression] = useState(false)

 const currentChunkFileName = chunkFiles[currentChunkIndex] || ''
 const completionOverlayResult = debugCompletionOverlayOpen
  ? DEBUG_CHUNK_COMPLETION_RESULT
  : curriculumCompletionCard
 const showingDebugCompletionOverlay = debugCompletionOverlayOpen

 function goToNextActiveLearnerChunk() {
  const nextChunkIndex = getNextActiveLearnerChunkIndex(currentChunkIndex, chunkFiles.length)
  if (nextChunkIndex === null || loading) return

  const nextUrl = buildNextActiveLearnerChunkUrl(
   window.location.pathname,
   window.location.search,
   nextChunkIndex,
   learnerCurriculumVersion,
  )

  window.history.replaceState(window.history.state, '', nextUrl)
  setDebugCompletionOverlayOpen(false)
  setCompletionOverlayDismissed(true)
  void loadChunkByIndex(nextChunkIndex, undefined, 0)
 }

 const customPieces = {
 wP: ({ squareWidth }: { squareWidth: number }) =>
 renderPieceImage('wP', squareWidth),
 wN: ({ squareWidth }: { squareWidth: number }) =>
 renderPieceImage('wN', squareWidth),
 wB: ({ squareWidth }: { squareWidth: number }) =>
 renderPieceImage('wB', squareWidth),
 wR: ({ squareWidth }: { squareWidth: number }) =>
 renderPieceImage('wR', squareWidth),
 wQ: ({ squareWidth }: { squareWidth: number }) =>
 renderPieceImage('wQ', squareWidth),
 wK: ({ squareWidth }: { squareWidth: number }) =>
 renderPieceImage('wK', squareWidth),
 bP: ({ squareWidth }: { squareWidth: number }) =>
 renderPieceImage('bP', squareWidth),
 bN: ({ squareWidth }: { squareWidth: number }) =>
 renderPieceImage('bN', squareWidth),
 bB: ({ squareWidth }: { squareWidth: number }) =>
 renderPieceImage('bB', squareWidth),
 bR: ({ squareWidth }: { squareWidth: number }) =>
 renderPieceImage('bR', squareWidth),
 bQ: ({ squareWidth }: { squareWidth: number }) =>
 renderPieceImage('bQ', squareWidth),
 bK: ({ squareWidth }: { squareWidth: number }) =>
 renderPieceImage('bK', squareWidth),
 }

 useEffect(() => {
  supabase.auth.getSession().then(({ data }) => {
 setCurrentUserId(data.session?.user?.id ?? null)
 })

 const { data: listener } = supabase.auth.onAuthStateChange(
 (_event, session) => {
 setCurrentUserId(session?.user?.id ?? null)
 }
 )

 return () => {
 listener.subscription.unsubscribe()
 }
 }, [])

 useEffect(() => {
  if (!isMixedPatternTactic || !currentUserId) {
   setMixedCurriculum(null)
   return
  }

  let cancelled = false
  void readCurriculumState(currentUserId)
   .then((state) => {
    if (!cancelled) setMixedCurriculum(state?.curriculum ?? null)
   })
   .catch(() => {
    if (!cancelled) setMixedCurriculum(null)
   })

  return () => {
   cancelled = true
  }
 }, [currentUserId, isMixedPatternTactic])

 async function ensureChunkExists(userId: string, chunkNumber = 1) {
 try {
 const { data: existing, error: existingError } = await supabase
 .from('user_chunk_progress')
 .select('chunk_index')
 .eq('user_id', userId)
 .eq('trainer_key', progressTrainerKey)
 .eq('chunk_index', chunkNumber)
 .limit(1)

 if (existingError) {
 console.error('Could not check user_chunk_progress', existingError)
 return
 }

 if (existing && existing.length > 0) {
 return
 }

 const { error: insertError } = await supabase
 .from('user_chunk_progress')
 .insert({
 user_id: userId,
 trainer_key: progressTrainerKey,
 chunk_index: chunkNumber,
 mastered_puzzles_count: 0,
 is_mastered: false,
 review_stage: 0,
 last_reviewed_at: null,
 next_review_at: null,
 })

 if (insertError) {
 console.error('Could not create initial chunk row', insertError)
 } else {
 console.log('Created chunk row:', {
 trainerKey: progressTrainerKey,
 chunkIndex: chunkNumber,
 })
 }
 } catch (error) {
 console.error('Unexpected ensureChunkExists error', error)
 }
 }

 async function ensureNextChunkExists(userId: string, nextChunkNumber: number) {
 if (nextChunkNumber > chunkFiles.length) return
 await ensureChunkExists(userId, nextChunkNumber)
 }

 async function markCurrentChunkStarted() {
  if (!currentUserId) return
  const chunkNumber = currentChunkIndex + 1
  const markerKey = `${currentUserId}:${progressTrainerKey}:${chunkNumber}`
  if (chunkStartMarkerRef.current === markerKey) return

  await ensureChunkExists(currentUserId, chunkNumber)
  const { error } = await supabase
   .from('user_chunk_progress')
   .update({ started_at: new Date().toISOString() })
   .eq('user_id', currentUserId)
   .eq('trainer_key', progressTrainerKey)
   .eq('chunk_index', chunkNumber)

  if (error) {
   // The source deploy can precede the additive migration. Keep training
   // functional in that short window; blank rows still classify as new.
   if (error.message?.includes('started_at') && error.message?.includes('does not exist')) {
    chunkStartMarkerRef.current = markerKey
    return
   }
   console.error('Could not mark tactic chunk as started', error)
   return
  }
  chunkStartMarkerRef.current = markerKey
 }

 async function markChunkMastered(
 userId: string,
 chunkIndexZeroBased: number,
 masteredCount: number
): Promise<boolean> {
 try {
 const now = new Date()
 const nowIso = now.toISOString()
 const chunkNumber = chunkIndexZeroBased + 1

 const { data: existing, error: existingError } = await supabase
 .from('user_chunk_progress')
 .select('review_stage, next_review_at, mastered_at')
 .eq('user_id', userId)
 .eq('trainer_key', progressTrainerKey)
 .eq('chunk_index', chunkNumber)
 .maybeSingle()

 if (existingError) {
 console.error('Could not load tactic review stage', existingError)
 return false
 }

 const currentStage = Math.max(
 0,
 Math.min(
 TACTIC_CHUNK_REVIEW_INTERVALS_DAYS.length,
 Number(existing?.review_stage ?? 0)
 )
 )
 const reviewTransition = applyReviewOutcome(currentStage, 'perfect')
 const nextStage = reviewTransition.reviewStage
 const intervalDays = reviewTransition.intervalDays
 const nextReviewAt = addTacticReviewDays(now, intervalDays).toISOString()

 const { error } = await supabase.from('user_chunk_progress').upsert({
 user_id: userId,
 trainer_key: progressTrainerKey,
 chunk_index: chunkNumber,
 mastered_puzzles_count: masteredCount,
 is_mastered: true,
 mastered_at: existing?.mastered_at ?? nowIso,
 review_stage: nextStage,
 last_reviewed_at: nowIso,
 next_review_at: nextReviewAt,
 updated_at: nowIso,
 })

 if (error) {
 console.error('Could not mark tactic chunk mastered', error)
 return false
 }

 const nextChunkNumber = chunkNumber + 1
 if (nextChunkNumber <= chunkFiles.length) {
 await ensureNextChunkExists(userId, nextChunkNumber)
 }

 return true
 } catch (error) {
 console.error('Unexpected markChunkMastered error', error)
 return false
 }
 }

function startChunkMasterySave(masteredCount: number) {
 const activityKey = `${currentUserId}:${progressTrainerKey}:${currentChunkIndex}`
 if (!chunkCompletionGateRef.current.canCommit(activityKey, chunkProgressRef.current.map(item => item.fastSolves), FAST_SOLVES_TO_MASTER)) return Promise.resolve(true)
 if (!currentUserId || !chunkCanBeCompletedRef.current || progressionResetRef.current.isResetting) {
 return Promise.resolve(true)
 }

 const saveKey = `${progressTrainerKey}:${currentChunkIndex}:${masteredCount}`
 if (
 chunkMasterySaveKeyRef.current === saveKey &&
 chunkMasteryPromiseRef.current
 ) {
 return chunkMasteryPromiseRef.current
 }

 chunkMasterySaveKeyRef.current = saveKey
 const promise = progressionResetRef.current.track(() => markChunkMastered(
 currentUserId,
 currentChunkIndex,
 masteredCount
 )).then((success) => {
 success = success === true
 if (success) {
 chunkCanBeCompletedRef.current = false
 } else {
 chunkMasterySaveKeyRef.current = null
 chunkMasteryPromiseRef.current = null
 }
 return success
 })

 chunkMasteryPromiseRef.current = promise
 return promise
 }

 useEffect(() => {
 if (!currentUserId) return
 void ensureChunkExists(currentUserId, 1)
 }, [currentUserId, progressTrainerKey])

 function persistProgress(
 nextChunkIndex: number,
 nextPuzzleIndex: number,
 nextChunkProgress: PuzzleMastery[],
 fileNameOverride?: string
 ) {
 if (progressionResetRef.current.isResetting) return
 const saved = getSavedState(storageKey)
 const fileName = fileNameOverride || currentChunkFileName
 if (!fileName) return

 const next = {
 ...saved,
 currentChunkIndex: nextChunkIndex,
 currentPuzzleIndex: nextPuzzleIndex,
 chunkProgressByFile: {
 ...saved.chunkProgressByFile,
 [fileName]: nextChunkProgress.map((x) => x.fastSolves),
 },
 }

 saveState(storageKey, next)
 }

 function swapToPuzzlePosition(nextGame: Chess) {
 setTransitionCover(null)
 setDisableBoardAnimation(true)
 setGameAndBoardFen(nextGame)

 requestAnimationFrame(() => {
 requestAnimationFrame(() => {
 setDisableBoardAnimation(false)
 setTransitionCover(null)
 })
 })
 }

 async function loadChunkByIndex(
 chunkIndex: number,
 filesOverride?: string[],
 puzzleIndexOverride?: number
 ) {
 const loadToken = chunkCompletionGateRef.current.begin()
 chunkCanBeCompletedRef.current = false
 const files = filesOverride ?? chunkFiles
 const fileName = files[chunkIndex]

 if (!fileName) {
 setBoardLocked(true)
 setPhase('finished')
 setDisplayTurn('w')
 setMessage('All chunks mastered')
 return
 }

 setLoading(true)
 setLoadError('')

 try {
 // Mixed curricula are already deterministically chunked. Loading only the
 // selected chunk preserves the historical bounded-memory/lazy-load contract.
 const sourceFiles = [fileName]
 const sourceLists = await Promise.all(sourceFiles.map(async (sourceFile) => {
  if (config.dataSource) return config.dataSource.loadChunk(sourceFile)
  const sourceUrl = resolvePatternTacticPublicAssetUrl(activeDataBasePath, sourceFile)
  const data = await fetchPatternTacticJson<PatternTacticSourcePuzzle[] | { puzzles?: PatternTacticSourcePuzzle[]; exercises?: PatternTacticSourcePuzzle[] }>(sourceUrl, `tactic chunk ${sourceFile}`)
  return Array.isArray(data) ? data : data.puzzles || data.exercises || []
 }))
 const rawList = sourceLists.flat()

 const normalized = rawList
 .map((item, index) => normalizePuzzle(item, index))
 .filter(Boolean) as PatternTacticPuzzle[]

 if (normalized.length === 0) {
 throw new Error(`No valid puzzles found in ${fileName}`)
 }

 const mixedSessionId = `v4-attribution:${config.trainerKey}:${mixedScope}:${mixedPhase}:${fileName}`
 const sessionPuzzles = isMixedPatternTactic
 ? (() => {
 const candidates: MixedSessionCandidate<PatternTacticPuzzle>[] = normalized.map((puzzle) => {
 const canonicalIdentity = createCanonicalExerciseIdentity({
 fen: puzzle.fen,
 preMove: puzzle.preMove,
 objective: config.trainerKey,
 solutionLine: puzzle.solutionLine,
 sourceIdentity: puzzle.sourceIdentity ?? puzzle.id,
 })
 return {
 item: { ...puzzle, canonicalIdentity },
 theme: normaliseMixedThemeKey(puzzle.canonicalThemeKey ?? puzzle.sourceTheme ?? puzzle.theme, "tactics"),
 canonicalIdentity,
 stableId: puzzle.id,
 pedagogicalFamily: puzzle.pedagogicalFamily,
 }
 })
 const plan = getOrCreateMixedSessionPlan(candidates, {
 sessionId: mixedSessionId,
  userId: accountId,
 eligibleThemes: mixedScope === "unlocked"
  ? themesForMixedScope({
   area: "tactics",
   availableThemes: candidates.map((candidate) => candidate.theme),
   scope: mixedScope,
   curriculum: mixedCurriculum,
  })
  : undefined,
 recentlySeenCanonicalIdentities: getRecentMixedCanonicalIdentities(mixedSessionId, accountId),
 sessionSize: normalized.length,
 })
 setMixedSessionThemes(Object.keys(plan.themeCounts))
 if (mixedSessionIdRef.current !== mixedSessionId) {
  mixedSessionEvidenceRef.current = { attempts: 0, correct: 0, themes: new Set<string>(), recordedPuzzleIds: new Set<string>() }
 }
 mixedSessionIdRef.current = mixedSessionId
 return plan.items
 })()
 : normalized

 const saved = getSavedState(storageKey)
 const savedProgress = saved.chunkProgressByFile[fileName] || []

 let supaProgress: Record<string, number> = {}

 if (config.studyCourse && config.studyTheme) {
 try {
 supaProgress = await loadTrainingProgressMap(
 config.studyCourse,
 config.studyTheme
 )
 } catch (e) {
 console.error('Failed loading Supabase progress', e)
 }
 }

 // Admit validated content before reopening legacy review progress. The quota
 // must see its saved unlock evidence, not the review's reset state.
 if (!await admitAutoChunk({ course: 'pattern', trainerKey: progressTrainerKey, unitKey: String(chunkIndex + 1) })) return
 let chunkReviewDue = false
 let chunkCanBeCompleted = true

 if (currentUserId) {
 const chunkNumber = chunkIndex + 1
 const { data: chunkRow, error: chunkRowError } = await supabase
 .from('user_chunk_progress')
 .select('is_mastered, review_stage, next_review_at')
 .eq('user_id', currentUserId)
 .eq('trainer_key', progressTrainerKey)
 .eq('chunk_index', chunkNumber)
 .maybeSingle()

 if (chunkRowError) {
 console.error('Could not load tactic chunk review state', chunkRowError)
 throw new Error('Could not verify chunk review state')
 } else if (chunkRow) {
 const hasDueDate = Boolean(chunkRow.next_review_at)
 const reviewIsDue =
 hasDueDate &&
 isTacticChunkReviewDue(String(chunkRow.next_review_at))
 const legacyMasteryWithoutDate =
 chunkRow.is_mastered === true && !hasDueDate

 if (
 chunkRow.is_mastered === true &&
 (reviewIsDue || legacyMasteryWithoutDate)
 ) {
 // Hydrating a due review is read-only; completion needs learner evidence.
 chunkReviewDue = true
 } else if (
 chunkRow.is_mastered === false &&
 Number(chunkRow.review_stage ?? 0) > 0 &&
 reviewIsDue
 ) {
 chunkReviewDue = true
 } else if (chunkRow.is_mastered === true) {
 chunkCanBeCompleted = false
 }
 }
 }

 let restoredChunkProgress = sessionPuzzles.map((puzzle, i) => {
 const localValue = savedProgress[i] ?? 0
 const supaValue = supaProgress[puzzle.id] ?? 0

 return {
 fastSolves: Math.max(
 0,
 Math.min(FAST_SOLVES_TO_MASTER, Math.max(localValue, supaValue))
 ),
 }
 })

 if (chunkReviewDue) {
 restoredChunkProgress = restoredChunkProgress.map((item) => ({
 fastSolves: Math.min(
 item.fastSolves,
 Math.max(0, FAST_SOLVES_TO_MASTER - 1)
 ),
 }))
 }

 if (!chunkCompletionGateRef.current.ready(loadToken, `${currentUserId}:${progressTrainerKey}:${chunkIndex}`, chunkReviewDue)) return
 chunkCanBeCompletedRef.current = chunkCanBeCompleted
 chunkMasterySaveKeyRef.current = null
 chunkMasteryPromiseRef.current = null
 chunkProgressRef.current = restoredChunkProgress

 let desiredPuzzleIndex =
 puzzleIndexOverride ??
 (saved.currentChunkIndex === chunkIndex ? saved.currentPuzzleIndex : 0)

 if (
 restoredChunkProgress.length > 0 &&
 restoredChunkProgress.every((x) => x.fastSolves >= FAST_SOLVES_TO_MASTER)
 ) {
 desiredPuzzleIndex = 0
 } else {
 const clamped = Math.max(
 0,
 Math.min(sessionPuzzles.length - 1, desiredPuzzleIndex)
 )
 if (
 (restoredChunkProgress[clamped]?.fastSolves ?? 0) >=
 FAST_SOLVES_TO_MASTER
 ) {
 const firstUnmastered = restoredChunkProgress.findIndex(
 (x) => x.fastSolves < FAST_SOLVES_TO_MASTER
 )
 desiredPuzzleIndex = firstUnmastered >= 0 ? firstUnmastered : clamped
 } else {
 desiredPuzzleIndex = clamped
 }
 }

 clearTimers()
 advanceUserMoveIndex(0)
 setCurrentChunkIndex(chunkIndex)
 setJumpChunkInput(String(chunkIndex + 1))
 setPuzzles(sessionPuzzles)
 setChunkProgress(restoredChunkProgress)

 const initialPuzzle = sessionPuzzles[desiredPuzzleIndex]
 if (initialPuzzle) {
 loadPuzzleImmediate(
 initialPuzzle,
 desiredPuzzleIndex,
 restoredChunkProgress,
 chunkIndex,
 fileName
 )
 } else {
 setCurrentIndex(desiredPuzzleIndex)
 setSelectedSquare(null)
 setLegalTargets([])
 setSolved(false)
 setBlindThemeRevealed(false)
 mixedPuzzleNeededHelpRef.current = false
 setBoardLocked(true)
 setPhase('solving')
 setMessage('Loading chunk...')
 }
 } catch (err) {
 console.error(err)
 const detail = err instanceof Error ? err.message : String(err)
 setLoadError(`Could not load ${fileName}: ${detail}`)
 setPuzzles([])
 setChunkProgress([])
 setCurrentIndex(0)
 setBoardLocked(true)
 setPhase('finished')
 setDisplayTurn('w')
 setMessage('Could not load chunk')
 } finally {
 setLoading(false)
 }
 }

 async function restartCurrentChunkProgression() {
 const started = await progressionResetRef.current.startReset()
 if (!started) return
 setRestartingProgression(true)
 clearTimers()
 cancelCorrectAutoAdvance()
 cancelWrongMoveReset()
 setBoardLocked(true)
 setMessage('Restarting progression...')
 // Invalidate any pre-reset hydration before it can write stale mastery back
 // into the visible trainer state.
 chunkCompletionGateRef.current.begin()

 try {
 const plan = createCurrentChunkResetPlan({
  savedState: getSavedState(storageKey),
  fileName: currentChunkFileName,
  currentChunkIndex,
  puzzleIds: puzzles.map((puzzle) => puzzle.id),
 })
 await resetCurrentChunkProgressPersistence({
  client: supabase,
  userId: currentUserId,
  trainerKey: progressTrainerKey,
  chunkNumber: plan.chunkNumber,
  puzzleIds: plan.puzzleIds,
  storage: localStorage,
  storageKey,
  savedState: plan.savedState,
  studyCourse: config.studyCourse,
  studyTheme: config.studyTheme,
 })
 chunkStartMarkerRef.current = null
 const emptyChunkProgress = plan.emptyProgress.map((fastSolves) => ({ fastSolves }))
 chunkProgressRef.current = emptyChunkProgress
 chunkCanBeCompletedRef.current = true
 chunkMasterySaveKeyRef.current = null
 chunkMasteryPromiseRef.current = null
 curriculumCompletionInFlightRef.current = false
 setCurriculumCompletionCard(null)
 setCompletionOverlayDismissed(false)
 setChunkProgress(emptyChunkProgress)
 setCurrentIndex(0)
 await loadChunkByIndex(currentChunkIndex, chunkFiles, 0)
 setMessage('Progression restarted.')
 } catch (error) {
 console.error('Failed to restart tactic progression:', error)
 setMessage('Could not restart progression. Please try again.')
 } finally {
 progressionResetRef.current.finishReset()
 setRestartingProgression(false)
 }
 }
 useEffect(() => {
 let bootstrapCancelled = false
 chunkCompletionGateRef.current.begin()
 async function bootstrap() {
 try {
 setLoading(true)
 setLoadError('')
 setCurriculumCompletionCard(null)
 setCompletionOverlayDismissed(false)
 curriculumCompletionInFlightRef.current = false
 curriculumSessionEvidenceRef.current = { attempts: 0, correct: 0, hints: 0, solveMsTotal: 0, recordedPuzzleIds: new Set<string>() }

 if (tacticLearnerCurriculum?.unavailableReason || mixedUnavailableReason || !activeDataBasePath) {
  const unavailableReason = tacticLearnerCurriculum?.unavailableReason
   ?? mixedUnavailableReason
   ?? "This Pattern Tactics course is not part of the verified curriculum."
  setChunkFiles([])
  setPuzzles([])
  setBoardLocked(true)
  setPhase('finished')
  setMessage(unavailableReason)
  setLoadError(unavailableReason)
  setLoading(false)
  return
 }

 const manifest = config.dataSource
  ? await config.dataSource.loadManifest()
  : await fetchPatternTacticJson<PatternTacticManifestFile>(manifestFetchPath, 'tactic manifest')
 const files = manifest.files && manifest.files.length > 0
  ? manifest.files
  : manifest.chunks?.map((chunk) => chunk.file).filter(Boolean) ?? []

 if (files.length === 0) {
 throw new Error('No chunk files in manifest')
 }

 setChunkFiles(files)

 if (isMixedPatternTactic && !mixedScopeConfirmed) {
  const manifestThemes = manifest.sourceThemes?.length
   ? manifest.sourceThemes
   : (await Promise.all(files.map(async (sourceFile) => {
    const sourceUrl = resolvePatternTacticPublicAssetUrl(activeDataBasePath, sourceFile)
    const data = await fetchPatternTacticJson<PatternTacticSourcePuzzle[] | { puzzles?: PatternTacticSourcePuzzle[]; exercises?: PatternTacticSourcePuzzle[] }>(sourceUrl, `tactic chunk ${sourceFile}`)
    const items = Array.isArray(data) ? data : data.puzzles || data.exercises || []
    return items.flatMap((item) => item.sourceThemeKeys ?? item.sourceThemes ?? [item.sourceTheme ?? item.theme ?? "other"])
   }))).flat()
  setMixedAvailableThemes(manifestThemes.map((theme) => normaliseMixedThemeKey(theme, "tactics")))
  setLoading(false)
  return
 }

 const saved = getSavedState(storageKey)

 let startChunkIndex: number
 let compatibilityCredit = 0

 if (currentUserId && tacticLearnerCurriculum) {
  const priorLearnerKey = getPatternTacticPriorLearnerProgressTrainerKey(tacticLearnerCurriculum)
  const { data: legacyRows, error: legacyError } = await supabase
   .from("user_chunk_progress")
   .select("trainer_key, chunk_index, is_mastered, mastered_puzzles_count")
   .eq("user_id", currentUserId)
 .in("trainer_key", [progressTrainerKey, config.trainerKey, priorLearnerKey])
  if (legacyError) {
   console.error("Could not read legacy tactic completion credit", legacyError)
  } else {
 const activeRows = (legacyRows ?? []).filter((row) => row.trainer_key === progressTrainerKey)
 const legacyCredit = getPatternTacticLegacyCompletionCredit((legacyRows ?? []).filter((row) => row.trainer_key === config.trainerKey), tacticLearnerCurriculum).completedActiveChunks
   const priorLearnerChunkCount = getPatternTacticPriorLearnerActiveChunkCount(tacticLearnerCurriculum)
   const priorLearnerCompleted = priorLearnerChunkCount > 0
    ? new Set((legacyRows ?? []).filter((row) => row.trainer_key === priorLearnerKey && row.is_mastered === true)
      .map((row) => Number(row.chunk_index))
      .filter((chunk) => Number.isInteger(chunk) && chunk >= 1 && chunk <= priorLearnerChunkCount)).size
    : 0
   const priorLearnerCredit = priorLearnerChunkCount > 0
    ? Math.min(tacticLearnerCurriculum.activeChunkCount, Math.floor((priorLearnerCompleted * tacticLearnerCurriculum.activeChunkCount) / priorLearnerChunkCount))
    : 0
 compatibilityCredit = capLegacyCreditAtOpenChunk(
  Math.max(legacyCredit, priorLearnerCredit),
  activeRows,
  getSavedState(storageKey).resetChunkIndexes,
 )
   if (compatibilityCredit > 0) {
    const now = new Date().toISOString()
    await Promise.all(Array.from({ length: compatibilityCredit }, (_, index) => supabase
     .from("user_chunk_progress")
     .upsert({
      user_id: currentUserId,
      trainer_key: progressTrainerKey,
      chunk_index: index + 1,
      mastered_puzzles_count: tacticLearnerCurriculum.activeChunkSize,
      is_mastered: true,
      mastered_at: now,
      updated_at: now,
     })))
   }
  }
 }

 if (forcedChunkIndex !== null) {
 startChunkIndex = Math.max(
 0,
 Math.min(files.length - 1, forcedChunkIndex)
 )
 console.log('Using chunk from AUTO (URL):', startChunkIndex)
 } else {
 startChunkIndex = Math.max(
 0,
 Math.min(
  files.length - 1,
  Math.max(
   resolvePatternTacticLearnerFacingChunkIndex(
    saved.currentChunkIndex ?? 0,
    tacticLearnerCurriculum,
    tacticLearnerCurriculum !== null,
   ),
   compatibilityCredit,
  ),
 )
 )

 if (currentUserId) {
 const { data: dueChunk, error: dueChunkError } = await supabase.rpc(
 'get_next_due_chunk',
 {
 p_user_id: currentUserId,
 p_trainer_key: progressTrainerKey,
 }
 )

 if (dueChunkError) {
 console.error('Could not load due chunk', dueChunkError)
 } else if (dueChunk && dueChunk.length > 0) {
 startChunkIndex = Math.max(
 0,
 Math.min(files.length - 1, dueChunk[0].chunk_index - 1)
 )
 console.log('Using due chunk from Supabase:', dueChunk[0])
 }
 }
 }

 if (bootstrapCancelled) return
 await loadChunkByIndex(
 startChunkIndex,
 files,
 saved.currentPuzzleIndex ?? 0
 )
 } catch (err) {
 console.error(err)
 setLoadError('Could not load manifest')
 setLoading(false)
 }
 }

 bootstrap()

 return () => {
 bootstrapCancelled = true
 chunkCompletionGateRef.current.begin()
 clearTimers()
 }
 }, [
 manifestFetchPath,
 storageKey,
 currentUserId,
 config.trainerKey,
 forcedChunkIndex,
 isMixedPatternTactic,
 mixedScopeConfirmed,
 mixedScope,
 mixedCurriculum,
])

 useEffect(() => {
 function setInitialBoardSize() {
 const width = window.innerWidth
 const height = window.innerHeight
 const rightPanelWidth = 340
 const pagePadding = 80
 const availableWidth = width - rightPanelWidth - pagePadding
 const availableHeight = height - 80
 const size = Math.max(320, Math.min(820, availableWidth, availableHeight))
 setBoardSize(size)
 }

 setInitialBoardSize()
 window.addEventListener('resize', setInitialBoardSize)
 return () => window.removeEventListener('resize', setInitialBoardSize)
 }, [])

 useEffect(() => {
 function onMouseMove(e: MouseEvent) {
 if (!isDragging || !containerRef.current) return

 const rect = containerRef.current.getBoundingClientRect()
 const leftPadding = 16
 const rightPanelWidth = 340
 const dividerWidth = 18
 const minBoard = 320
 const maxBoard = Math.min(
 950,
 rect.width - rightPanelWidth - dividerWidth - leftPadding
 )

 const nextSize = e.clientX - rect.left - leftPadding
 const clamped = Math.max(minBoard, Math.min(maxBoard, nextSize))
 setBoardSize(clamped)
 }

 function onMouseUp() {
 setIsDragging(false)
 }

 window.addEventListener('mousemove', onMouseMove)
 window.addEventListener('mouseup', onMouseUp)

 return () => {
 window.removeEventListener('mousemove', onMouseMove)
 window.removeEventListener('mouseup', onMouseUp)
 }
 }, [isDragging])

 const currentPuzzle = useMemo(() => puzzles[currentIndex], [puzzles, currentIndex])

 const globalFen = game.fen()

 useRegisterPlayableBoard({
 fen: globalFen,
 orientation: boardOrientation,
 setOrientation: setBoardOrientation,
 suggestedColor: boardOrientation,
 canFlip: true,
 })

 useEffect(() => {
 if (!currentChunkFileName || puzzles.length === 0 || chunkProgress.length === 0)
 return
 persistProgress(currentChunkIndex, currentIndex, chunkProgress)
 }, [
 currentChunkIndex,
 currentIndex,
 chunkProgress,
 currentChunkFileName,
 puzzles.length,
 ])

 useEffect(() => {
 chunkProgressRef.current = chunkProgress

 if (!currentUserId) return
 if (!chunkCanBeCompletedRef.current) return
 if (puzzles.length === 0) return
 if (chunkProgress.length !== puzzles.length) return

 const allMasteredNow = chunkProgress.every(
 (item) => item.fastSolves >= FAST_SOLVES_TO_MASTER
 )

 if (!allMasteredNow) return

 void startChunkMasterySave(chunkProgress.length)
 }, [currentUserId, currentChunkIndex, chunkProgress, puzzles.length])

 function clearTimers() {
 if (preMoveTimerRef.current) {
 window.clearTimeout(preMoveTimerRef.current)
 preMoveTimerRef.current = null
 }
 clearReplyTimer()
  cancelCorrectAutoAdvance()
  cancelWrongMoveReset()
 }

 function incrementFastSolve(puzzleIndex: number) {
 if (!chunkCompletionGateRef.current.qualifiedSolve(`${currentUserId}:${progressTrainerKey}:${currentChunkIndex}`)) return
 setChunkProgress((prev) => {
 const next = prev.map((item, i) =>
 i === puzzleIndex
 ? {
 ...item,
 fastSolves: nextPerfectSolveCount(item.fastSolves, FAST_SOLVES_TO_MASTER, true),
 }
 : item
 )
 chunkProgressRef.current = next
 return next
 })
 }

 function activatePerfectionTurn(
 puzzle: PatternTacticPuzzle,
 solvedUserMoveCount: number
 ) {
 perfectionTrackerRef.current.activateLearnerPosition(
  performance.now(),
  getAcceptedUserMoves(puzzle, solvedUserMoveCount),
 )
 }

 function loadPuzzleImmediate(
 puzzle: PatternTacticPuzzle,
 index: number,
 nextChunkProgressArg?: PuzzleMastery[],
 nextChunkIndexArg?: number,
 fileNameOverride?: string,
 readyTransition = false,
 ) {
 let preparedStart: Chess | undefined
 if (readyTransition) {
  try { preparedStart = preparePuzzleStartPosition(puzzle) }
  catch (error) {
   setLoadError(`Could not prepare next puzzle: ${error instanceof Error ? error.message : String(error)}`)
   return
  }
 }
 clearTimers()
 perfectionTrackerRef.current.resetAttempt(timedMasteryEnabledRef.current)
 // Focused trainers retain their normal ordering; this lightweight history
 // record only helps a later mixed session avoid an immediate source repeat.
 const servedSessionId = mixedSessionIdRef.current ?? `${config.trainerKey}:${fileNameOverride ?? currentChunkFileName}`
 const canonicalIdentity = puzzle.canonicalIdentity ?? createCanonicalExerciseIdentity({
 fen: puzzle.fen,
 preMove: puzzle.preMove,
 objective: config.trainerKey,
 solutionLine: puzzle.solutionLine,
 sourceIdentity: puzzle.sourceIdentity ?? puzzle.id,
 })
 recordMixedCanonicalIdentity(servedSessionId, canonicalIdentity, accountId)

 advanceUserMoveIndex(0)

 const startChess = preparedStart ?? new Chess(puzzle.fen)

 clearReplyEffects()
 setLastMoveHighlight(null)
 setCorrectSquare(null)
 setSelectedSquare(null)
 setLegalTargets([])
 setSolved(false)
 setHintMoveUci(null)
 setPhase('solving')

 setCurrentIndex(index)
    const afterPreMoveForOrientation = new Chess(puzzle.fen)
    let userTurn: 'w' | 'b' = startChess.turn()

    if (puzzle.preMove && !readyTransition) {
      try {
        afterPreMoveForOrientation.move(parseUci(puzzle.preMove!))
        userTurn = afterPreMoveForOrientation.turn()
      } catch {
        userTurn = startChess.turn()
      }
    }

    puzzleLearnerSideRef.current = userTurn
    setBoardOrientation(userTurn === 'b' ? 'black' : 'white')
    swapToPuzzlePosition(startChess)
    setDisplayTurn(userTurn)

 if (puzzle.preMove && !readyTransition) {
 setBoardLocked(true)
 solveStartedAtRef.current = null
 setMessage('Opponent move...')

 preMoveTimerRef.current = window.setTimeout(() => {
 try {
  const isVerifiedPremove = !sameChessPosition(puzzle.sourceFen, puzzle.displayedFen)
  const completion = isVerifiedPremove
   ? completeInitialPremove({
    sourceFen: puzzle.sourceFen,
    preMove: puzzle.preMove!,
    displayedFen: puzzle.displayedFen,
   })
   : (() => {
    const board = new Chess(puzzle.sourceFen)
    const move = board.move(parseUci(puzzle.preMove!))
    if (!move) throw new Error(`Illegal initial premove ${puzzle.preMove}`)
    return {
     boardFen: board.fen(),
     activeTurn: board.turn(),
     currentInteractiveLineIndex: 0 as const,
     completedLearnerMoves: 0,
     awaitingOpponent: false,
     boardLocked: false,
    }
   })()

  // Atomic verified handoff: no second timeout is allowed between placing the
  // premove and re-enabling input. A bootstrap/auth cleanup used to cancel
  // that second timer and strand boardLocked=true after the move appeared.
  const afterPreMove = new Chess(completion.boardFen)
  setGameAndBoardFen(afterPreMove)
  setDisplayTurn(completion.activeTurn)
  setLastMoveHighlight(puzzle.preMove!)
  advanceUserMoveIndex(completion.currentInteractiveLineIndex)
  setSolved(false)
  setPhase('solving')
  solveStartedAtRef.current = performance.now()
  activatePerfectionTurn(puzzle, completion.completedLearnerMoves)
  preMoveTimerRef.current = null
  setBoardLocked(completion.boardLocked)
  setMessage(`Find the tactic in ${getUserMoveCount(puzzle)}`)
 } catch (error) {
  const detail = error instanceof Error ? error.message : String(error)
  setLoadError(`Could not start verified tactic: ${detail}`)
  setPuzzles([])
  setBoardLocked(true)
  setPhase('finished')
  setMessage('Training data is unavailable. The board has been disabled.')
 }
 }, PREMOVE_START_DELAY_MS)

 return
 }

 setBoardLocked(false)
 solveStartedAtRef.current = performance.now()
 activatePerfectionTurn(puzzle, 0)
 setMessage(`Find the tactic in ${getUserMoveCount(puzzle)}`)
 }

 function allPuzzlesMastered() {
 return isFinalPuzzleCompletion({
  currentPuzzleIndex: currentIndex,
  totalPuzzleCount: puzzles.length,
  completedPuzzleCount: chunkProgress.filter((item) => item.fastSolves >= FAST_SOLVES_TO_MASTER).length,
 })
 }

 function goToPreviousChunk() {
 if (loading || currentChunkIndex <= 0) return
 navigateToChunk(currentChunkIndex - 1)
 }

 function goToNextChunkManual() {
 if (loading || currentChunkIndex >= chunkFiles.length - 1) return
 navigateToChunk(currentChunkIndex + 1)
 }

 function navigateToChunk(targetIndex: number) {
 const nextUrl = buildNextActiveLearnerChunkUrl(
  window.location.pathname,
  window.location.search,
  targetIndex,
  learnerCurriculumVersion,
 )
 window.history.replaceState(window.history.state, '', nextUrl)
 void loadChunkByIndex(targetIndex, undefined, 0)
 }

 function jumpToChunk() {
 if (loading || chunkFiles.length === 0) return

 const parsed = Number(jumpChunkInput.trim())
 if (!Number.isFinite(parsed)) {
 setMessage('Enter a valid chunk number')
 return
 }

 const targetIndex = Math.max(
 0,
 Math.min(chunkFiles.length - 1, Math.floor(parsed) - 1)
 )
 navigateToChunk(targetIndex)
 }

async function completeChunk() {
 const completionRoute = window.location.pathname + window.location.search
 let chunkSaved = false
 if (progressionResetRef.current.isResetting) return
 if (curriculumCompletionInFlightRef.current) return
 curriculumCompletionInFlightRef.current = true
 const latestProgress = chunkProgressRef.current
 const chunkIsMastered = isFinalPuzzleCompletion({
  currentPuzzleIndex: currentIndex,
  totalPuzzleCount: puzzles.length,
  completedPuzzleCount: latestProgress.filter((item) => item.fastSolves >= FAST_SOLVES_TO_MASTER).length,
 })

 if (chunkIsMastered) {
 chunkSaved = await startChunkMasterySave(latestProgress.length)
 if (progressionResetRef.current.isResetting) {
  curriculumCompletionInFlightRef.current = false
  return
 }
 }

 if (isMixedPatternTactic) {
  recordIdentifiedMixedSessionEvidence({
   trainerKey: accountStorageKey(config.trainerKey, accountId),
   sessionId: mixedSessionIdRef.current ?? `v3:${config.trainerKey}:${mixedScope}:${mixedPhase}:${currentChunkFileName}`,
   scope: mixedScope,
   phase: mixedPhase,
   correct: mixedSessionEvidenceRef.current.correct,
   attempts: mixedSessionEvidenceRef.current.attempts,
   representedThemes: [...mixedSessionEvidenceRef.current.themes],
  })
 }

 const sessionEvidence = curriculumSessionEvidenceRef.current
 const attempts = sessionEvidence.attempts
 const correct = sessionEvidence.correct
 const theme = tacticLearnerCurriculum?.canonicalThemeKey ?? config.studyTheme ?? config.trainerKey
 const stage = tacticDistance
 const localBlindProgress = isMixedPatternTactic && mixedScope === "unlocked" && mixedPhase === "identified"
  ? getBlindMixedUnlockStatus(accountStorageKey(config.trainerKey, accountId))
  : null
 const card = {
  theme: isMixedPatternTactic ? `${mixedPhase === "blind" ? "Blind" : "Identified"} mixed` : theme,
  stage,
  attempts,
  correct,
  hints: sessionEvidence.hints,
  mixed: isMixedPatternTactic,
  mixedPhase,
  includedThemes: isMixedPatternTactic ? mixedSessionThemes : undefined,
  blindUnlockProgress: localBlindProgress,
 }
 setCompletionOverlayDismissed(false)
 setCurriculumCompletionCard(card)
 try {
  const result = await progressionResetRef.current.track(() => recordNormalizedCurriculumCompletion({
   userId: currentUserId,
   area: "tactics",
   stageOrder: stage,
   canonicalTheme: isMixedPatternTactic ? null : theme,
   trainerKey: config.trainerKey,
   learnerVersion: learnerCurriculumVersion,
   learnerChunk: currentChunkIndex + 1,
   route: window.location.pathname,
   sessionId: isMixedPatternTactic
    ? mixedSessionIdRef.current ?? `mixed:${currentChunkFileName}`
    : `chunk:${currentChunkFileName}`,
   decisionId: searchParams.get("curriculumDecision"),
   // A due Auto route is a retention review, never another initial focused
   // chunk credit. Manual and new Auto routes remain focused practice.
   eventKind: isMixedPatternTactic ? (mixedPhase === "identified" ? "mixed" : "review") : searchParams.get("curriculumEventKind") === "review" ? "review" : "focused",
   attempts,
   correctAttempts: correct,
   hintCount: sessionEvidence.hints,
   averageSolveMs: attempts ? Math.round(sessionEvidence.solveMsTotal / attempts) : null,
   mixedScope,
   mixedPhase,
   }))
   if (!result) return
  setCurriculumCompletionCard({ ...card, masteryIncreased: result.masteryIncreased, reinforcementActivated: result.reinforcementActivated })
  if (chunkIsMastered && chunkSaved && currentUserId &&
      chunkCompletionGateRef.current.canCommit(`${currentUserId}:${progressTrainerKey}:${currentChunkIndex}`, latestProgress.map(item => item.fastSolves), FAST_SOLVES_TO_MASTER) &&
      new URLSearchParams(window.location.search).get('auto') === '1' &&
      completionRoute === window.location.pathname + window.location.search) {
   announceAutoTrainingComplete()
  }
 } catch (error) {
  console.error("Could not persist curriculum completion", error)
 }
}

 function goToNextPuzzle() {
 cancelCorrectAutoAdvance()
 const nextChunkProgress = chunkProgressRef.current

 const chunkIsMastered = isFinalPuzzleCompletion({
  currentPuzzleIndex: currentIndex,
  totalPuzzleCount: puzzles.length,
  completedPuzzleCount: nextChunkProgress.filter((item) => item.fastSolves >= FAST_SOLVES_TO_MASTER).length,
 })

 if (chunkIsMastered) {
 void completeChunk()
 return
 }

 for (let i = currentIndex + 1; i < nextChunkProgress.length; i++) {
 if ((nextChunkProgress[i]?.fastSolves ?? 0) < FAST_SOLVES_TO_MASTER) {
 const nextPuzzle = puzzles[i]
 if (!nextPuzzle) return
 loadPuzzleImmediate(nextPuzzle, i, undefined, undefined, undefined, true)
 return
 }
 }

 for (let i = 0; i <= currentIndex; i++) {
 if ((nextChunkProgress[i]?.fastSolves ?? 0) < FAST_SOLVES_TO_MASTER) {
 const nextPuzzle = puzzles[i]
 if (!nextPuzzle) return
 loadPuzzleImmediate(nextPuzzle, i, undefined, undefined, undefined, true)
 return
 }
 }

 setBoardLocked(true)
 setPhase('finished')
 setDisplayTurn('w')
 setMessage('Chunk complete')
 }

 function finishSolvedPuzzle(
 solvedGame: Chess,
 playedUci: string,
 moveToSquare: string
 ) {
 const solvedInSeconds =
 solveStartedAtRef.current == null
 ? null
 : (performance.now() - solveStartedAtRef.current) / 1000

 const wasPerfect = perfectionTrackerRef.current.isPerfectSolve()

 setGameAndBoardFen(solvedGame)
 // Completion belongs to the learner, not Chess.turn() after their final move.
 setDisplayTurn(puzzleLearnerSideRef.current)
 setSolved(true)
 const curriculumEvidence = curriculumSessionEvidenceRef.current
 if (!curriculumEvidence.recordedPuzzleIds.has(currentPuzzle.id)) {
  curriculumEvidence.recordedPuzzleIds.add(currentPuzzle.id)
  curriculumEvidence.attempts += 1
  if (wasPerfect) curriculumEvidence.correct += 1
  if (solvedInSeconds !== null) curriculumEvidence.solveMsTotal += Math.round(solvedInSeconds * 1000)
 }
 if (isMixedPatternTactic) {
  setBlindThemeRevealed(true)
  const evidence = mixedSessionEvidenceRef.current
  if (!evidence.recordedPuzzleIds.has(currentPuzzle.id)) {
   evidence.recordedPuzzleIds.add(currentPuzzle.id)
   evidence.attempts += 1
    if (wasPerfect) evidence.correct += 1
   evidence.themes.add(normaliseMixedThemeKey(currentPuzzle.sourceTheme ?? currentPuzzle.theme, "tactics"))
  }
 }
 setBoardLocked(true)
 setSelectedSquare(null)
 setLegalTargets([])
 setPhase('correct')
 setLastMoveHighlight(playedUci)
 setCorrectSquare(moveToSquare)

 if (wasPerfect) {
 incrementFastSolve(currentIndex)

 const currentFastSolves = chunkProgress[currentIndex]?.fastSolves ?? 0
 const nextValue = nextPerfectSolveCount(currentFastSolves, FAST_SOLVES_TO_MASTER, wasPerfect)

 if (config.studyCourse && config.studyTheme) {
 void progressionResetRef.current.track(() => saveTrainingProgress({
 userId: accountId,
 course: config.studyCourse,
 theme: config.studyTheme,
 itemId: currentPuzzle?.id ?? '',
 mastery: nextValue,
 }))
 }

 setMessage(
  'Correct'
 )
 } else {
 setMessage(
  puzzleSuccessFeedback(perfectionTrackerRef.current.snapshot())
 )
 }

 if (currentUserId && solveStartedAtRef.current != null) {
 const timeMs = performance.now() - solveStartedAtRef.current
 updateCategoryStats({
 userId: currentUserId,
 category: 'tactics',
 wasCorrect: true,
 timeMs,
 })
 }

 reportTrainingItemCompleted(
  "puzzle",
  `${config.trainerKey}:${currentPuzzle?.id ?? currentIndex}`,
 )

 config.onPuzzleSolved?.({
 puzzleId: currentPuzzle?.id ?? '',
  wasFast: wasPerfect,
 solvedInSeconds,
 course: config.studyCourse,
 theme: config.studyTheme,
 })

 scheduleCorrectAutoAdvance(goToNextPuzzle)
 }

 function completeCorrectMove(
 testGame: Chess,
 playedUci: string,
 moveToSquare: string
 ) {
 const solvedUserMoveCountBefore = currentUserMoveIndexRef.current
 const solvedUserMoveCountAfter = solvedUserMoveCountBefore + 1
 const totalUserMoves = getUserMoveCount(currentPuzzle)

 perfectionTrackerRef.current.suspendLearnerPosition()

 setSelectedSquare(null)
 setLegalTargets([])
 setLastMoveHighlight(playedUci)
 setCorrectSquare(moveToSquare)
 clearReplyEffects()

 advanceUserMoveIndex(solvedUserMoveCountAfter)

 const autoMoves = getOpponentReplyBeforeNextRequiredLearnerMove(
 currentPuzzle,
 solvedUserMoveCountAfter
 )

 if (autoMoves.length === 0) {
 setGameAndBoardFen(testGame)
 setDisplayTurn(testGame.turn())

 if (solvedUserMoveCountAfter >= totalUserMoves) {
 finishSolvedPuzzle(testGame, playedUci, moveToSquare)
 return
 }

 setBoardLocked(false)
 activatePerfectionTurn(currentPuzzle, solvedUserMoveCountAfter)
 setCorrectSquare(null)
 setMessage(`Find move ${solvedUserMoveCountAfter + 1} of ${totalUserMoves}`)
 return
 }

 setBoardLocked(true)

 playReplySequence({
 baseGame: testGame,
 replyMoves: autoMoves,
 animationMs: BOARD_ANIMATION_MS,
 pauseAfterMs: REPLY_PAUSE_AFTER_MS,
 onPosition: (nextGame) => {
 setGameAndBoardFen(new Chess(nextGame.fen()))
 setDisplayTurn(nextGame.turn())
 },
 onMessage: () => {},
 onDone: (finalGame) => {
 setGameAndBoardFen(new Chess(finalGame.fen()))
 setDisplayTurn(finalGame.turn())

 if (solvedUserMoveCountAfter >= totalUserMoves) {
 finishSolvedPuzzle(finalGame, playedUci, moveToSquare)
 return
 }

 setBoardLocked(false)
 activatePerfectionTurn(currentPuzzle, solvedUserMoveCountAfter)
 setCorrectSquare(null)
 setMessage(`Find move ${solvedUserMoveCountAfter + 1} of ${totalUserMoves}`)
 },
 })
 }

 // TACTICS UNDERPROMOTION V2
 type TacticPromotionPiece =
  | 'q'
  | 'r'
  | 'b'
  | 'n'

 function tacticPromotionCode(
  piece?: string | null
 ): TacticPromotionPiece | undefined {
  if (!piece) return undefined

  const code = piece
   .slice(-1)
   .toLowerCase()

  if (
   code === 'q' ||
   code === 'r' ||
   code === 'b' ||
   code === 'n'
  ) {
   return code
  }

  return undefined
 }

 function isTacticPromotionAttempt(
  sourceSquare: string,
  targetSquare: string
 ) {
  const pawn = game.get(sourceSquare as Square)

  if (!pawn || pawn.type !== 'p') {
   return false
  }

  const rank = Number(targetSquare[1])

  return (
   (pawn.color === 'w' && rank === 8) ||
   (pawn.color === 'b' && rank === 1)
  )
 }

 function handleSilentError() {
 perfectionTrackerRef.current.markSilentError()
 setMessage(SILENT_ERROR_FEEDBACK)
 }

 function registerIncorrectAnswer(
 originalPuzzleFen: string,
 expectedUci: string,
 wrongMove?: { position: Chess; uci: string; san: string },
 allowWrongMoveToShow = false,
 ) {
 if (solved || boardLocked || !currentPuzzle || phase !== 'solving') return false
 const testGame = wrongMove?.position
 const playedUci = wrongMove?.uci
 perfectionTrackerRef.current.markSubmittedWrongMove()
 perfectionTrackerRef.current.suspendLearnerPosition()

 setSelectedSquare(null)
 setLegalTargets([])
 setCorrectSquare(null)
 clearReplyEffects()
 clearReplyTimer()

 if (wrongMove) try {
 showCoachMistake({
 fenBefore: game.fen(),
 userMoveSan: wrongMove.san,
 userMoveUci: wrongMove.uci,
 bestMoveUci: expectedUci,
 evalLossCp: 180,
 phase: 'middlegame',
 source: 'trainer',
 })
 } catch {
 // Coach popup should never block trainer play.
 }

 setPhase('wrong')
 const wrongEvidence = curriculumSessionEvidenceRef.current
 if (!wrongEvidence.recordedPuzzleIds.has(currentPuzzle.id)) {
  wrongEvidence.recordedPuzzleIds.add(currentPuzzle.id)
  wrongEvidence.attempts += 1
  if (solveStartedAtRef.current != null) wrongEvidence.solveMsTotal += Math.round(performance.now() - solveStartedAtRef.current)
 }
 mixedPuzzleNeededHelpRef.current = true
 if (isMixedPatternTactic) {
  setBlindThemeRevealed(true)
 }
 setMessage(WRONG_MOVE_FEEDBACK)

 if (currentUserId && solveStartedAtRef.current != null) {
 const timeMs = performance.now() - solveStartedAtRef.current
 updateCategoryStats({
 userId: currentUserId,
 category: 'tactics',
 wasCorrect: false,
 timeMs,
 })
 }

 if (!wrongMove || allowWrongMoveToShow) {
  // This is the established live interaction: show a legal wrong move for
  // two seconds, then restore the exact displayed puzzle position.
 if (testGame && playedUci) {
  setLastMoveHighlight(playedUci)
  setGameAndBoardFen(testGame)
  setDisplayTurn(testGame.turn())
 } else {
  setLastMoveHighlight(null)
 }
  setBoardLocked(true)
  scheduleWrongMoveReset(() => {
   const restoredGame = new Chess(originalPuzzleFen)
   setGameAndBoardFen(restoredGame)
   setDisplayTurn(restoredGame.turn())
   setLastMoveHighlight(null)
   setPhase('solving')
   activatePerfectionTurn(currentPuzzle, currentUserMoveIndexRef.current)
   setBoardLocked(false)
   setMessage(WRONG_MOVE_FEEDBACK)
   })
   return true
 }

 scheduleWrongMoveReset(() => {
  setPhase((previous) => previous === 'wrong' ? 'solving' : previous)
  // Unlock promptly, but keep feedback readable until the next learner action.
 }, 700)
 return false
 }

 function attemptUserMove(
 sourceSquare: string,
 targetSquare: string,
 options?: {
  allowWrongMoveToShow?: boolean
  promotion?: TacticPromotionPiece
 }
 ) {
 if (solved || boardLocked || !currentPuzzle || phase !== 'solving') return false

 const expectedUci = getExpectedUserMove(
 currentPuzzle,
 currentUserMoveIndexRef.current
 )
 if (!expectedUci) return false

 const expected = parseUci(expectedUci)
 const originalPuzzleFen = game.fen()
 const testGame = new Chess(originalPuzzleFen)

 let move
 try {
 move = testGame.move({
 from: sourceSquare,
 to: targetSquare,
 promotion: options?.promotion,
 })
 } catch {
 return false
 }

 if (!move) return false

 // Loader-created rows are deliberately not resumable. A durable marker is
 // written only after chess.js has accepted a real learner move.
 void markCurrentChunkStarted()

 const playedUci = `${move.from}${move.to}${move.promotion ?? ''}`.toLowerCase()
 perfectionTrackerRef.current.recordCommittedMove(playedUci, performance.now())
 const verifiedEquivalentMoves = currentPuzzle.acceptedEquivalentMovesByUserMove?.[
  currentUserMoveIndexRef.current
 ] ?? []
 const isVerifiedEquivalent = verifiedEquivalentMoves.some(
  (candidate) => candidate.toLowerCase() === playedUci,
 )

 if (playedUci !== expectedUci.toLowerCase() && !isVerifiedEquivalent) {

 return registerIncorrectAnswer(originalPuzzleFen, expectedUci, { position: testGame, uci: playedUci, san: move.san }, options?.allowWrongMoveToShow)
 }

 if (isVerifiedEquivalent && playedUci !== expectedUci.toLowerCase()) {
  const solvedUserMoveCountAfter = currentUserMoveIndexRef.current + 1
  if (solvedUserMoveCountAfter >= getUserMoveCount(currentPuzzle)) {
   advanceUserMoveIndex(solvedUserMoveCountAfter)
   finishSolvedPuzzle(testGame, playedUci, move.to)
   return true
  }

  // Persisted equivalent evidence validates the learner's move, but does not
  // include a separate continuation tree. Rejoin the persisted verified main
  // line for the remaining learner decisions instead of attempting an
  // opponent reply that may be illegal in the equivalent branch.
  const canonicalGame = new Chess(originalPuzzleFen)
  canonicalGame.move(expected)
  setMessage('Correct equivalent — continuing the verified main line')
  completeCorrectMove(canonicalGame, playedUci, move.to)
  return true
 }

 completeCorrectMove(testGame, playedUci, move.to)
 return true
 }

 function beginPieceIntent(square: string, mode: 'click' | 'drag') {
  if (!mouseEnabled) return
  // Drag callbacks may outlive a render; the tracker owns live turn activation.
  if (!perfectionTrackerRef.current.snapshot().active) return
  const piece = game.get(square as Square)
  if (!piece || piece.color !== game.turn()) return
  const intent = perfectionTrackerRef.current.beginSource(square, performance.now(), mode)
  if (intent.recorded && !intent.sourceAccepted) {
   setMessage(SILENT_ERROR_FEEDBACK)
  }
 }

 function recordMoveIntent(source: string, target: string, promotion?: string) {
  const tracker = perfectionTrackerRef.current
  const accepted = tracker.recordDestination(source, target, performance.now(), promotion)
  if (tracker.snapshot().active && !accepted && source !== target && /^[a-h][1-8]$/.test(target)) {
   setMessage(SILENT_ERROR_FEEDBACK)
  }
  return accepted
 }

 function getLegalTargets(fromSquare: string) {
 const moves = game.moves({ verbose: true }) as Array<{
 from: string
 to: string
 }>

 return moves
 .filter((m) => m.from === fromSquare)
 .map((m) => m.to)
 }

 function onDrop(
 sourceSquare: string,
 targetSquare: string
) {
 if (sourceSquare === targetSquare || !/^[a-h][1-8]$/.test(targetSquare)) {
  perfectionTrackerRef.current.cancelIntent(sourceSquare)
  return false
 }
 // A real promotion attempt opens its
 // queen/rook/bishop/knight promotion selector.
 if (
  isTacticPromotionAttempt(
   sourceSquare,
   targetSquare
  )
 ) {
  perfectionTrackerRef.current.markPromotionPending(
   sourceSquare,
   targetSquare,
   performance.now(),
  )
  return false
 }

 // Keep the newly created promotion coach notice alive.
  // Only clear the previous notice for an ordinary move.
  hideCoachMistake()

  recordMoveIntent(sourceSquare, targetSquare)

  return attemptUserMove(
  sourceSquare,
  targetSquare,
  {
   allowWrongMoveToShow: true,
  }
 )
}

function onSquareClick(square: string) {
 if (solved || boardLocked || !currentPuzzle || phase !== 'solving') return

 const clickedPiece = game.get(square as Square)
 const sideToMove = game.turn()

 if (!selectedSquare) {
 if (clickedPiece && clickedPiece.color === sideToMove) {
  beginPieceIntent(square, 'click')
 }
 if (clickedPiece && clickedPiece.color === sideToMove) {
 const targets = getLegalTargets(square)
 setSelectedSquare(square)
 setLegalTargets(targets)
 }
 return
 }

 if (selectedSquare === square) {
 perfectionTrackerRef.current.cancelIntent(selectedSquare)
 setSelectedSquare(null)
 setLegalTargets([])
 return
 }

 // Clicking another learner piece selects it; it is not a destination attempt.
 if (clickedPiece && clickedPiece.color === sideToMove) {
  beginPieceIntent(square, 'click')
  setSelectedSquare(square)
  setLegalTargets(getLegalTargets(square))
  return
 }

 if (
  isTacticPromotionAttempt(
   selectedSquare,
   square
  )
 ) {
  perfectionTrackerRef.current.markPromotionPending(
   selectedSquare,
   square,
   performance.now(),
  )
  const pawn = game.get(selectedSquare as Square)
  if (pawn) {
   setPendingPromotion({
    sourceSquare: selectedSquare,
    targetSquare: square,
    color: pawn.color,
   })
  }
  setSelectedSquare(null)
  setLegalTargets([])
  return
 } else {
  recordMoveIntent(selectedSquare, square)
  const moveWorked =
   attemptUserMove(
    selectedSquare,
    square
   )

  if (moveWorked) return
 }

 if (clickedPiece && clickedPiece.color === sideToMove) {
 beginPieceIntent(square, 'click')
 const targets = getLegalTargets(square)
 setSelectedSquare(square)
 setLegalTargets(targets)
 } else {
 setSelectedSquare(null)
 setLegalTargets([])
 }
 }

 const currentPuzzleFastSolves = chunkProgress[currentIndex]?.fastSolves ?? 0
 const currentMixedSourceTheme = currentPuzzle
  ? currentPuzzle.canonicalThemeLabel ?? formatMixedThemeName(normaliseMixedThemeKey(currentPuzzle.canonicalThemeKey ?? currentPuzzle.sourceTheme ?? currentPuzzle.theme, "tactics"))
  : ""
 const showMixedTheme = isMixedPatternTactic && shouldRevealMixedTheme(mixedPhase, blindThemeRevealed)
 const totalFastSolves = chunkProgress.reduce((sum, item) => sum + item.fastSolves, 0)
 const currentChunkTarget = Math.max(1, puzzles.length) * FAST_SOLVES_TO_MASTER
 const chunkPercent =
 currentChunkTarget > 0 ? Math.round((totalFastSolves / currentChunkTarget) * 100) : 0
 const masteredPuzzleCount = chunkProgress.filter(
 (item) => item.fastSolves >= FAST_SOLVES_TO_MASTER
 ).length
 const chunkProgressDisplay = getChunkProgressDisplay({
  currentPuzzleIndex: currentIndex,
  totalPuzzleCount: puzzles.length,
  completedPuzzleCount: masteredPuzzleCount,
 })

 const sideToMoveText =
 phase === 'finished' ? 'Finished' : displayTurn === 'w' ? 'White' : 'Black'

 const sideSquareColor =
 phase === 'finished'
 ? '#c9a227'
 : displayTurn === 'w'
 ? '#ffffff'
 : '#111111'

 const customSquareStyles = {
 ...getMoveHighlightStyles(lastMoveHighlight),
 ...(replySquare
 ? {
 [replySquare]: {
 background:
 'radial-gradient(circle, rgba(255,255,0,0.18) 35%, rgba(255,255,0,0.38) 36%)',
 },
 }
 : {}),
 ...(selectedSquare
 ? {
 [selectedSquare]: {
 background:
 'radial-gradient(circle, rgba(80,160,255,0.28) 38%, rgba(80,160,255,0.55) 39%)',
 boxShadow: 'inset 0 0 10px rgba(80,160,255,0.85)',
 },
 }
 : {}),
 ...(legalTargets.reduce<Record<string, CSSProperties>>((acc, square) => {
 acc[square] = {
 background:
 'radial-gradient(circle, rgba(80,180,255,0.28) 26%, rgba(80,180,255,0.58) 27%, rgba(80,180,255,0.22) 42%, transparent 43%)',
 }
 return acc
 }, {})),
 ...(correctSquare
 ? {
 [correctSquare]: {
 background:
 'radial-gradient(circle, rgba(120,255,120,0.35) 40%, rgba(120,255,120,0.6) 41%)',
 boxShadow: 'inset 0 0 10px rgba(120,255,120,0.8)',
 },
 }
 : {}),
 }
 const hintArrow =
 hintMoveUci && !boardLocked
 ? [[hintMoveUci.slice(0, 2), hintMoveUci.slice(2, 4), 'rgb(242, 193, 78)']] as [
 string,
 string,
 string,
 ][]
 : []

 const correctPos = correctSquare
 ? squareToCoords(correctSquare, boardSize, boardOrientation)
 : null

 const animatedReplyStartPos = animatedReply
 ? squareToCoords(animatedReply.from, boardSize, boardOrientation)
 : null

 const animatedReplyEndPos = animatedReply
 ? squareToCoords(animatedReply.to, boardSize, boardOrientation)
 : null

 const animatedReplyStyle =
 animatedReply && animatedReplyStartPos && animatedReplyEndPos
 ? {
 position: 'absolute' as const,
 pointerEvents: 'none' as const,
 zIndex: 40,
 width: animatedReplyStartPos.squareSize,
 height: animatedReplyStartPos.squareSize,
 left:
 animatedReply.phase === 'move'
 ? animatedReplyEndPos.left
 : animatedReplyStartPos.left,
 top:
 animatedReply.phase === 'move'
 ? animatedReplyEndPos.top
 : animatedReplyStartPos.top,
 transition:
 animatedReply.phase === 'move'
 ? `left ${BOARD_ANIMATION_MS}ms linear, top ${BOARD_ANIMATION_MS}ms linear`
 : 'none',
 }
 : null

 const mixedTacticStage = Math.max(1, Number(config.trainerKey.match(/m([1-4])$/)?.[1] ?? 1))
 const curriculumMixedUnlocked = mixedCurriculum
  ? isMixedUnlocked("tactics", getStageThemes("tactics", mixedTacticStage), mixedCurriculum)
  : false
 const unlockedMixedThemes = curriculumMixedUnlocked ? themesForMixedScope({
  area: "tactics",
  availableThemes: mixedAvailableThemes,
  scope: "unlocked",
  curriculum: mixedCurriculum,
 }) : []
 const blindMixedUnlock = getBlindMixedUnlockStatus(accountStorageKey(config.trainerKey, accountId))
 const beginMixedScope = (scope: MixedSessionScope, phase: MixedSessionPhase) => {
  if (scope === "unlocked" && phase === "blind" && !blindMixedUnlock.unlocked) return
  setMixedScope(scope)
  setMixedPhase(phase)
  rememberMixedScope(accountStorageKey(config.trainerKey, accountId), scope)
  rememberMixedPhase(accountStorageKey(config.trainerKey, accountId), phase)
  const params = new URLSearchParams(window.location.search)
  params.set("mixedScope", scope)
  params.set("mixedPhase", phase)
  window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}${window.location.hash}`)
  setMixedScopeConfirmed(true)
 }

 if (isMixedPatternTactic && !mixedScopeConfirmed && chunkFiles.length > 0) {
  const unlockedLabel = unlockedMixedThemes.length
   ? unlockedMixedThemes.map(formatMixedThemeName).join(", ")
   : "No focused themes are unlocked yet"
  const allLabel = mixedAvailableThemes.map(formatMixedThemeName).join(", ")
  return (
   <div style={{ minHeight: "100dvh", background: "#161512", color: "#f3f3f3", padding: "max(24px, 6vh) 20px 120px", fontFamily: "Arial, sans-serif" }}>
    <section style={{ maxWidth: 620, margin: "0 auto", background: "#292622", border: "1px solid #514b43", borderRadius: 14, padding: 24 }}>
     <h1 style={{ marginTop: 0 }}>{config.trainerTitle}</h1>
     <p style={{ lineHeight: 1.5 }}>Choose a theme scope and difficulty phase. Theme rotation and canonical-puzzle deduplication apply in both modes.</p>
     <div style={{ display: "grid", gap: 12 }}>
      <button type="button" disabled={!unlockedMixedThemes.length} onClick={() => beginMixedScope("unlocked", "identified")} style={{ padding: 14, textAlign: "left", cursor: unlockedMixedThemes.length ? "pointer" : "not-allowed" }}>
       <strong>Identified mixed</strong><br />Unlocked review: {unlockedLabel}<br /><span>Theme shown before each puzzle</span>
      </button>
      <button type="button" disabled={!unlockedMixedThemes.length || !blindMixedUnlock.unlocked} onClick={() => beginMixedScope("unlocked", "blind")} style={{ padding: 14, textAlign: "left", cursor: unlockedMixedThemes.length && blindMixedUnlock.unlocked ? "pointer" : "not-allowed" }}>
       <strong>Blind mixed</strong><br />Unlocked review: theme hidden until after your answer<br />
       {!blindMixedUnlock.unlocked && <span>Unlock by completing identified mixed with 80% accuracy in 3 sessions ({blindMixedUnlock.qualifyingSessions}/3 temporary device-local sessions).</span>}
      </button>
      <button type="button" onClick={() => beginMixedScope("all", "identified")} style={{ padding: 14, textAlign: "left", cursor: "pointer" }}>
       <strong>Practice all themes — identified</strong><br />{allLabel}
      </button>
      <button type="button" onClick={() => beginMixedScope("all", "blind")} style={{ padding: 14, textAlign: "left", cursor: "pointer" }}>
       <strong>Practice all themes — blind</strong><br />Theme hidden until after your answer
      </button>
     </div>
     <p style={{ marginBottom: 0, color: "#c7c0b5", fontSize: 14 }}>All-theme practice is non-curriculum review: it does not unlock focused themes, raise a difficulty ceiling, or award focused-theme mastery.</p>
    </section>
   </div>
  )
 }

 if (loading) {
 return (
 <div
 style={{
 minHeight: '100vh',
 background: '#161512',
 color: '#f3f3f3',
 display: 'flex',
 alignItems: 'center',
 justifyContent: 'center',
 fontFamily: 'Arial, sans-serif',
 fontSize: 24,
 fontWeight: 700,
 }}
 >
 Loading puzzles...
 </div>
 )
 }

 if (loadError && puzzles.length === 0) {
 return (
 <div
 data-testid="pattern-tactic-load-error"
 style={{
 minHeight: '100vh',
 background: '#161512',
 color: '#f3f3f3',
 padding: 40,
 fontFamily: 'Arial, sans-serif',
 }}
 >
 <h1>{config.trainerTitle}</h1>
 <p>Training data is unavailable. The board has been disabled.</p>
 <p style={{ color: '#ffd6d3' }}>{loadError}</p>
 </div>
 )
 }

 if (!currentPuzzle && phase !== 'finished') {
 return (
 <div
 style={{
 minHeight: '100vh',
 background: '#161512',
 color: '#f3f3f3',
 padding: 40,
 fontFamily: 'Arial, sans-serif',
 }}
 >
 <h1>{config.trainerTitle}</h1>
 <p>No puzzles found.</p>
 {loadError && <p>{loadError}</p>}
 </div>
 )
 }

 const boardPlayerLabels = config.renderBoardPlayerLabels?.(currentPuzzle, boardOrientation)

 return (
 <TrainerShell
 title={config.trainerTitle}
 onBack={config.backHref ? () => backToParent(config.backHref) : undefined}
 subtitle={isMixedPatternTactic && mixedPhase === "blind"
  ? `${mixedScope === "unlocked" ? "Unlocked" : "All-theme"} blind mixed review`
  : isMixedPatternTactic && mixedSessionThemes.length
  ? `${mixedScope === "unlocked" ? "Unlocked review" : "All-theme practice"}: ${mixedSessionThemes.map(formatMixedThemeName).join(", ")}`
  : currentChunkFileName || 'chunk'}
 sidePanelWidth={610}
 maxWidth={1720}
 preventPageScroll
 boardSize={boardSize}
 isDragging={isDragging}
 isHandleHovered={isHandleHovered}
 setIsDragging={setIsDragging}
 setIsHandleHovered={setIsHandleHovered}
 containerRef={containerRef}
 footerLeft={config.trainerTitle}
 footerRight={`${boardSize}px`}
 boardTop={boardPlayerLabels?.top}
 boardBottom={boardPlayerLabels?.bottom}
 boardControls={
  <>
  <VoiceMoveInput
   fen={boardFen}
   positionKey={`${currentPuzzle?.id ?? 'loading'}:${currentUserMoveIndexRef.current}:${boardFen}`}
   disabled={solved || boardLocked || phase !== 'solving'}
   mode={inputMode}
   setMode={setInputMode}
   onAiReady={setAiReady}
   getPositionShownAt={() => {
    const snapshot = perfectionTrackerRef.current.snapshot()
    return snapshot.active ? snapshot.positionActiveAt : null
   }}
   onMove={(move, timing) => {
    if (solved || boardLocked || !currentPuzzle || phase !== 'solving') return false
    hideCoachMistake()
    setSelectedSquare(null)
    setLegalTargets([])
    return submitVoiceMove(game.fen(), move, timing, perfectionTrackerRef.current, attemptUserMove)
   }}
   onIllegalAnswer={(command, timing) => {
    if (solved || boardLocked || !currentPuzzle || phase !== 'solving') return false
    return submitIllegalVoiceAnswer(game.fen(), command, timing, perfectionTrackerRef.current,
     handleSilentError)
   }}
  />
  <AccessibleMoveInput
   key={`${currentPuzzle?.id ?? "loading"}:${currentUserMoveIndexRef.current}`}
   resetKey={`${currentPuzzle?.id ?? "loading"}:${currentUserMoveIndexRef.current}`}
   orientation={boardOrientation}
   timedMasteryEnabled={timedMasteryEnabled}
   disabled={!mouseEnabled || solved || boardLocked || phase !== "solving"}
   onSquareClick={onSquareClick}
  />
  </>
 }
 board={
 <div
 style={{
 position: 'relative',
 width: boardSize,
 height: boardSize,
 }}
 >
<ThemedChessboard
 id={`${config.trainerKey}-board`}
 position={boardFen}
 boardOrientation={boardOrientation}
 accessibilityTitle={config.trainerTitle}
 accessibilitySelectedSquare={selectedSquare}
 accessibilityInteraction="Use Keyboard move controls below the board, or select a source and destination square by click or drag."
 onPieceDragBegin={(_piece, sourceSquare) => {
  beginPieceIntent(sourceSquare, 'drag')
 }}
 onPieceDragEnd={(_piece, sourceSquare) => {
  queueMicrotask(() => {
   perfectionTrackerRef.current.finishUnresolvedDrag(sourceSquare)
  })
 }}
 onPieceDropOffBoard={(sourceSquare) => {
  perfectionTrackerRef.current.cancelIntent(sourceSquare)
 }}
 onPieceDrop={(source, target) => mouseEnabled ? onDrop(source, target) : false}
 onPromotionCheck={(
  sourceSquare,
  targetSquare
 ) => {
  const isPromotion = isTacticPromotionAttempt(
   sourceSquare,
   targetSquare
  )
  if (isPromotion) {
   perfectionTrackerRef.current.markPromotionPending(
    sourceSquare,
    targetSquare,
    performance.now(),
   )
  }
  return isPromotion
 }
 }
 onPromotionPieceSelect={(
 piece,
 sourceSquare,
 targetSquare
 ) => {
  if (!sourceSquare || !targetSquare) {
   perfectionTrackerRef.current.cancelIntent()
   return false
  }

  const promotion =
   tacticPromotionCode(piece)

  if (!promotion) {
   perfectionTrackerRef.current.cancelIntent(sourceSquare)
   return false
  }

  recordMoveIntent(sourceSquare, targetSquare, promotion)

  hideCoachMistake()

  return attemptUserMove(
   sourceSquare,
   targetSquare,
   {
    allowWrongMoveToShow: true,
    promotion,
   }
  )
 }}
 onSquareClick={(square) => { if (mouseEnabled) onSquareClick(square) }}
 arePiecesDraggable={mouseEnabled && !solved && !boardLocked && phase === 'solving'}
 boardWidth={boardSize}

 customSquareStyles={customSquareStyles}
 customArrows={hintArrow}
 customDarkSquareStyle={{ backgroundColor: '#769656' }}
 customLightSquareStyle={{ backgroundColor: '#eeeed2' }}
 customBoardStyle={{
 borderRadius: '8px',
 overflow: 'hidden',
 }}
 animationDuration={
 suppressBoardAnimation || disableBoardAnimation ? 0 : BOARD_ANIMATION_MS
 }
 promotionDialogVariant="modal"
/>
 {pendingPromotion ? (
  <PromotionChooser
   color={pendingPromotion.color}
   onCancel={() => {
    perfectionTrackerRef.current.cancelIntent(pendingPromotion.sourceSquare)
    setPendingPromotion(null)
   }}
   onSelect={(promotion: PromotionPiece) => {
    const pending = pendingPromotion
    setPendingPromotion(null)
    recordMoveIntent(pending.sourceSquare, pending.targetSquare, promotion)
    hideCoachMistake()
    attemptUserMove(pending.sourceSquare, pending.targetSquare, {
     allowWrongMoveToShow: true,
     promotion,
    })
   }}
  />
 ) : null}
 {animatedReply && animatedReplyStyle && (
 <div style={animatedReplyStyle}>
 <ThemePiece
 code={animatedReply.piece}
 size={animatedReplyStartPos?.squareSize ?? boardSize / 8}
 />
 </div>
 )}

 {correctSquare && correctPos && (
 <div
 style={{
 position: 'absolute',
 pointerEvents: 'none',
 fontSize: Math.max(14, correctPos.squareSize * 0.28),
 color: '#22c55e',
 fontWeight: 900,
 left: correctPos.left,
 top: correctPos.top,
 width: correctPos.squareSize,
 height: correctPos.squareSize,
 display: 'flex',
 alignItems: 'center',
 justifyContent: 'center',
 textShadow: '0 2px 6px rgba(0,0,0,0.5)',
 zIndex: 30,
 }}
 >
 ✓
 </div>
 )}
 {shouldShowChunkCompletionOverlay(completionOverlayResult, completionOverlayDismissed) && (
  <ChunkCompletionOverlay
   result={completionOverlayResult}
   chunkNumber={showingDebugCompletionOverlay ? 1 : currentChunkIndex + 1}
   chunkCount={showingDebugCompletionOverlay ? 5 : chunkFiles.length}
   hasNextChunk={getNextActiveLearnerChunkIndex(currentChunkIndex, chunkFiles.length) !== null}
   onContinueAuto={() => window.location.assign('/auto?continue=1')}
   onNextChunk={goToNextActiveLearnerChunk}
   onDismiss={() => {
    if (showingDebugCompletionOverlay) setDebugCompletionOverlayOpen(false)
    else setCompletionOverlayDismissed(true)
   }}
  />
 )}
 </div>
 }
 sidePanel={
 <PuzzleTrainerPanel
 boardSize={boardSize}
 explanation={trainerExplanation && <SiteExplanationBox explanation={trainerExplanation} />}
 provenance={config.renderPuzzleInfo?.(currentPuzzle, solved)}
 >

 <PanelCard style={{ padding: '14px 12px' }}>
 <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
 <div
 style={{
 width: 18,
 height: 18,
 border: '2px solid #bdbdbd',
 boxSizing: 'border-box',
 background: sideSquareColor,
 }}
 />
 <div style={{ fontSize: 16, fontWeight: 700 }}>
 {phase === 'finished' ? sideToMoveText : `${sideToMoveText} to Move`}
 </div>
 </div>
 </PanelCard>

 <PanelCard>
 <div
 style={{
 display: 'flex',
 justifyContent: 'space-between',
 gap: 10,
 fontSize: 13,
 marginBottom: 8,
 }}
 >
 <div style={{ color: '#e6e6e6', fontWeight: 700 }}>
 {currentPuzzle?.theme || 'tactic'}
 </div>
 <div style={{ color: '#d3d3d3' }} aria-label={`Current puzzle ${chunkProgressDisplay.currentPuzzleNumber} of ${chunkProgressDisplay.totalPuzzleCount}`}>
 Puzzle {chunkProgressDisplay.currentPuzzleNumber} / {chunkProgressDisplay.totalPuzzleCount}
 </div>
 </div>

 <div
 style={{
 display: 'flex',
 justifyContent: 'space-between',
 gap: 10,
 fontSize: 12,
 color: '#c5c5c5',
 }}
 >
 <div>{config.trainerTitle}</div>
 <div>Chunk {currentChunkIndex + 1}</div>
 </div>
 </PanelCard>

 {loadError && (
 <div
 style={{
 background: '#46302f',
 color: '#ffd6d3',
 borderRadius: 10,
 padding: 12,
 fontSize: 13,
 lineHeight: 1.5,
 }}
 >
 {loadError}
 </div>
 )}

 <PanelCard>
 <div
 style={{
 display: 'flex',
 justifyContent: 'space-between',
 fontSize: 13,
 marginBottom: 6,
 }}
 >
 <div style={{ color: '#dcdcdc', fontWeight: 700 }}>Chunk mastery</div>
 <div style={{ color: '#f1f1f1', fontWeight: 700 }}>
 {totalFastSolves} / {currentChunkTarget}
 </div>
 </div>

 <ProgressBar
 percent={currentChunkTarget > 0 ? (totalFastSolves / currentChunkTarget) * 100 : 0}
 style={{ marginBottom: 8 }}
 />

 <div
 style={{
 display: 'flex',
 justifyContent: 'space-between',
 fontSize: 12,
 color: '#c5c5c5',
 }}
 >
 <div>{chunkPercent}% stage mastery</div>
 <div>{chunkProgressDisplay.completedPuzzleCount} / {chunkProgressDisplay.totalPuzzleCount} puzzles completed at 5/5</div>
 </div>
 </PanelCard>

 <PanelCard>
 <SectionTitle>This puzzle</SectionTitle>

 {isMixedPatternTactic && (
 <div role="status" aria-live="polite" style={{ marginBottom: 10, fontWeight: 800, color: showMixedTheme ? '#f2c14e' : '#c5c5c5' }}>
 {showMixedTheme ? `Theme: ${currentMixedSourceTheme}` : 'Blind mixed — theme revealed after your answer'}
 </div>
 )}

 <div
 style={{
 display: 'grid',
 gridTemplateColumns: 'repeat(5, 1fr)',
 gap: 6,
 marginBottom: 8,
 }}
 >
 {Array.from({ length: FAST_SOLVES_TO_MASTER }).map((_, i) => {
 const filled = i < currentPuzzleFastSolves
 return (
 <div
 key={i}
 style={{
 height: 8,
 borderRadius: 999,
 background: filled ? '#7fa650' : '#5a5552',
 }}
 />
 )
 })}
 </div>

 <div
 style={{
 display: 'flex',
 justifyContent: 'space-between',
 fontSize: 12,
 color: '#c5c5c5',
 }}
 >
 <div>{currentPuzzleFastSolves} / {FAST_SOLVES_TO_MASTER} fast solves</div>
 <div>
  {timedMasteryEnabled
   ? `Perfect: start under ${PUZZLE_RECOGNITION_LIMIT_MS / 1000}s; every move under ${PUZZLE_MOVE_LIMIT_MS / 1000}s`
   : 'Perfect: recognition timing disabled'}
 </div>
 </div>
 </PanelCard>

 <BigMessage message={message} />

 <PanelCard>
 <div
 style={{
 display: 'flex',
 justifyContent: 'center',
 gap: 8,
 flexWrap: 'wrap',
 }}
 >
 {puzzles.map((_, i) => {
 const mastered =
 (chunkProgress[i]?.fastSolves ?? 0) >= FAST_SOLVES_TO_MASTER
 const done = i === currentIndex && solved
 return (
 <div
 key={i}
 style={{
 width: 18,
 height: 18,
 borderRadius: 3,
 background: mastered ? '#8bc34a' : done ? '#b3d98a' : '#5b5652',
 display: 'flex',
 alignItems: 'center',
 justifyContent: 'center',
 color: mastered || done ? '#fff' : 'transparent',
 fontSize: 12,
 fontWeight: 700,
 }}
 >
 ✓
 </div>
 )
 })}
 </div>
 </PanelCard>

 <PanelCard>
 <SectionTitle>Puzzle info</SectionTitle>
 <div style={{ fontSize: 12, color: '#d0d0d0', lineHeight: 1.55 }}>
 <div>Category: Tactics</div>
 <div>Theme: {currentPuzzle?.theme || 'tactic'}</div>
 <div>Puzzle ID: {currentPuzzle?.id || '-'}</div>
 <div>User moves: {getUserMoveCount(currentPuzzle)}</div>
 <div>Line length: {currentPuzzle?.solutionLine.length || 0}</div>
 <div>Chunk: {currentChunkIndex + 1} / {chunkFiles.length}</div>
 {hintMoveUci && phase !== 'finished' && (
 <div style={{ marginTop: 8, color: '#f2c14e' }}>Hint shown on board</div>
 )}
 </div>
 </PanelCard>

 <PanelCard>
 <SectionTitle>Chunk navigation</SectionTitle>

 <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
 <SecondaryButton
 onClick={goToPreviousChunk}
 disabled={loading || currentChunkIndex <= 0}
 >
 Previous
 </SecondaryButton>

 <SecondaryButton
 onClick={goToNextChunkManual}
 disabled={loading || currentChunkIndex >= chunkFiles.length - 1}
 >
 Next
 </SecondaryButton>
 </div>

 <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
 <ShellInput
 value={jumpChunkInput}
 onChange={(e) => setJumpChunkInput(e.target.value)}
 onKeyDown={(e) => {
 if (e.key === 'Enter') {
 jumpToChunk()
 }
 }}
 placeholder={`1-${Math.max(1, chunkFiles.length)}`}
 />

 <SecondaryButton
 onClick={jumpToChunk}
 disabled={loading || chunkFiles.length === 0}
 fullWidth={false}
 style={{ padding: '10px 14px' }}
 >
 Jump
 </SecondaryButton>
 </div>

 <div
 style={{
 marginTop: 8,
 fontSize: 12,
 color: '#c5c5c5',
 }}
 >
 Chunk {currentChunkIndex + 1} / {chunkFiles.length}
 </div>
 </PanelCard>

 <div className="trainer-shell-puzzle-actions" style={{ marginTop: 'auto', display: 'flex', gap: 10 }}>
 {!solved && phase !== 'finished' && (
 <HintButton
 showFloatingControl={false}
 getHintMove={() => {
 const uci = getExpectedUserMove(currentPuzzle, currentUserMoveIndexRef.current)
 return uci ? { from: uci.slice(0, 2), to: uci.slice(2, 4) } : null
 }}
 onHintStage={(move, stage) => {
 perfectionTrackerRef.current.markHintUsed()
 mixedPuzzleNeededHelpRef.current = true
 curriculumSessionEvidenceRef.current.hints += 1
 if (isMixedPatternTactic) {
  setBlindThemeRevealed(true)
 }
 setHintMoveUci(stage === 'square' ? `${move.from}${move.to}` : null)
 setMessage(
 stage === 'piece'
 ? 'The piece to move is highlighted.'
 : 'The destination square is highlighted.',
 )
 // Piece and destination hints are previews only. They must never lock the
 // board, disclose the stored solution, or schedule terminal auto-advance.
 }}
 onHintReset={() => {
  setHintMoveUci(null)
 }}
 hintResetKey={`${currentPuzzle?.id ?? ''}:${currentUserMoveIndexRef.current}`}
 disabled={boardLocked}
 >
 Hint
 </HintButton>
 )}

 {!solved && phase !== 'finished' && (
 <SecondaryButton
 onClick={handleSilentError}
 disabled={boardLocked}
 fullWidth={false}
 style={{ padding: '10px 12px' }}
 title="Record that the position was misunderstood even if the move is correct"
 >
 Silent error
 </SecondaryButton>
 )}

 <div style={{ display: 'contents' }}>
 <PrimaryButton
 onClick={() => {
 cancelCorrectAutoAdvance()
 if (curriculumCompletionCard) {
  window.location.assign('/auto?continue=1')
  return
 }
 if (allPuzzlesMastered()) {
 void completeChunk()
 } else {
 goToNextPuzzle()
 }
 }}
 >
 {curriculumCompletionCard ? 'Continue Auto' : allPuzzlesMastered() ? 'Continue Auto' : 'Next Puzzle'}
 </PrimaryButton>
 </div>

 <SecondaryButton disabled={restartingProgression} onClick={() => void restartCurrentChunkProgression()}>
  {restartingProgression ? 'Restarting progression...' : 'Restart progression'}
 </SecondaryButton>
 {debugChunkCompleteAllowed && (
  <SecondaryButton onClick={() => {
   setCompletionOverlayDismissed(false)
   setDebugCompletionOverlayOpen(true)
  }}>
   Preview completion
  </SecondaryButton>
 )}
 </div>

 {curriculumCompletionCard && (
 <PanelCard style={{ marginTop: 12, padding: 14 }} aria-live="polite">
  <SectionTitle>Chunk completed</SectionTitle>
  <div>{curriculumCompletionCard.theme.replace(/-/g, ' ')} · Stage {curriculumCompletionCard.stage} · Chunk {currentChunkIndex + 1} / {chunkFiles.length}</div>
  {curriculumCompletionCard.mixed && <div>Included themes: {curriculumCompletionCard.includedThemes?.map(formatMixedThemeName).join(', ') || 'Curriculum-eligible themes'}</div>}
  <div>{curriculumCompletionCard.correct} / {curriculumCompletionCard.attempts} first-attempt solves · {curriculumCompletionCard.hints} hints used</div>
  {curriculumCompletionCard.blindUnlockProgress && <div>Blind mixed progress: {curriculumCompletionCard.blindUnlockProgress.qualifyingSessions} qualifying identified sessions · {curriculumCompletionCard.blindUnlockProgress.remainingSessions} remaining on this device.</div>}
  <div>{curriculumCompletionCard.masteryIncreased ? 'Mastery increased. ' : ''}{curriculumCompletionCard.reinforcementActivated ? 'Temporary reinforcement is active. ' : ''}Continue Auto for your next recommended training.</div>
 </PanelCard>
 )}
 </PuzzleTrainerPanel>
 }
 />
 )
}
