import { updateCategoryStats } from '../../training/updateCategoryStats'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Chess } from 'chess.js'
import { hideCoachMistake, showCoachMistake } from '../../services/coach/coachPopup'
import type { Square } from 'chess.js'
import ThemedChessboard from "../../theme/ThemedChessboard"
import ThemePiece from "../../theme/ThemePiece"
import { supabase } from '../../lib/supabase'
import {
 saveTrainingProgress,
 loadTrainingProgressMap,
} from '../../lib/trainingProgress'
import { useRegisterPlayableBoard } from '../../hooks/useRegisterPlayableBoard'
import { useAnimatedReplies } from '../../hooks/useAnimatedReplies'
import { useSearchParams } from 'react-router-dom'
import TrainerShell from '../../components/trainer/TrainerShell'
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
import {
 createCanonicalExerciseIdentity,
 getOrCreateMixedSessionPlan,
 getRecentMixedCanonicalIdentities,
 recordMixedCanonicalIdentity,
 type MixedSessionCandidate,
} from "../../training/mixedSessionSelector"
import {
 MIXED_SESSION_SIZE,
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
import type { CurriculumState } from "../../training/curriculum/curriculumTypes"
import { getStageThemes } from "../../training/curriculum/curriculumCatalog"
import { isMixedUnlocked } from "../../training/curriculum/curriculumMastery"
import {
 getPatternTacticLearnerCurriculum,
 getPatternTacticLearnerCurriculaForDistance,
 getPatternTacticLegacyCompletionCredit,
 getPatternTacticPriorLearnerProgressTrainerKey,
 getPatternTacticLearnerProgressTrainerKey,
 resolvePatternTacticLearnerFacingChunkIndex,
} from "./m1toM4LearnerCurriculum"
import {
 createSemanticDisclosureCountdown,
 getSemanticDisclosureCountdownRemainingMs,
 getSemanticDisclosureCountdownSeconds,
 getSemanticDisclosurePresentation,
 getSemanticDisclosureTriggerState,
 nextSemanticDisclosureState,
 pauseSemanticDisclosureCountdown,
 resumeSemanticDisclosureCountdown,
 type SemanticDisclosureCountdown,
 type SemanticDisclosureEvent,
 type SemanticDisclosureOutcome,
} from "./semanticDisclosure"

type ManifestFile = {
 category?: string
 theme?: string
 subtheme?: string
 totalPuzzles?: number
 chunkSize?: number
 totalChunks?: number
 files?: string[]
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

type LichessChunkPuzzle = {
 id?: string
 lichessId?: string
 localId?: string
 fen?: string
 moves?: string[]
 preMove?: string
 solution?: string | string[]
 solutionLine?: string[]
 userMoveIndexes?: number[]
 label?: string
 theme?: string
 subtheme?: string
 rating?: number
 themes?: string[]
 gameUrl?: string
 openingTags?: string[]
 source?: string
 sourceTheme?: string
 sourceThemeTag?: string
 sourceThemeKeys?: string[]
 sourceThemes?: string[]
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
}

export type PatternTacticPuzzle = {
 id: string
 fen: string
 preMove?: string
 solutionLine: string[]
 userMoveIndexes: number[]
 label: string
 theme: string
 chunkNumber: number
 chunkIndex: number
 rating?: number
 sourceTheme?: string
 canonicalThemeKey?: string
 canonicalThemeLabel?: string
 rawTags?: string[]
 sourceIdentity?: string
 canonicalIdentity?: string
 pedagogicalFamily?: string
 semanticAudit?: LichessChunkPuzzle['semanticAudit']
}

type PuzzleMastery = {
 fastSolves: number
}

type TacticHintLevel = 'none' | 'piece' | 'square' | 'solution'

type Phase = 'loading' | 'solving' | 'correct' | 'wrong' | 'finished'

export type PatternTacticTrainerConfig = {
 trainerKey: string
 trainerTitle: string
 dataBasePath: string
 explanationKey?: SiteExplanationKey
 studyCourse?: string
 studyTheme?: string
 onPuzzleSolved?: (payload: {
 puzzleId: string
 wasFast: boolean
 solvedInSeconds: number | null
 course?: string
 theme?: string
 }) => void
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

const FAST_SOLVES_TO_MASTER = 5
const FAST_SOLVE_SECONDS_PER_MOVE = 3
const TACTIC_CHUNK_REVIEW_INTERVALS_DAYS = [1, 2, 3, 5, 8, 15, 30, 60, 100, 140, 170, 270, 365] as const

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

const AUTO_NEXT_DELAY_MS = 1500
const BOARD_ANIMATION_MS = 140
const REPLY_PAUSE_AFTER_MS = 80
const PREMOVE_START_DELAY_MS = 320
const PREMOVE_AFTER_PLAY_DELAY_MS = 450

type SavedState = {
 currentChunkIndex: number
 currentPuzzleIndex: number
 chunkProgressByFile: Record<string, number[]>
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
 raw: LichessChunkPuzzle,
 index: number
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
 fen,
 preMove: raw.preMove,
 solutionLine,
 userMoveIndexes,
 chunkNumber,
  chunkIndex,
  rating: raw.rating,
  sourceTheme: raw.canonicalThemeKey || raw.sourceThemeTag || raw.sourceTheme || raw.sourceThemeKeys?.[0] || raw.sourceThemes?.[0] || raw.themes?.[0] || raw.theme || 'tactic',
  canonicalThemeKey: raw.canonicalThemeKey,
  canonicalThemeLabel: raw.canonicalThemeLabel,
  rawTags: raw.rawTags,
  sourceIdentity: String(raw.puzzleId || raw.lichessId || raw.lichess_id || raw.PuzzleId || raw.localId || raw.id || index + 1),
  pedagogicalFamily: raw.pedagogicalFamily ?? raw.learnerCurriculum?.pedagogicalFamily,
  semanticAudit: raw.semanticAudit,
  }
}

function semanticExplanation(puzzle?: PatternTacticPuzzle | null) {
 const audit = puzzle?.semanticAudit
 if (!audit?.evidence) return null
 const evidence = audit.evidence as Record<string, unknown>
 const format = (value: unknown) => Array.isArray(value) ? value.join(', ') : typeof value === 'string' ? value : ''
 if (typeof evidence.explanation === 'string') return evidence.explanation
 if (Array.isArray(evidence.targets)) return `Verified fork: ${format(evidence.mover)} attacks ${format(evidence.targets)}.`
 if (Array.isArray(evidence.pins)) {
  const pin = evidence.pins[0] as Record<string, string> | undefined
  return pin ? `Verified ${audit.detectedTheme ?? 'pin'}: ${pin.attacker} pins ${pin.pinned} to ${pin.target}.` : audit.reason ?? null
 }
 if (Array.isArray(evidence.skewers)) {
  const skewer = evidence.skewers[0] as Record<string, string> | undefined
  return skewer ? `Verified skewer: ${skewer.attacker} attacks ${skewer.front}, with ${skewer.back} behind.` : audit.reason ?? null
 }
 if (Array.isArray(evidence.revealed)) return `Verified ${audit.detectedTheme ?? 'discovered tactic'}: moved piece reveals ${format(evidence.revealed)}.`
 if (evidence.promotion) return `Verified promotion: ${String(evidence.promotion)} promotion on the recorded promotion square.`
 if (evidence.move) return `Verified en-passant capture: ${String(evidence.move)}.`
 return audit.reason ?? null
}

function semanticEvidenceSquares(puzzle?: PatternTacticPuzzle | null) {
 const encoded = JSON.stringify(puzzle?.semanticAudit?.evidence ?? {})
 return [...new Set((encoded.match(/@[a-h][1-8]/g) ?? []).map((match) => match.slice(1)))]
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

function formatSeconds(value: number) {
 return value.toFixed(1)
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
 return puzzle?.userMoveIndexes.length ?? 1
}

function getExpectedUserMove(
 puzzle: PatternTacticPuzzle | undefined,
 solvedUserMoveCount: number
) {
 if (!puzzle) return null
 const lineIndex = puzzle.userMoveIndexes[solvedUserMoveCount]
 if (lineIndex == null) return null
 return puzzle.solutionLine[lineIndex] ?? null
}

function getRemainingLineAfterSolvedUserMoves(
 puzzle: PatternTacticPuzzle | undefined,
 solvedUserMoveCount: number
) {
 if (!puzzle) return []

 const nextUserLineIndex = puzzle.userMoveIndexes[solvedUserMoveCount]
 const endExclusive =
 nextUserLineIndex == null ? puzzle.solutionLine.length : nextUserLineIndex

 const start =
 solvedUserMoveCount === 0
 ? 1
 : puzzle.userMoveIndexes[solvedUserMoveCount - 1] + 1

 return puzzle.solutionLine.slice(start, endExclusive)
}

export default function PatternTacticTrainer({
 config,
}: {
 config: PatternTacticTrainerConfig
}) {
 const trainerExplanation = config.explanationKey ? siteExplanations[config.explanationKey] : null
 const isMixedPatternTactic = /^tactic-mixed-m[1-4]$/.test(config.trainerKey)

 const containerRef = useRef<HTMLDivElement | null>(null)
 const autoNextTimerRef = useRef<number | null>(null)
 const semanticAutoAdvanceTimerRef = useRef<number | null>(null)
 const semanticCountdownIntervalRef = useRef<number | null>(null)
 const semanticCountdownRef = useRef<SemanticDisclosureCountdown | null>(null)
 const semanticInteractionRef = useRef({
  hovered: false,
  focused: false,
  hidden: typeof document !== 'undefined' && document.hidden,
 })
 const semanticExplanationPanelRef = useRef<HTMLDivElement | null>(null)
 const semanticNextButtonRef = useRef<HTMLDivElement | null>(null)
 const wrongMoveTimerRef = useRef<number | null>(null)
 const preMoveTimerRef = useRef<number | null>(null)
 const solveStartedAtRef = useRef<number | null>(null)
 const currentUserMoveIndexRef = useRef(0)
 const chunkProgressRef = useRef<PuzzleMastery[]>([])
 const chunkCanBeCompletedRef = useRef(true)
 const chunkMasterySaveKeyRef = useRef<string | null>(null)
 const chunkMasteryPromiseRef = useRef<Promise<boolean> | null>(null)

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
 const requestedLearnerCurriculumVersion = searchParams.get("learnerCurriculum")
 const tacticLearnerCurriculum = getPatternTacticLearnerCurriculum(config.trainerKey)
 const tacticDistance = Math.max(1, Number(config.trainerKey.match(/m([1-4])$/)?.[1] ?? 1))
 const mixedLearnerCurricula = isMixedPatternTactic
  ? getPatternTacticLearnerCurriculaForDistance(tacticDistance)
  : []
 const learnerCurriculumVersion = tacticLearnerCurriculum?.version ?? (isMixedPatternTactic ? `m${tacticDistance}-v1` : null)
 const isLearnerFacingRequest = requestedLearnerCurriculumVersion === learnerCurriculumVersion
 const progressTrainerKey = tacticLearnerCurriculum
  ? getPatternTacticLearnerProgressTrainerKey(tacticLearnerCurriculum)
  : config.trainerKey
 const activeDataBasePath = isMixedPatternTactic
  ? `/data/learner-curricula/pattern-tactics/mixed-m${tacticDistance}-semantic-v4`
  : tacticLearnerCurriculum?.learnerDataBasePath ?? config.dataBasePath
 const urlChunkParam = searchParams.get('chunk')
 const requestedChunkIndex =
 urlChunkParam !== null && !isNaN(Number(urlChunkParam))
 ? Math.max(0, Number(urlChunkParam))
 : null
 const forcedChunkIndex = requestedChunkIndex === null
  ? null
  : resolvePatternTacticLearnerFacingChunkIndex(requestedChunkIndex, tacticLearnerCurriculum, isLearnerFacingRequest)
 const requestedMixedPhase = searchParams.get("mixedPhase") === "blind" ? "blind" : null

 const manifestFetchPath = `${activeDataBasePath}/manifest.json`
 const [currentUserId, setCurrentUserId] = useState<string | null>(null)
 const [mixedScope, setMixedScope] = useState<MixedSessionScope>(() => readRememberedMixedScope(config.trainerKey))
 const [mixedPhase, setMixedPhase] = useState<MixedSessionPhase>(() => requestedMixedPhase ?? readRememberedMixedPhase(config.trainerKey))
  const [mixedScopeConfirmed, setMixedScopeConfirmed] = useState(!isMixedPatternTactic)
 const [mixedAvailableThemes, setMixedAvailableThemes] = useState<string[]>([])
 const [mixedCurriculum, setMixedCurriculum] = useState<CurriculumState | null>(null)
  const [mixedSessionThemes, setMixedSessionThemes] = useState<string[]>([])
 const [blindThemeRevealed, setBlindThemeRevealed] = useState(false)
 const mixedSessionEvidenceRef = useRef({ attempts: 0, correct: 0, themes: new Set<string>(), recordedPuzzleIds: new Set<string>() })
 const mixedPuzzleNeededHelpRef = useRef(false)
 const storageKey = getStorageKey(
  isMixedPatternTactic ? `${config.trainerKey}:mixed-v3:${mixedScope}:${mixedPhase}` : progressTrainerKey
 )

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
 const [hintLevel, setHintLevel] = useState<TacticHintLevel>('none')
 const [semanticDisclosureRevealed, setSemanticDisclosureRevealed] = useState(false)
 const [semanticCountdownSeconds, setSemanticCountdownSeconds] = useState<number | null>(null)

 function revealSemanticDisclosure() {
  setSemanticDisclosureRevealed((current) => nextSemanticDisclosureState(current, 'reveal'))
 }

 function clearSemanticDisclosure(event: 'next-puzzle' | 'restart') {
  setSemanticDisclosureRevealed((current) => nextSemanticDisclosureState(current, event))
 }

 function isSemanticAutoAdvancePaused() {
  return semanticInteractionRef.current.hovered || semanticInteractionRef.current.focused || semanticInteractionRef.current.hidden
 }

 function clearSemanticAutoAdvance() {
  if (semanticAutoAdvanceTimerRef.current !== null) {
   window.clearTimeout(semanticAutoAdvanceTimerRef.current)
   semanticAutoAdvanceTimerRef.current = null
  }
  if (semanticCountdownIntervalRef.current !== null) {
   window.clearInterval(semanticCountdownIntervalRef.current)
   semanticCountdownIntervalRef.current = null
  }
  semanticCountdownRef.current = null
  setSemanticCountdownSeconds(null)
 }

 function updateSemanticCountdownDisplay() {
  const countdown = semanticCountdownRef.current
  if (!countdown) return
  setSemanticCountdownSeconds(getSemanticDisclosureCountdownSeconds(countdown, performance.now()))
 }

 function runSemanticAutoAdvance() {
  const countdown = semanticCountdownRef.current
  if (!countdown || isSemanticAutoAdvancePaused()) return

  const resumed = resumeSemanticDisclosureCountdown(countdown, performance.now())
  semanticCountdownRef.current = resumed
  const remainingMs = getSemanticDisclosureCountdownRemainingMs(resumed, performance.now())
  updateSemanticCountdownDisplay()

  if (remainingMs <= 0) {
   clearSemanticAutoAdvance()
   goToNextPuzzle()
   return
  }

  semanticAutoAdvanceTimerRef.current = window.setTimeout(() => {
   const activeCountdown = semanticCountdownRef.current
   if (!activeCountdown || isSemanticAutoAdvancePaused()) return
   if (getSemanticDisclosureCountdownRemainingMs(activeCountdown, performance.now()) > 0) {
    runSemanticAutoAdvance()
    return
   }
   clearSemanticAutoAdvance()
   goToNextPuzzle()
  }, remainingMs)

  semanticCountdownIntervalRef.current = window.setInterval(updateSemanticCountdownDisplay, 250)
 }

 function pauseSemanticAutoAdvance() {
  const countdown = semanticCountdownRef.current
  if (!countdown) return
  if (semanticAutoAdvanceTimerRef.current !== null) {
   window.clearTimeout(semanticAutoAdvanceTimerRef.current)
   semanticAutoAdvanceTimerRef.current = null
  }
  if (semanticCountdownIntervalRef.current !== null) {
   window.clearInterval(semanticCountdownIntervalRef.current)
   semanticCountdownIntervalRef.current = null
  }
  semanticCountdownRef.current = pauseSemanticDisclosureCountdown(countdown, performance.now())
  updateSemanticCountdownDisplay()
 }

 function resumeSemanticAutoAdvance() {
  if (!semanticCountdownRef.current || isSemanticAutoAdvancePaused()) return
  runSemanticAutoAdvance()
 }

 function scheduleSemanticAutoAdvance(outcome: SemanticDisclosureOutcome) {
  clearSemanticAutoAdvance()
  semanticCountdownRef.current = createSemanticDisclosureCountdown(outcome, performance.now())
  updateSemanticCountdownDisplay()
  runSemanticAutoAdvance()
 }

 function setSemanticHover(hovered: boolean) {
  semanticInteractionRef.current.hovered = hovered
  if (hovered) pauseSemanticAutoAdvance()
  else resumeSemanticAutoAdvance()
 }

 function setSemanticFocus(focused: boolean) {
  semanticInteractionRef.current.focused = focused
  if (focused) pauseSemanticAutoAdvance()
  else resumeSemanticAutoAdvance()
 }

 function deferSemanticFocusCheck() {
  window.setTimeout(() => {
   const activeElement = document.activeElement
   const remainsFocused = Boolean(
    semanticExplanationPanelRef.current?.contains(activeElement) ||
    semanticNextButtonRef.current?.contains(activeElement),
   )
   setSemanticFocus(remainsFocused)
  }, 0)
 }

 function advanceUserMoveIndex(nextIndex: number) {
 currentUserMoveIndexRef.current = nextIndex
 setHintMoveUci(null)
 setHintLevel('none')
 }
 const [boardLocked, setBoardLocked] = useState(true)
 const [selectedSquare, setSelectedSquare] = useState<string | null>(null)
 const [legalTargets, setLegalTargets] = useState<string[]>([])
 const [displayTurn, setDisplayTurn] = useState<'w' | 'b'>('w')
 const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>(
 'white'
 )
 const [jumpChunkInput, setJumpChunkInput] = useState('')

 const [boardSize, setBoardSize] = useState(720)
 const [isDragging, setIsDragging] = useState(false)
 const [isHandleHovered, setIsHandleHovered] = useState(false)
 const [disableBoardAnimation, setDisableBoardAnimation] = useState(false)

 const [correctSquare, setCorrectSquare] = useState<string | null>(null)

 const [chunkProgress, setChunkProgress] = useState<PuzzleMastery[]>([])

 const currentChunkFileName = chunkFiles[currentChunkIndex] || ''

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
  const onVisibilityChange = () => {
   semanticInteractionRef.current.hidden = document.hidden
   if (document.hidden) pauseSemanticAutoAdvance()
   else resumeSemanticAutoAdvance()
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  return () => document.removeEventListener('visibilitychange', onVisibilityChange)
 })

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
 const nextStage = Math.min(
 TACTIC_CHUNK_REVIEW_INTERVALS_DAYS.length,
 currentStage + 1
 )
 const intervalDays =
 TACTIC_CHUNK_REVIEW_INTERVALS_DAYS[nextStage - 1] ??
 TACTIC_CHUNK_REVIEW_INTERVALS_DAYS[
 TACTIC_CHUNK_REVIEW_INTERVALS_DAYS.length - 1
 ]
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
 if (!currentUserId || !chunkCanBeCompletedRef.current) {
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
 const promise = markChunkMastered(
 currentUserId,
 currentChunkIndex,
 masteredCount
 ).then((success) => {
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
 setTransitionCover({ fen: boardFen, orientation: boardOrientation })
 setDisableBoardAnimation(true)
 setGameAndBoardFen(nextGame)

 window.setTimeout(() => {
 requestAnimationFrame(() => {
 setDisableBoardAnimation(false)
 setTransitionCover(null)
 })
 }, 260)
 }

 async function loadChunkByIndex(
 chunkIndex: number,
 filesOverride?: string[],
 puzzleIndexOverride?: number
 ) {
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
 const sourceFiles = isMixedPatternTactic ? files : [fileName]
 const sourceLists = await Promise.all(sourceFiles.map(async (sourceFile) => {
  const res = await fetch(sourceFile.startsWith("/") ? sourceFile : `${activeDataBasePath}/${sourceFile}`)
  if (!res.ok) throw new Error(`HTTP ${res.status} while loading ${sourceFile}`)
  const data = (await res.json()) as LichessChunkPuzzle[] | { puzzles?: LichessChunkPuzzle[] }
  return Array.isArray(data) ? data : data.puzzles || []
 }))
 const rawList = sourceLists.flat()

 const normalized = rawList
 .map((item, index) => normalizePuzzle(item, index))
 .filter(Boolean) as PatternTacticPuzzle[]

 if (normalized.length === 0) {
 throw new Error(`No valid puzzles found in ${fileName}`)
 }

 const mixedSessionId = `v3:${config.trainerKey}:${mixedScope}:${mixedPhase}:${fileName}`
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
 eligibleThemes: mixedScope === "unlocked"
  ? themesForMixedScope({
   area: "tactics",
   availableThemes: candidates.map((candidate) => candidate.theme),
   scope: mixedScope,
   curriculum: mixedCurriculum,
  })
  : undefined,
 recentlySeenCanonicalIdentities: getRecentMixedCanonicalIdentities(mixedSessionId),
 sessionSize: MIXED_SESSION_SIZE,
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
 const { error: reopenError } = await supabase
 .from('user_chunk_progress')
 .update({
 is_mastered: false,
 updated_at: new Date().toISOString(),
 })
 .eq('user_id', currentUserId)
 .eq('trainer_key', progressTrainerKey)
 .eq('chunk_index', chunkNumber)

 if (reopenError) {
 console.error('Could not reopen due tactic chunk', reopenError)
 chunkCanBeCompleted = false
 } else {
 chunkReviewDue = true
 }
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
 setLoadError(`Could not load ${fileName}`)
 setPuzzles([])
 setChunkProgress([])
 setCurrentIndex(0)
 setGameAndBoardFen(new Chess())
 setBoardLocked(true)
 setPhase('finished')
 setDisplayTurn('w')
 setMessage('Could not load chunk')
 } finally {
 setLoading(false)
 }
 }

 async function restartWholeProgression() {
 clearTimers()
 clearSemanticDisclosure('restart')
 localStorage.removeItem(storageKey)

 if (currentUserId) {
 if (config.studyCourse && config.studyTheme) {
 const { error } = await supabase
 .from('training_progress')
 .delete()
 .eq('user_id', currentUserId)
 .eq('course', config.studyCourse)
 .eq('theme', config.studyTheme)

 if (error) {
 console.error('Failed to restart mate progression:', error)
 }
 }

 const { error: chunkError } = await supabase
 .from('user_chunk_progress')
 .delete()
 .eq('user_id', currentUserId)
 .eq('trainer_key', progressTrainerKey)

 if (chunkError) {
 console.error('Failed to restart mate chunk progression:', chunkError)
 }

 await ensureChunkExists(currentUserId, 1)
 }

 setMessage('Progression restarted.')
 await loadChunkByIndex(0, chunkFiles, 0)
 }
 useEffect(() => {
 async function bootstrap() {
 try {
 setLoading(true)
 setLoadError('')

 if (tacticLearnerCurriculum?.unavailableReason) {
  setChunkFiles([])
  setPuzzles([])
  setBoardLocked(true)
  setPhase('finished')
  setMessage(tacticLearnerCurriculum.unavailableReason)
  setLoadError(tacticLearnerCurriculum.unavailableReason)
  setLoading(false)
  return
 }

 const manifestRes = await fetch(manifestFetchPath)
 if (!manifestRes.ok) {
 throw new Error(`HTTP ${manifestRes.status}`)
 }

 const manifest = (await manifestRes.json()) as ManifestFile
 const files =
 manifest.files && manifest.files.length > 0 ? manifest.files : []

 if (files.length === 0) {
 throw new Error('No chunk files in manifest')
 }

 setChunkFiles(files)

 if (isMixedPatternTactic && !mixedScopeConfirmed) {
  const manifestThemes = manifest.sourceThemes?.length
   ? manifest.sourceThemes
   : (await Promise.all(files.map(async (sourceFile) => {
    const response = await fetch(sourceFile.startsWith("/") ? sourceFile : `${activeDataBasePath}/${sourceFile}`)
    if (!response.ok) throw new Error(`HTTP ${response.status} while reading mixed theme metadata`)
    const data = (await response.json()) as LichessChunkPuzzle[] | { puzzles?: LichessChunkPuzzle[] }
    const items = Array.isArray(data) ? data : data.puzzles || []
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
   .in("trainer_key", [config.trainerKey, priorLearnerKey])
  if (legacyError) {
   console.error("Could not read legacy tactic completion credit", legacyError)
  } else {
   const legacyCredit = getPatternTacticLegacyCompletionCredit((legacyRows ?? []).filter((row) => row.trainer_key === config.trainerKey), tacticLearnerCurriculum).completedActiveChunks
   const priorLearnerCompleted = tacticLearnerCurriculum.version.includes("semantic-v")
    ? new Set((legacyRows ?? []).filter((row) => row.trainer_key === priorLearnerKey && row.is_mastered === true)
      .map((row) => Number(row.chunk_index))
      .filter((chunk) => Number.isInteger(chunk) && chunk >= 1 && chunk <= (tacticDistance === 1 ? 5 : 8))).size
    : 0
   const priorLearnerCredit = tacticLearnerCurriculum.version.includes("semantic-v")
    ? Math.min(tacticLearnerCurriculum.activeChunkCount, Math.floor((priorLearnerCompleted * tacticLearnerCurriculum.activeChunkCount) / (tacticDistance === 1 ? 5 : 8)))
    : 0
   compatibilityCredit = Math.max(legacyCredit, priorLearnerCredit)
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
 Math.min(files.length - 1, Math.max(saved.currentChunkIndex ?? 0, compatibilityCredit))
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
 if (wrongMoveTimerRef.current) {
 window.clearTimeout(wrongMoveTimerRef.current)
 wrongMoveTimerRef.current = null
 }
 if (preMoveTimerRef.current) {
 window.clearTimeout(preMoveTimerRef.current)
 preMoveTimerRef.current = null
 }
 clearReplyTimer()
  if (autoNextTimerRef.current) {
   window.clearTimeout(autoNextTimerRef.current)
   autoNextTimerRef.current = null
  }
  clearSemanticAutoAdvance()
 }

 function incrementFastSolve(puzzleIndex: number) {
 setChunkProgress((prev) => {
 const next = prev.map((item, i) =>
 i === puzzleIndex
 ? {
 ...item,
 fastSolves: Math.min(item.fastSolves + 1, FAST_SOLVES_TO_MASTER),
 }
 : item
 )
 chunkProgressRef.current = next
 return next
 })
 }

 function loadPuzzleImmediate(
 puzzle: PatternTacticPuzzle,
 index: number,
 nextChunkProgressArg?: PuzzleMastery[],
 nextChunkIndexArg?: number,
 fileNameOverride?: string
 ) {
 clearTimers()
 clearSemanticDisclosure('next-puzzle')
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
 recordMixedCanonicalIdentity(servedSessionId, canonicalIdentity)

 advanceUserMoveIndex(0)

 const startChess = new Chess(puzzle.fen)

 clearReplyEffects()
 setLastMoveHighlight(null)
 setCorrectSquare(null)
 setSelectedSquare(null)
 setLegalTargets([])
 setSolved(false)
 setHintMoveUci(null)
 setHintLevel('none')
 setPhase('solving')

 setCurrentIndex(index)
    const afterPreMoveForOrientation = new Chess(puzzle.fen)
    let userTurn: 'w' | 'b' = startChess.turn()

    if (puzzle.preMove) {
      try {
        afterPreMoveForOrientation.move(parseUci(puzzle.preMove!))
        userTurn = afterPreMoveForOrientation.turn()
      } catch {
        userTurn = startChess.turn()
      }
    }

    setBoardOrientation(userTurn === 'b' ? 'black' : 'white')
    swapToPuzzlePosition(startChess)
    setDisplayTurn(userTurn)

 if (puzzle.preMove) {
 setBoardLocked(true)
 solveStartedAtRef.current = null
 setMessage('Opponent move...')

 preMoveTimerRef.current = window.setTimeout(() => {
 const afterPreMove = new Chess(puzzle.fen)

 try {
 afterPreMove.move(parseUci(puzzle.preMove!))
 } catch {
 setBoardLocked(false)
 solveStartedAtRef.current = performance.now()
 setMessage(`Find the tactic in ${getUserMoveCount(puzzle)}`)
 return
 }

 setGameAndBoardFen(afterPreMove)
 setDisplayTurn(userTurn)
 setLastMoveHighlight(puzzle.preMove!)

 preMoveTimerRef.current = window.setTimeout(() => {
 setBoardLocked(false)
 solveStartedAtRef.current = performance.now()
 setMessage(`Find the tactic in ${getUserMoveCount(puzzle)}`)
 }, PREMOVE_AFTER_PLAY_DELAY_MS)
 }, PREMOVE_START_DELAY_MS)

 return
 }

 setBoardLocked(false)
 solveStartedAtRef.current = performance.now()
 setMessage(`Find the tactic in ${getUserMoveCount(puzzle)}`)
 }

 function allPuzzlesMastered() {
 return (
 chunkProgress.length > 0 &&
 chunkProgress.every((item) => item.fastSolves >= FAST_SOLVES_TO_MASTER)
 )
 }

 function goToPreviousChunk() {
 if (loading || currentChunkIndex <= 0) return
 void loadChunkByIndex(currentChunkIndex - 1, undefined, 0)
 }

 function goToNextChunkManual() {
 if (loading || currentChunkIndex >= chunkFiles.length - 1) return
 void loadChunkByIndex(currentChunkIndex + 1, undefined, 0)
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
 void loadChunkByIndex(targetIndex, undefined, 0)
 }

 async function completeChunk() {
 const latestProgress = chunkProgressRef.current
 const chunkIsMastered =
 latestProgress.length > 0 &&
 latestProgress.every(
 (item) => item.fastSolves >= FAST_SOLVES_TO_MASTER
 )

 if (chunkIsMastered) {
 await startChunkMasterySave(latestProgress.length)
 }

 if (isMixedPatternTactic) {
  recordIdentifiedMixedSessionEvidence({
   trainerKey: config.trainerKey,
   sessionId: mixedSessionIdRef.current ?? `v3:${config.trainerKey}:${mixedScope}:${mixedPhase}:${currentChunkFileName}`,
   scope: mixedScope,
   phase: mixedPhase,
   correct: mixedSessionEvidenceRef.current.correct,
   attempts: mixedSessionEvidenceRef.current.attempts,
   representedThemes: [...mixedSessionEvidenceRef.current.themes],
  })
 }

 window.location.assign('/auto')
 }

 function goToNextPuzzle() {
 clearSemanticAutoAdvance()
 const nextChunkProgress = chunkProgress

 const chunkIsMastered =
 nextChunkProgress.length > 0 &&
 nextChunkProgress.every((item) => item.fastSolves >= FAST_SOLVES_TO_MASTER)

 if (chunkIsMastered) {
 void completeChunk()
 return
 }

 for (let i = currentIndex + 1; i < nextChunkProgress.length; i++) {
 if ((nextChunkProgress[i]?.fastSolves ?? 0) < FAST_SOLVES_TO_MASTER) {
 const nextPuzzle = puzzles[i]
 if (!nextPuzzle) return
 loadPuzzleImmediate(nextPuzzle, i)
 return
 }
 }

 for (let i = 0; i <= currentIndex; i++) {
 if ((nextChunkProgress[i]?.fastSolves ?? 0) < FAST_SOLVES_TO_MASTER) {
 const nextPuzzle = puzzles[i]
 if (!nextPuzzle) return
 loadPuzzleImmediate(nextPuzzle, i)
 return
 }
 }

 setBoardLocked(true)
 setPhase('finished')
 setDisplayTurn('w')
 setMessage('Chunk complete')
 }

 function revealStoredSolution() {
  if (!currentPuzzle || !semanticExplanation(currentPuzzle)) return

  const nextLineIndex = currentPuzzle.userMoveIndexes[currentUserMoveIndexRef.current]
  const remainingLine = currentPuzzle.solutionLine.slice(nextLineIndex ?? currentPuzzle.solutionLine.length)
  const solutionGame = new Chess(game.fen())
  const sanMoves: string[] = []

  try {
   for (const uci of remainingLine) {
    const move = solutionGame.move(parseUci(uci))
    if (!move) throw new Error(`Illegal stored solution move: ${uci}`)
    sanMoves.push(move.san)
   }
  } catch {
   setMessage('The stored solution could not be shown. Please continue with Next Puzzle.')
   return
  }

  const terminalDisclosure = getSemanticDisclosureTriggerState('solution')
  setGameAndBoardFen(solutionGame)
  setDisplayTurn(solutionGame.turn())
  setHintMoveUci(null)
  setHintLevel('solution')
  setBoardLocked(true)
  setSelectedSquare(null)
  setLegalTargets([])
  setMessage(`Solution: ${sanMoves.join(' ') || 'Line complete.'}`)
  revealSemanticDisclosure()
  if (terminalDisclosure.autoAdvanceOutcome) {
   scheduleSemanticAutoAdvance(terminalDisclosure.autoAdvanceOutcome)
  }
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

 const fastThreshold =
 getUserMoveCount(currentPuzzle) * FAST_SOLVE_SECONDS_PER_MOVE
 const wasFast = solvedInSeconds !== null && solvedInSeconds <= fastThreshold

 setGameAndBoardFen(solvedGame)
 setDisplayTurn(solvedGame.turn())
 setSolved(true)
 revealSemanticDisclosure()
 if (isMixedPatternTactic) {
  setBlindThemeRevealed(true)
  const evidence = mixedSessionEvidenceRef.current
  if (!evidence.recordedPuzzleIds.has(currentPuzzle.id)) {
   evidence.recordedPuzzleIds.add(currentPuzzle.id)
   evidence.attempts += 1
   if (!mixedPuzzleNeededHelpRef.current) evidence.correct += 1
   evidence.themes.add(normaliseMixedThemeKey(currentPuzzle.sourceTheme ?? currentPuzzle.theme, "tactics"))
  }
 }
 setBoardLocked(true)
 setSelectedSquare(null)
 setLegalTargets([])
 setPhase('correct')
 setLastMoveHighlight(playedUci)
 setCorrectSquare(moveToSquare)

 if (wasFast) {
 incrementFastSolve(currentIndex)

 const currentFastSolves = chunkProgress[currentIndex]?.fastSolves ?? 0
 const nextValue = Math.min(currentFastSolves + 1, FAST_SOLVES_TO_MASTER)

 if (config.studyCourse && config.studyTheme) {
 void saveTrainingProgress({
 course: config.studyCourse,
 theme: config.studyTheme,
 itemId: currentPuzzle?.id ?? '',
 mastery: nextValue,
 })
 }

 setMessage(
 `Correct - fast solve (${formatSeconds(
 solvedInSeconds!
 )}s - ${nextValue}/${FAST_SOLVES_TO_MASTER})`
 )
 } else {
 setMessage(
 solvedInSeconds === null
 ? 'Correct'
 : `Correct - not fast (${formatSeconds(
 solvedInSeconds
 )}s) - need <= ${fastThreshold}s`
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
 wasFast,
 solvedInSeconds,
 course: config.studyCourse,
 theme: config.studyTheme,
 })

 // Semantic Tier A puzzles keep verified evidence visible briefly before
 // advancing. Other tactic courses retain their existing auto-next behavior.
 const terminalDisclosure = getSemanticDisclosureTriggerState('correct')
 if (semanticExplanation(currentPuzzle) && terminalDisclosure.autoAdvanceOutcome) {
  scheduleSemanticAutoAdvance(terminalDisclosure.autoAdvanceOutcome)
 } else {
  autoNextTimerRef.current = window.setTimeout(() => {
   goToNextPuzzle()
  }, AUTO_NEXT_DELAY_MS)
 }
 }

 function completeCorrectMove(
 testGame: Chess,
 playedUci: string,
 moveToSquare: string
 ) {
 const solvedUserMoveCountBefore = currentUserMoveIndexRef.current
 const solvedUserMoveCountAfter = solvedUserMoveCountBefore + 1
 const totalUserMoves = getUserMoveCount(currentPuzzle)

 setSelectedSquare(null)
 setLegalTargets([])
 setLastMoveHighlight(playedUci)
 setCorrectSquare(moveToSquare)
 clearReplyEffects()

 advanceUserMoveIndex(solvedUserMoveCountAfter)

 const autoMoves = getRemainingLineAfterSolvedUserMoves(
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
 const testGame = new Chess(game.fen())

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

 const playedUci = `${move.from}${move.to}${move.promotion ?? ''}`.toLowerCase()

 if (playedUci !== expectedUci.toLowerCase()) {
 if (wrongMoveTimerRef.current) {
 window.clearTimeout(wrongMoveTimerRef.current)
 wrongMoveTimerRef.current = null
 }

 setSelectedSquare(null)
 setLegalTargets([])
 setCorrectSquare(null)
 clearReplyEffects()
 clearReplyTimer()

 try {
 showCoachMistake({
 fenBefore: game.fen(),
 userMoveSan: move.san,
 userMoveUci: playedUci,
 bestMoveUci: expectedUci,
 evalLossCp: 180,
 phase: 'middlegame',
 source: 'trainer',
 })
 } catch {
 // Coach popup should never block trainer play.
 }

 setPhase('wrong')
 revealSemanticDisclosure()
 if (isMixedPatternTactic) {
  mixedPuzzleNeededHelpRef.current = true
  setBlindThemeRevealed(true)
 }
 setMessage('Wrong move')

 if (currentUserId && solveStartedAtRef.current != null) {
 const timeMs = performance.now() - solveStartedAtRef.current
 updateCategoryStats({
 userId: currentUserId,
 category: 'tactics',
 wasCorrect: false,
 timeMs,
 })
 }

 const terminalDisclosure = getSemanticDisclosureTriggerState('wrong')
 if (semanticExplanation(currentPuzzle) && terminalDisclosure.autoAdvanceOutcome) {
  setBoardLocked(true)
  scheduleSemanticAutoAdvance(terminalDisclosure.autoAdvanceOutcome)
  return false
 }

 if (options?.allowWrongMoveToShow) {
 const resetFen = game.fen()

 setGameAndBoardFen(testGame)
 setDisplayTurn(testGame.turn())
 setLastMoveHighlight(playedUci)

 wrongMoveTimerRef.current = window.setTimeout(() => {
 const resetGame = new Chess(resetFen)
 setGameAndBoardFen(resetGame)
 setDisplayTurn(resetGame.turn())
 setLastMoveHighlight(null)
 setPhase('solving')
 setMessage(`Find the tactic in ${getUserMoveCount(currentPuzzle)}`)
 }, 2000)

 return true
 }

 wrongMoveTimerRef.current = window.setTimeout(() => {
 setPhase((prev) => (prev === 'wrong' ? 'solving' : prev))
 setMessage((prev) =>
 prev === 'Wrong move'
 ? `Find the tactic in ${getUserMoveCount(currentPuzzle)}`
 : prev
 )
 }, 700)

 return false
 }

 completeCorrectMove(testGame, playedUci, move.to)
 return true
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
 // Returning false lets react-chessboard open its
 // queen/rook/bishop/knight promotion selector.
 if (
  isTacticPromotionAttempt(
   sourceSquare,
   targetSquare
  )
 ) {
  return false
 }

 // Keep the newly created promotion coach notice alive.
  // Only clear the previous notice for an ordinary move.
  hideCoachMistake()

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
 const targets = getLegalTargets(square)
 setSelectedSquare(square)
 setLegalTargets(targets)
 }
 return
 }

 if (selectedSquare === square) {
 setSelectedSquare(null)
 setLegalTargets([])
 return
 }

 if (
  isTacticPromotionAttempt(
   selectedSquare,
   square
  )
 ) {
  const selectedPromotion =
   window.prompt(
    'Promote to q, r, b, or n:',
    'q'
   )

  const promotion =
   tacticPromotionCode(selectedPromotion)

  if (!promotion) {
   setMessage(
    'Promotion cancelled. Choose q, r, b, or n.'
   )
   return
  }

  const promotionWorked =
   attemptUserMove(
    selectedSquare,
    square,
    {
     allowWrongMoveToShow: true,
     promotion,
    }
   )

  if (promotionWorked) return
 } else {
  const moveWorked =
   attemptUserMove(
    selectedSquare,
    square
   )

  if (moveWorked) return
 }

 if (clickedPiece && clickedPiece.color === sideToMove) {
 const targets = getLegalTargets(square)
 setSelectedSquare(square)
 setLegalTargets(targets)
 } else {
 setSelectedSquare(null)
 setLegalTargets([])
 }
 }

 const currentPuzzleFastSolves = chunkProgress[currentIndex]?.fastSolves ?? 0
 const currentSemanticExplanation = semanticExplanation(currentPuzzle)
 const semanticDisclosure = getSemanticDisclosurePresentation(currentSemanticExplanation, semanticEvidenceSquares(currentPuzzle), semanticDisclosureRevealed)
 const showSemanticExplanation = semanticDisclosure.visible
 const semanticSquares = semanticDisclosure.squares
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

 const sideToMoveText =
 phase === 'finished' ? 'Finished' : displayTurn === 'w' ? 'White' : 'Black'

 const sideSquareColor =
 phase === 'finished'
 ? '#c9a227'
 : displayTurn === 'w'
 ? '#ffffff'
 : '#111111'

 const fastThresholdForCurrentPuzzle =
 getUserMoveCount(currentPuzzle) * FAST_SOLVE_SECONDS_PER_MOVE

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
 // Verified semantic relationships remain visible above transient move UI
 // until the learner explicitly changes puzzle.
 ...(semanticSquares.reduce<Record<string, CSSProperties>>((acc, square) => {
  acc[square] = {
   background: 'radial-gradient(circle, rgba(202,162,39,0.28) 34%, rgba(202,162,39,0.55) 35%, transparent 61%)',
   boxShadow: 'inset 0 0 8px rgba(242,193,78,0.72)',
  }
  return acc
 }, {})),
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
 const blindMixedUnlock = getBlindMixedUnlockStatus(config.trainerKey)
 const beginMixedScope = (scope: MixedSessionScope, phase: MixedSessionPhase) => {
  if (scope === "unlocked" && phase === "blind" && !blindMixedUnlock.unlocked) return
  setMixedScope(scope)
  setMixedPhase(phase)
  rememberMixedScope(config.trainerKey, scope)
  rememberMixedPhase(config.trainerKey, phase)
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
   <main style={{ minHeight: "100dvh", background: "#161512", color: "#f3f3f3", padding: "max(24px, 6vh) 20px 120px", fontFamily: "Arial, sans-serif" }}>
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
   </main>
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

 return (
 <TrainerShell
 title={config.trainerTitle}
 subtitle={isMixedPatternTactic && mixedPhase === "blind"
  ? `${mixedScope === "unlocked" ? "Unlocked" : "All-theme"} blind mixed review`
  : isMixedPatternTactic && mixedSessionThemes.length
  ? `${mixedScope === "unlocked" ? "Unlocked review" : "All-theme practice"}: ${mixedSessionThemes.map(formatMixedThemeName).join(", ")}`
  : currentChunkFileName || 'chunk'}
 boardSize={boardSize}
 isDragging={isDragging}
 isHandleHovered={isHandleHovered}
 setIsDragging={setIsDragging}
 setIsHandleHovered={setIsHandleHovered}
 containerRef={containerRef}
 footerLeft={config.trainerTitle}
 footerRight={`${boardSize}px`}
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
 onPieceDrop={onDrop}
 onPromotionCheck={(
  sourceSquare,
  targetSquare
 ) =>
  isTacticPromotionAttempt(
   sourceSquare,
   targetSquare
  )
 }
 onPromotionPieceSelect={(
  piece,
  sourceSquare,
  targetSquare
 ) => {
  if (!sourceSquare || !targetSquare) {
   return false
  }

  const promotion =
   tacticPromotionCode(piece)

  if (!promotion) return false

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
 onSquareClick={onSquareClick}
 arePiecesDraggable={!solved && !boardLocked && phase === 'solving'}
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
 </div>
 }
 sidePanel={
 <div
 style={{
 display: 'flex',
 flexDirection: 'column',
 gap: 16,
 minHeight: boardSize,
 }}
 >
 {trainerExplanation && <SiteExplanationBox explanation={trainerExplanation} />}

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
 <div style={{ color: '#d3d3d3' }}>
 {Math.min(currentIndex + 1, puzzles.length)} / {puzzles.length}
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
 <div>{masteredPuzzleCount} / {puzzles.length} puzzles at 5/5</div>
 </div>
 </PanelCard>

 <PanelCard>
 <SectionTitle>This puzzle</SectionTitle>

 {isMixedPatternTactic && (
 <div role="status" aria-live="polite" style={{ marginBottom: 10, fontWeight: 800, color: showMixedTheme ? '#f2c14e' : '#c5c5c5' }}>
 {showMixedTheme ? `Theme: ${currentMixedSourceTheme}` : 'Blind mixed — theme revealed after your answer'}
 </div>
 )}

 {showSemanticExplanation && (
 <div
 ref={semanticExplanationPanelRef}
 tabIndex={0}
 onPointerEnter={() => setSemanticHover(true)}
 onPointerLeave={() => setSemanticHover(false)}
 onFocus={() => setSemanticFocus(true)}
 onBlur={deferSemanticFocusCheck}
 style={{ marginBottom: 10, padding: '16px 18px', borderRadius: 8, background: '#263b2a', color: '#d8f5d0', fontSize: 16, lineHeight: 1.65, overflowWrap: 'anywhere' }}
 >
 <div role="status" aria-live="polite" aria-atomic="true">{currentSemanticExplanation}</div>
 {semanticCountdownSeconds !== null && (
  <div aria-live="off" style={{ marginTop: 8, color: '#f2c14e', fontSize: 14, fontWeight: 800 }}>
   Next puzzle in {semanticCountdownSeconds}…
  </div>
 )}
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
 <div>Fast under {fastThresholdForCurrentPuzzle}s</div>
 </div>
 </PanelCard>

 <BigMessage streak={`Fast ${totalFastSolves}`} message={message} />

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

 <div style={{ marginTop: 'auto', display: 'flex', gap: 10 }}>
 {!solved && phase !== 'finished' && (
 <HintButton
 getHintMove={() => {
 const uci = getExpectedUserMove(currentPuzzle, currentUserMoveIndexRef.current)
 return uci ? { from: uci.slice(0, 2), to: uci.slice(2, 4) } : null
 }}
 onHintStage={(move, stage) => {
 if (isMixedPatternTactic) {
  mixedPuzzleNeededHelpRef.current = true
  setBlindThemeRevealed(true)
 }
 setHintLevel(stage)
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
  setHintLevel('none')
 }}
 hintResetKey={`${currentPuzzle?.id ?? ''}:${boardFen}:${currentUserMoveIndexRef.current}`}
 disabled={boardLocked}
 >
 Hint
 </HintButton>
 )}

 {!solved &&
  phase !== 'finished' &&
  hintLevel === 'square' &&
  Boolean(semanticExplanation(currentPuzzle)) &&
  !semanticDisclosureRevealed && (
  <SecondaryButton onClick={revealStoredSolution} disabled={boardLocked}>
   Show Solution
  </SecondaryButton>
 )}

 <div ref={semanticNextButtonRef} style={{ display: 'contents' }}>
 <PrimaryButton
 onFocus={() => setSemanticFocus(true)}
 onBlur={deferSemanticFocusCheck}
 onClick={() => {
 clearSemanticAutoAdvance()
 if (allPuzzlesMastered()) {
 void completeChunk()
 } else {
 goToNextPuzzle()
 }
 }}
 >
 {allPuzzlesMastered() ? 'Continue Auto' : 'Next Puzzle'}
 </PrimaryButton>
 </div>

 <SecondaryButton onClick={() => void restartWholeProgression()}>
 Restart progression
 </SecondaryButton>
 </div>
 </div>
 }
 />
 )
}
