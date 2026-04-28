import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Chess } from 'chess.js'
import { BNEngine } from './lib/bnEngine'
import type { EngineResult } from './lib/bnEngine'
import { useRegisterPlayableBoard } from './hooks/useRegisterPlayableBoard'
import { supabase } from './lib/supabase'
import TrainerShell from './components/trainer/TrainerShell'
import {
  BigMessage,
  HintButton,
  PanelCard,
  PrimaryButton,
  ProgressBar,
  SectionTitle,
  SecondaryButton,
  ShellInput,
} from './components/trainer/ui'

type RawTrainingPosition = {
  id?: string
  label?: string
  startFen?: string
  fen?: string
  mateDistance?: number
  mate_distance?: number
  allowedMoves?: string[]
  solution?: string[]
  theme?: string
  blackKingSquare?: string
  blackKing?: string
  black_king?: string
  phase?: string
  bestmove_uci?: string
}

type TrainingPosition = {
  id: string
  label: string
  startFen: string
  mateDistance?: number
  allowedMoves: string[]
  solution?: string[]
  theme?: string
  blackKingSquare?: string
}

type PositionProgress = {
  fastSolves: number
  totalSolves: number
  mastered: boolean
}

type ThemeProgress = {
  currentChunkIndex: number
  mastered: boolean
  completedChunkFiles: string[]
}

type TrainerProgress = {
  positions: Record<string, PositionProgress>
  themes: Record<string, ThemeProgress>
  currentThemeIndex: number
}

type ThemeConfig = {
  id: string
  label?: string
  sourceTheme?: string
  chunkFiles?: string[]
  chunks?: string[]
  masteryFastSolves?: number
  maxSecondsPerMove?: number
  goal?: string
}

type VirtualThemeConfig = {
  sourceTheme?: string
  source?: string
  masteryFastSolves?: number
  maxSecondsPerMove?: number
  goal?: string
  label?: string
}

type ProgressionFile = {
  order: string[]
  themes?: Record<string, ThemeConfig>
  virtualThemes?: Record<string, VirtualThemeConfig>
  masteryFastSolves?: number
  maxSecondsPerMove?: number
  goal?: string
  basePath?: string
  chunkSize?: number
}

type GlobalChunkEntry = {
  themeIndex: number
  themeId: string
  chunkIndex: number
  chunkFile: string
  chunkNumber: number
}

type FirstIncompleteChunkResult = {
  themeIndex: number
  chunkIndex: number
  chunkFile: string
} | null

const BOARD_WIDTH_KEY = 'bnMate_boardWidth_v5'
const PROGRESS_KEY = 'bnMate_progress_v5'
const POSITION_FAST_SOLVES_TO_MASTER = 5
const CORRECT_DELAY_MS = 1600
const WRONG_DELAY_MS = 2600
const ENGINE_REPLY_DELAY_MS = 500
const ENGINE_DEPTH = 14
const NON_MATE_EVAL_SLACK_CP = 40

function moveToUci(move: { from: string; to: string; promotion?: string }) {
  return `${move.from}${move.to}${move.promotion ?? ''}`
}

function parseUciMove(uci?: string | null) {
  if (!uci || uci.length < 4) return null
  const from = uci.slice(0, 2)
  const to = uci.slice(2, 4)
  const promotion = uci.length > 4 ? uci.slice(4, 5) : undefined
  return { from, to, promotion }
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function normalizeFen(fen: string) {
  const trimmed = fen.trim()
  const parts = trimmed.split(/\s+/)
  if (parts.length === 4) return `${trimmed} 0 1`
  return trimmed
}

function normalizePosition(raw: RawTrainingPosition, index: number, chunkFile: string): TrainingPosition {
  const startFen = normalizeFen(raw.startFen || raw.fen || '')

  const allowedMoves =
    Array.isArray(raw.allowedMoves) && raw.allowedMoves.length > 0
      ? raw.allowedMoves
      : Array.isArray(raw.solution) && raw.solution.length > 0
        ? raw.solution
        : raw.bestmove_uci
          ? [raw.bestmove_uci]
          : []

  const derivedId =
    raw.id ||
    `${chunkFile}::${index}::${startFen}::${allowedMoves.join(',')}`

  const label =
    raw.label ||
    `${raw.phase || raw.theme || 'bn'} #${index + 1}`

  return {
    id: derivedId,
    label,
    startFen,
    mateDistance: raw.mateDistance ?? raw.mate_distance,
    allowedMoves,
    solution: raw.solution,
    theme: raw.theme || raw.phase,
    blackKingSquare: raw.blackKingSquare || raw.blackKing || raw.black_king,
  }
}

function getCustomSquareStyles(
  lastMove?: { from?: string; to?: string },
  markedSquare?: string | null,
  correctSquares: string[] = [],
  escapeSquares: string[] = [],
  hintSquares: string[] = []
) {
  const styles: Record<string, CSSProperties> = {}

  if (lastMove?.from) {
    styles[lastMove.from] = {
      ...(styles[lastMove.from] ?? {}),
      boxShadow: 'inset 0 0 0 4px rgba(255,255,0,0.45)',
    }
  }

  if (lastMove?.to) {
    styles[lastMove.to] = {
      ...(styles[lastMove.to] ?? {}),
      boxShadow: 'inset 0 0 0 4px rgba(255,255,0,0.45)',
      backgroundColor: 'rgba(118,150,86,0.45)',
    }
  }

  if (markedSquare) {
    styles[markedSquare] = {
      ...(styles[markedSquare] ?? {}),
      boxShadow: 'inset 0 0 0 4px rgba(255,80,80,0.82)',
      backgroundColor: 'rgba(220,60,60,0.28)',
    }
  }

  for (const square of escapeSquares) {
    styles[square] = {
      ...(styles[square] ?? {}),
      boxShadow: 'inset 0 0 0 4px rgba(255,130,40,0.82)',
      backgroundColor: 'rgba(255,145,70,0.22)',
    }
  }

  for (const square of hintSquares) {
    styles[square] = {
      ...(styles[square] ?? {}),
      boxShadow: 'inset 0 0 0 4px rgba(80,180,255,0.85)',
      backgroundColor: 'rgba(80,180,255,0.20)',
    }
  }

  for (const square of correctSquares) {
    styles[square] = {
      ...(styles[square] ?? {}),
      backgroundImage:
        "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><circle cx='12' cy='12' r='10' fill='%233fb950'/><path d='M7 12.5l3 3L17 8.5' fill='none' stroke='white' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
      backgroundRepeat: 'no-repeat',
      backgroundPosition: 'top 6px right 6px',
      backgroundSize: '18px 18px',
    }
  }

  return styles
}

function normalizeGoal(goal?: string) {
  const g = (goal ?? '').toLowerCase().trim()

  if (
    g === 'phase1_h_file' ||
    g === 'h_file' ||
    g === 'file_h' ||
    g === 'reach_file_h' ||
    g === 'reach h file' ||
    g === 'black king reaches file h' ||
    g === 'king_to_h_file'
  ) {
    return 'h_file'
  }

  if (
    g === 'phase1_h8' ||
    g === 'h8' ||
    g === 'reach_h8' ||
    g === 'reach h8' ||
    g === 'black king reaches h8' ||
    g === 'king_to_h8'
  ) {
    return 'h8'
  }

  if (
    g === 'phase1_full_mate' ||
    g === 'mate' ||
    g === 'checkmate' ||
    g === 'full_mate'
  ) {
    return 'checkmate'
  }

  return g
}

function getBlackKingSquare(game: Chess) {
  const board = game.board()
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file]
      if (piece && piece.type === 'k' && piece.color === 'b') {
        const fileChar = 'abcdefgh'[file]
        const rankChar = String(8 - rank)
        return `${fileChar}${rankChar}`
      }
    }
  }
  return null
}

function getBlackKingEscapeSquares(game: Chess) {
  const moves = game.moves({ verbose: true }) as Array<{
    from: string
    to: string
    piece: string
    color: string
  }>

  return moves
    .filter((m) => m.color === 'b' && m.piece === 'k')
    .map((m) => m.to)
}

function formatSquares(squares: string[]) {
  if (squares.length === 0) return 'none'
  return squares.join(', ')
}

function evaluateGoal(game: Chess, goal?: string) {
  const normalized = normalizeGoal(goal)

  if (normalized === 'checkmate') {
    return game.isCheckmate()
  }

  const bk = getBlackKingSquare(game)
  if (!bk) return false

  if (normalized === 'h_file') {
    return bk[0] === 'h'
  }

  if (normalized === 'h8') {
    return bk === 'h8'
  }

  return false
}

function getInstructionText(position: TrainingPosition | null, themeConfig: ThemeConfig | null) {
  if (!position || !themeConfig) return 'Find an accepted move'

  const goal = normalizeGoal(themeConfig.goal)

  if (goal === 'h_file') return 'Drive the black king to the h-file'
  if (goal === 'h8') return 'Drive the black king to h8'
  if (goal === 'checkmate') return 'Finish the mate'

  if (typeof position.mateDistance === 'number') {
    if (position.mateDistance === 1) return 'Find the mate in 1'
    return `Find the winning move (mate in ${position.mateDistance})`
  }

  return 'Find an accepted move'
}

function createEmptyThemeProgress(): ThemeProgress {
  return {
    currentChunkIndex: 0,
    mastered: false,
    completedChunkFiles: [],
  }
}

function createEmptyTrainerProgress(order: string[] = []): TrainerProgress {
  const themes: Record<string, ThemeProgress> = {}

  for (const themeId of order) {
    themes[themeId] = createEmptyThemeProgress()
  }

  return {
    positions: {},
    themes,
    currentThemeIndex: 0,
  }
}

async function loadStoredProgress(): Promise<TrainerProgress | null> {
  let localProgress: TrainerProgress | null = null

  const raw = localStorage.getItem(PROGRESS_KEY)
  if (raw) {
    try {
      localProgress = JSON.parse(raw) as TrainerProgress
    } catch {
      localProgress = null
    }
  }

  const { data: authData } = await supabase.auth.getUser()
  const user = authData.user

  if (!user) return localProgress

  const { data, error } = await supabase
    .from('training_progress')
    .select('item_id, mastery')
    .eq('user_id', user.id)
    .eq('course', 'endgame')
    .eq('theme', 'bn')

  if (error || !data) return localProgress

  const merged = localProgress ?? createEmptyTrainerProgress([])

  for (const row of data) {
    const itemId = String(row.item_id ?? '')
    const mastery = Number(row.mastery ?? 0)

    if (!itemId) continue

    merged.positions[itemId] = {
      fastSolves: mastery,
      totalSolves: Math.max(merged.positions[itemId]?.totalSolves ?? 0, mastery),
      mastered: mastery >= POSITION_FAST_SOLVES_TO_MASTER,
    }
  }

  return merged
}

function mergeProgress(order: string[], stored: TrainerProgress | null): TrainerProgress {
  const base = createEmptyTrainerProgress(order)
  if (!stored) return base

  const merged: TrainerProgress = {
    positions: stored.positions ?? {},
    themes: {},
    currentThemeIndex: Math.min(stored.currentThemeIndex ?? 0, Math.max(0, order.length - 1)),
  }

  for (const themeId of order) {
    merged.themes[themeId] = {
      ...createEmptyThemeProgress(),
      ...(stored.themes?.[themeId] ?? {}),
    }
  }

  return merged
}

async function saveProgress(progress: TrainerProgress) {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress))

  const { data: authData } = await supabase.auth.getUser()
  const user = authData.user
  if (!user) return

  const rows = Object.entries(progress.positions).map(([itemId, stats]) => ({
    user_id: user.id,
    course: 'endgame',
    theme: 'bn',
    item_id: itemId,
    mastery: stats.fastSolves,
    updated_at: new Date().toISOString(),
  }))

  if (rows.length === 0) return

  const { error } = await supabase
    .from('training_progress')
    .upsert(rows, {
      onConflict: 'user_id,course,theme,item_id',
    })

  if (error) {
    console.error('Failed to save BN progress:', error)
  }
}

function buildThemeConfig(progression: ProgressionFile, themeId: string): ThemeConfig {
  const baseTheme = progression.themes?.[themeId]
  const virtualTheme = progression.virtualThemes?.[themeId]

  if (virtualTheme) {
    const sourceThemeId = virtualTheme.sourceTheme || virtualTheme.source
    const sourceThemeBase = sourceThemeId ? progression.themes?.[sourceThemeId] : undefined

    return {
      id: themeId,
      label: virtualTheme.label ?? themeId,
      sourceTheme: sourceThemeId,
      chunkFiles: sourceThemeBase?.chunkFiles ?? sourceThemeBase?.chunks ?? [],
      chunks: sourceThemeBase?.chunks ?? sourceThemeBase?.chunkFiles ?? [],
      masteryFastSolves:
        virtualTheme.masteryFastSolves ?? progression.masteryFastSolves ?? 30,
      maxSecondsPerMove:
        virtualTheme.maxSecondsPerMove ?? progression.maxSecondsPerMove ?? 3,
      goal: virtualTheme.goal ?? progression.goal,
    }
  }

  return {
    id: themeId,
    label: baseTheme?.label ?? themeId,
    sourceTheme: baseTheme?.sourceTheme,
    chunkFiles: baseTheme?.chunkFiles ?? baseTheme?.chunks ?? [],
    chunks: baseTheme?.chunks ?? baseTheme?.chunkFiles ?? [],
    masteryFastSolves: baseTheme?.masteryFastSolves,
    maxSecondsPerMove: baseTheme?.maxSecondsPerMove ?? progression.maxSecondsPerMove ?? 3,
    goal: baseTheme?.goal,
  }
}

function resolveChunkFiles(themeConfig: ThemeConfig) {
  return themeConfig.chunkFiles ?? themeConfig.chunks ?? []
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(path)
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`)
  }
  return response.json()
}

function getPositionStats(progress: TrainerProgress | null, positionId: string): PositionProgress {
  if (!progress) {
    return { fastSolves: 0, totalSolves: 0, mastered: false }
  }
  return progress.positions[positionId] ?? { fastSolves: 0, totalSolves: 0, mastered: false }
}

function chooseRandomUnmasteredIndex(
  nextPositions: TrainingPosition[],
  trainerProgress: TrainerProgress,
  excludePositionId?: string | null
) {
  const unmastered = nextPositions.filter((p) => !getPositionStats(trainerProgress, p.id).mastered)
  if (unmastered.length === 0) return 0

  const filtered =
    excludePositionId && unmastered.length > 1
      ? unmastered.filter((p) => p.id !== excludePositionId)
      : unmastered

  const source = filtered.length > 0 ? filtered : unmastered
  const chosen = source[Math.floor(Math.random() * source.length)]
  const index = nextPositions.findIndex((p) => p.id === chosen.id)
  return index === -1 ? 0 : index
}

function isStrictTrainingChunk(chunkFile: string | null) {
  if (!chunkFile) return false
  return /^107_phase1_center_chunk_/i.test(chunkFile)
    || /^108_phase1_center_chunk_/i.test(chunkFile)
    || /^109_phase1_center_chunk_/i.test(chunkFile)
    || /^110_phase1_center_chunk_/i.test(chunkFile)
    || /^111_phase1_center_chunk_/i.test(chunkFile)
    || /^112_phase1_center_chunk_/i.test(chunkFile)
    || /^113_phase1_center_chunk_/i.test(chunkFile)
    || /^114_phase1_center_chunk_/i.test(chunkFile)
    || /^115_phase1_center_chunk_/i.test(chunkFile)
    || /^116_phase1_center_chunk_/i.test(chunkFile)
}

function getEvalBarSplit(engineInfo: EngineResult | null) {
  if (engineInfo?.mate !== null && engineInfo?.mate !== undefined) {
    return engineInfo.mate > 0 ? 92 : 8
  }

  if (engineInfo?.eval !== null && engineInfo?.eval !== undefined) {
    const clamped = Math.max(-4, Math.min(4, engineInfo.eval))
    return Math.max(5, Math.min(95, 50 + clamped * 10))
  }

  return 50
}

function getTopEvalLabel(engineInfo: EngineResult | null) {
  if (engineInfo?.mate !== null && engineInfo?.mate !== undefined) {
    return engineInfo.mate > 0 ? `M${Math.abs(engineInfo.mate)}` : ''
  }

  if (engineInfo?.eval !== null && engineInfo?.eval !== undefined && engineInfo.eval > 0) {
    return `${engineInfo.eval > 0 ? '+' : ''}${engineInfo.eval}`
  }

  return ''
}

function getBottomEvalLabel(engineInfo: EngineResult | null) {
  if (engineInfo?.mate !== null && engineInfo?.mate !== undefined) {
    return engineInfo.mate < 0 ? `M${Math.abs(engineInfo.mate)}` : ''
  }

  if (engineInfo?.eval !== null && engineInfo?.eval !== undefined && engineInfo.eval < 0) {
    return `${engineInfo.eval}`
  }

  return ''
}

function extractChunkNumber(chunkFile: string, fallbackNumber: number) {
  const leadingMatch = chunkFile.match(/^(\d+)_/)
  if (leadingMatch) return Number(leadingMatch[1])

  const chunkMatch = chunkFile.match(/chunk_(\d+)/i)
  if (chunkMatch) return Number(chunkMatch[1])

  const trailingMatch = chunkFile.match(/(\d+)(?=\.json$)/i)
  if (trailingMatch) return Number(trailingMatch[1])

  return fallbackNumber
}

function parseJumpChunkNumber(raw: string) {
  const cleaned = raw.trim()
  if (!cleaned) return null

  const digitsOnly = cleaned.replace(/[^0-9]/g, '')
  if (!digitsOnly) return null

  const value = Number(digitsOnly)
  if (!Number.isFinite(value) || value < 1) return null
  return value
}

function buildGlobalChunkLookup(progression: ProgressionFile | null) {
  if (!progression) return [] as GlobalChunkEntry[]

  const result: GlobalChunkEntry[] = []
  let ordinal = 1

  for (let themeIndex = 0; themeIndex < progression.order.length; themeIndex++) {
    const themeId = progression.order[themeIndex]
    const themeConfig = buildThemeConfig(progression, themeId)
    const chunkFiles = resolveChunkFiles(themeConfig)

    for (let chunkIndex = 0; chunkIndex < chunkFiles.length; chunkIndex++) {
      const chunkFile = chunkFiles[chunkIndex]
      result.push({
        themeIndex,
        themeId,
        chunkIndex,
        chunkFile,
        chunkNumber: extractChunkNumber(chunkFile, ordinal),
      })
      ordinal += 1
    }
  }

  return result
}

function getLegalUciMoves(game: Chess) {
  const moves = game.moves({ verbose: true }) as Array<{
    from: string
    to: string
    promotion?: string
  }>

  return moves.map((m) => moveToUci({ from: m.from, to: m.to, promotion: m.promotion }))
}

function chooseHintMove(
  game: Chess,
  currentPosition: TrainingPosition,
  currentChunkFile: string | null,
  engineInfo: EngineResult | null
) {
  const legalMoves = new Set(getLegalUciMoves(game))
  const legalAllowedMoves = currentPosition.allowedMoves.filter((uci) => legalMoves.has(uci))
  const strictChunk = isStrictTrainingChunk(currentChunkFile)
  const engineBestMove = engineInfo?.bestMove

  if (strictChunk && legalAllowedMoves.length > 0) return legalAllowedMoves[0]
  if (engineBestMove && legalMoves.has(engineBestMove)) return engineBestMove
  if (legalAllowedMoves.length > 0) return legalAllowedMoves[0]
  return null
}

async function findFirstIncompleteChunk(
  progression: ProgressionFile,
  progress: TrainerProgress
): Promise<FirstIncompleteChunkResult> {
  for (let themeIndex = 0; themeIndex < progression.order.length; themeIndex += 1) {
    const themeId = progression.order[themeIndex]
    const themeConfig = buildThemeConfig(progression, themeId)
    const chunkFiles = resolveChunkFiles(themeConfig)

    for (let chunkIndex = 0; chunkIndex < chunkFiles.length; chunkIndex += 1) {
      const chunkFile = chunkFiles[chunkIndex]

      try {
        const rawData = await fetchJson<any>(
          `/data/lichess/bn_v3/chunks/${chunkFile}`
        )

        const rawPositions = Array.isArray(rawData)
          ? rawData
          : Array.isArray(rawData?.positions)
            ? rawData.positions
            : []

        const chunkPositions = rawPositions.map((item: RawTrainingPosition, index: number) =>
          normalizePosition(item, index, chunkFile)
        )

        if (chunkPositions.length === 0) continue

        const hasUnmastered = chunkPositions.some(
          (p) => !getPositionStats(progress, p.id).mastered
        )

        if (hasUnmastered) {
          return {
            themeIndex,
            chunkIndex,
            chunkFile,
          }
        }
      } catch {
        continue
      }
    }
  }

  return null
}

export default function BNMateTrainer() {
  const [progression, setProgression] = useState<ProgressionFile | null>(null)
  const [progress, setProgress] = useState<TrainerProgress | null>(null)
  const [positions, setPositions] = useState<TrainingPosition[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [game, setGame] = useState(new Chess())
  const [status, setStatus] = useState('Loading progression...')
  const [message, setMessage] = useState('')
  const [lastMove, setLastMove] = useState<{ from?: string; to?: string }>({})
  const [markedSquare, setMarkedSquare] = useState<string | null>(null)
  const [correctSquares, setCorrectSquares] = useState<string[]>([])
  const [escapeSquares, setEscapeSquares] = useState<string[]>([])
  const [hintSquares, setHintSquares] = useState<string[]>([])
  const [inputLocked, setInputLocked] = useState(false)
  const [boardWidth, setBoardWidth] = useState(() => {
    const saved = localStorage.getItem(BOARD_WIDTH_KEY)
    return saved ? Number(saved) : 580
  })
  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>('white')
  const [moveTimesMs, setMoveTimesMs] = useState<number[]>([])
  const [loadingChunk, setLoadingChunk] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [engineReady, setEngineReady] = useState(false)
  const [engineInfo, setEngineInfo] = useState<EngineResult | null>(null)
  const [currentMoveElapsedMs, setCurrentMoveElapsedMs] = useState(0)
  const [justMated, setJustMated] = useState(false)
  const [flashSolvedPositionId, setFlashSolvedPositionId] = useState<string | null>(null)
  const [jumpChunkInput, setJumpChunkInput] = useState('')
  const [allComplete, setAllComplete] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [isHandleHovered, setIsHandleHovered] = useState(false)

  const moveStartedAtRef = useRef<number>(Date.now())
  const containerRef = useRef<HTMLDivElement | null>(null)
  const feedbackTimeoutRef = useRef<number | null>(null)
  const engineRef = useRef<BNEngine | null>(null)
  const analysisTokenRef = useRef(0)

  function getLegalTargets(fromSquare: string) {
    const moves = game.moves({ verbose: true }) as Array<{ from: string; to: string }>
    return moves
      .filter((m) => m.from === fromSquare)
      .map((m) => m.to)
  }

  useEffect(() => {
    localStorage.setItem(BOARD_WIDTH_KEY, String(boardWidth))
  }, [boardWidth])

  useEffect(() => {
    if (progress) {
      void saveProgress(progress)
    }
  }, [progress])

  useEffect(() => {
    engineRef.current = new BNEngine()
    setEngineReady(true)

    return () => {
      if (feedbackTimeoutRef.current) {
        window.clearTimeout(feedbackTimeoutRef.current)
      }
      engineRef.current?.destroy()
    }
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (loadingChunk || inputLocked || allComplete) return
      setCurrentMoveElapsedMs(Date.now() - moveStartedAtRef.current)
    }, 100)

    return () => window.clearInterval(interval)
  }, [loadingChunk, inputLocked, currentIndex, allComplete])

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!isDragging || !containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      const leftPadding = 16
      const rightPanelWidth = 340
      const dividerWidth = 18
      const minBoard = 420
      const maxBoard = Math.min(950, rect.width - rightPanelWidth - dividerWidth - leftPadding)

      const nextSize = e.clientX - rect.left - leftPadding
      const clamped = Math.max(minBoard, Math.min(maxBoard, nextSize))
      setBoardWidth(clamped)
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

  function clearHighlights() {
    setMarkedSquare(null)
    setCorrectSquares([])
    setEscapeSquares([])
    setHintSquares([])
  }

  function addCorrectSquare(square: string) {
    setCorrectSquares((prev) => (prev.includes(square) ? prev : [...prev, square]))
  }

  async function evaluatePosition(fen: string) {
    if (!engineRef.current) return null
    try {
      return await engineRef.current.analyze(fen, ENGINE_DEPTH)
    } catch {
      return null
    }
  }

  async function analyzeCurrentFen(fen: string) {
    const token = ++analysisTokenRef.current
    const result = await evaluatePosition(fen)
    if (token !== analysisTokenRef.current) return
    setEngineInfo(result)
  }

  function applyUciMoveToGame(baseFen: string, uci: string) {
    const parsed = parseUciMove(uci)
    if (!parsed) return null

    const next = new Chess(baseFen)
    const moveObj = next.move({
      from: parsed.from,
      to: parsed.to,
      promotion: parsed.promotion,
    })

    if (!moveObj) return null

    return {
      game: next,
      move: {
        from: moveObj.from,
        to: moveObj.to,
        promotion: moveObj.promotion,
      },
    }
  }

  function clearPendingFeedbackTimeout() {
    if (feedbackTimeoutRef.current) {
      window.clearTimeout(feedbackTimeoutRef.current)
      feedbackTimeoutRef.current = null
    }
  }

  function updateProgress(updater: (prev: TrainerProgress) => TrainerProgress) {
    setProgress((prev) => {
      if (!prev) return prev
      return updater(prev)
    })
  }

  const currentThemeId = useMemo(() => {
    if (!progression || !progress) return null
    return progression.order[progress.currentThemeIndex] ?? null
  }, [progression, progress])

  const currentThemeConfig = useMemo(() => {
    if (!progression || !currentThemeId) return null
    return buildThemeConfig(progression, currentThemeId)
  }, [progression, currentThemeId])

  const currentThemeProgress = useMemo(() => {
    if (!progress || !currentThemeId) return null
    return progress.themes[currentThemeId]
  }, [progress, currentThemeId])

  const currentChunkFiles = useMemo(() => {
    if (!currentThemeConfig) return []
    return resolveChunkFiles(currentThemeConfig)
  }, [currentThemeConfig])

  const currentChunkFile = useMemo(() => {
    if (!currentThemeProgress) return null
    return currentChunkFiles[currentThemeProgress.currentChunkIndex] ?? null
  }, [currentThemeProgress, currentChunkFiles])

  const globalChunkLookup = useMemo(() => buildGlobalChunkLookup(progression), [progression])

  const currentGlobalChunkNumber = useMemo(() => {
    if (!currentChunkFile) return null
    const found = globalChunkLookup.find(
      (entry) =>
        entry.themeIndex === (progress?.currentThemeIndex ?? -1)
        && entry.chunkIndex === (currentThemeProgress?.currentChunkIndex ?? -1)
        && entry.chunkFile === currentChunkFile
    )
    return found?.chunkNumber ?? null
  }, [currentChunkFile, currentThemeProgress, globalChunkLookup, progress])

  const currentPosition = positions[currentIndex] ?? null
  const currentStats = currentPosition ? getPositionStats(progress, currentPosition.id) : null

  const chunkMasteredCount = useMemo(() => {
    if (!progress) return 0
    return positions.filter((p) => getPositionStats(progress, p.id).mastered).length
  }, [positions, progress])

  const chunkFastSolveCount = useMemo(() => {
    if (!progress) return 0
    return positions.reduce((sum, p) => sum + getPositionStats(progress, p.id).fastSolves, 0)
  }, [positions, progress])

  const chunkTarget = positions.length * POSITION_FAST_SOLVES_TO_MASTER
  const themeDoneCount = useMemo(() => {
    if (!progression || !progress) return 0
    return progression.order.filter((themeId) => progress.themes[themeId]?.mastered).length
  }, [progression, progress])

  function loadPosition(index: number) {
    const p = positions[index]
    if (!p) return

    clearPendingFeedbackTimeout()
    setFlashSolvedPositionId(null)
    setCurrentIndex(index)
    setGame(new Chess(p.startFen))
    setStatus(getInstructionText(p, currentThemeConfig))
    setMessage('')
    setLastMove({})
    clearHighlights()
    setInputLocked(false)
    setMoveTimesMs([])
    setCurrentMoveElapsedMs(0)
    setJustMated(false)
    moveStartedAtRef.current = Date.now()
    void analyzeCurrentFen(p.startFen)
  }

  function loadRandomNextPosition(updatedProgress: TrainerProgress, excludePositionId?: string | null) {
    const nextIndex = chooseRandomUnmasteredIndex(positions, updatedProgress, excludePositionId)
    loadPosition(nextIndex)
  }

  function markCompletedChunksFromProgress(
    targetProgress: TrainerProgress,
    themeId: string,
    chunkFiles: string[],
    currentChunkIdx: number
  ) {
    const themeState = targetProgress.themes[themeId] ?? createEmptyThemeProgress()
    const currentChunk = chunkFiles[currentChunkIdx]
    const nextCompleted = currentChunk
      ? Array.from(new Set([...themeState.completedChunkFiles, currentChunk]))
      : themeState.completedChunkFiles

    return {
      ...targetProgress,
      themes: {
        ...targetProgress.themes,
        [themeId]: {
          ...themeState,
          completedChunkFiles: nextCompleted,
        },
      },
    }
  }

  function moveToNextTheme() {
    if (!progression || !progress) return

    const nextThemeIndex = progress.currentThemeIndex + 1
    if (nextThemeIndex >= progression.order.length) {
      setAllComplete(true)
      setStatus('All chunks complete')
      setMessage('')
      setInputLocked(true)
      return
    }

    updateProgress((prev) => ({
      ...prev,
      currentThemeIndex: nextThemeIndex,
    }))

    setFlashSolvedPositionId(null)
    setPositions([])
    setCurrentIndex(0)
    setLastMove({})
    clearHighlights()
    setInputLocked(false)
    setMoveTimesMs([])
    setCurrentMoveElapsedMs(0)
    setJustMated(false)
    setAllComplete(false)
    setStatus('Loading next theme...')
    setMessage('')
  }

  function goToThemeChunk(targetThemeIndex: number, targetChunkIndex: number) {
    if (!progress || !progression) return

    const safeThemeIndex = Math.max(0, Math.min(progression.order.length - 1, targetThemeIndex))
    const targetThemeId = progression.order[safeThemeIndex]
    if (!targetThemeId) return

    const targetThemeConfig = buildThemeConfig(progression, targetThemeId)
    const targetChunkFiles = resolveChunkFiles(targetThemeConfig)
    const safeChunkIndex = Math.max(0, Math.min(targetChunkFiles.length - 1, targetChunkIndex))

    clearPendingFeedbackTimeout()
    setFlashSolvedPositionId(null)
    setPositions([])
    setCurrentIndex(0)
    clearHighlights()
    setInputLocked(false)
    setMoveTimesMs([])
    setCurrentMoveElapsedMs(0)
    setJustMated(false)
    setAllComplete(false)
    setStatus('Loading chunk...')
    setMessage('')

    setProgress({
      ...progress,
      currentThemeIndex: safeThemeIndex,
      themes: {
        ...progress.themes,
        [targetThemeId]: {
          ...progress.themes[targetThemeId],
          currentChunkIndex: safeChunkIndex,
        },
      },
    })
  }

  function goToPrevChunk() {
    const currentIdx = globalChunkLookup.findIndex(
      (entry) =>
        entry.themeIndex === (progress?.currentThemeIndex ?? -1) &&
        entry.chunkIndex === (currentThemeProgress?.currentChunkIndex ?? -1) &&
        entry.chunkFile === currentChunkFile
    )

    if (currentIdx <= 0) {
      if (globalChunkLookup[0]) {
        goToThemeChunk(globalChunkLookup[0].themeIndex, globalChunkLookup[0].chunkIndex)
      }
      return
    }

    const prev = globalChunkLookup[currentIdx - 1]
    if (prev) {
      goToThemeChunk(prev.themeIndex, prev.chunkIndex)
    }
  }

  function goToNextChunk() {
    const currentIdx = globalChunkLookup.findIndex(
      (entry) =>
        entry.themeIndex === (progress?.currentThemeIndex ?? -1) &&
        entry.chunkIndex === (currentThemeProgress?.currentChunkIndex ?? -1) &&
        entry.chunkFile === currentChunkFile
    )

    if (currentIdx === -1) return

    const next = globalChunkLookup[Math.min(globalChunkLookup.length - 1, currentIdx + 1)]
    if (next) {
      goToThemeChunk(next.themeIndex, next.chunkIndex)
    }
  }

  function jumpToChunkByNumber(raw: string) {
    const targetNumber = parseJumpChunkNumber(raw)
    if (!targetNumber) {
      setStatus('Jump chunk')
      setMessage('Enter a valid chunk number.')
      return
    }

    const exactMatch = globalChunkLookup.find((entry) => entry.chunkNumber === targetNumber)
    if (!exactMatch) {
      setStatus('Jump chunk')
      setMessage(`Chunk ${targetNumber} not found.`)
      return
    }

    goToThemeChunk(exactMatch.themeIndex, exactMatch.chunkIndex)
    setJumpChunkInput(String(targetNumber))
  }

  useEffect(() => {
    async function boot() {
      try {
        setLoadError('')
        setStatus('Loading progression...')

        const loadedProgression = await fetchJson<ProgressionFile>(
          '/data/lichess/bn_v3/bn_v3_progression.json'
        )

        const stored = await loadStoredProgress()
        const merged = mergeProgress(loadedProgression.order ?? [], stored)

        const firstIncomplete = await findFirstIncompleteChunk(loadedProgression, merged)

        if (!firstIncomplete) {
          merged.currentThemeIndex = Math.max(0, loadedProgression.order.length - 1)

          const finalThemeId = loadedProgression.order[merged.currentThemeIndex]
          if (finalThemeId) {
            const finalThemeConfig = buildThemeConfig(loadedProgression, finalThemeId)
            const finalChunkFiles = resolveChunkFiles(finalThemeConfig)
            merged.themes[finalThemeId] = {
              ...merged.themes[finalThemeId],
              currentChunkIndex: Math.max(0, finalChunkFiles.length - 1),
              mastered: true,
              completedChunkFiles: finalChunkFiles,
            }
          }

          setAllComplete(true)
          setProgression(loadedProgression)
          setProgress(merged)
          setStatus('All chunks complete')
          setMessage('')
          setInputLocked(true)
          return
        }

        merged.currentThemeIndex = firstIncomplete.themeIndex
        const firstThemeId = loadedProgression.order[firstIncomplete.themeIndex]
        if (firstThemeId) {
          merged.themes[firstThemeId] = {
            ...merged.themes[firstThemeId],
            currentChunkIndex: firstIncomplete.chunkIndex,
          }
        }

        setAllComplete(false)
        setProgression(loadedProgression)
        setProgress(merged)
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load progression.')
        setStatus('Load failed.')
      }
    }

    void boot()
  }, [])

  useEffect(() => {
    async function loadCurrentChunk() {
      if (!progression || !progress || !currentThemeId || !currentThemeConfig || !currentChunkFile || allComplete) {
        return
      }

      try {
        setLoadingChunk(true)
        setLoadError('')
        setStatus('Loading chunk...')

        const rawData = await fetchJson<any>(
          `/data/lichess/bn_v3/chunks/${currentChunkFile}`
        )

        const rawPositions = Array.isArray(rawData)
          ? rawData
          : Array.isArray(rawData?.positions)
            ? rawData.positions
            : []

        const chunkPositions = rawPositions.map((item: RawTrainingPosition, index: number) =>
          normalizePosition(item, index, currentChunkFile)
        )

        setPositions(chunkPositions)

        if (chunkPositions.length === 0) {
          setStatus('Chunk is empty.')
          setMessage(currentChunkFile)
          return
        }

        const allChunkMastered = chunkPositions.every((p) => getPositionStats(progress, p.id).mastered)

        if (allChunkMastered) {
          const themeState = progress.themes[currentThemeId] ?? createEmptyThemeProgress()
          const chunkFiles = currentChunkFiles
          const isLastChunk = themeState.currentChunkIndex >= chunkFiles.length - 1

          const progressedWithCompletion = markCompletedChunksFromProgress(
            progress,
            currentThemeId,
            chunkFiles,
            themeState.currentChunkIndex
          )

          if (isLastChunk) {
            const nextProgress = {
              ...progressedWithCompletion,
              themes: {
                ...progressedWithCompletion.themes,
                [currentThemeId]: {
                  ...progressedWithCompletion.themes[currentThemeId],
                  mastered: true,
                },
              },
            }

            const nextThemeIndex = progress.currentThemeIndex + 1
            if (nextThemeIndex >= progression.order.length) {
              setProgress(nextProgress)
              setAllComplete(true)
              setPositions(chunkPositions)
              setStatus('All chunks complete')
              setMessage('')
              setInputLocked(true)
              return
            }

            const nextThemeId = progression.order[nextThemeIndex]
            if (nextThemeId) {
              const advanced = {
                ...nextProgress,
                currentThemeIndex: nextThemeIndex,
                themes: {
                  ...nextProgress.themes,
                  [nextThemeId]: {
                    ...nextProgress.themes[nextThemeId],
                    currentChunkIndex: nextProgress.themes[nextThemeId]?.currentChunkIndex ?? 0,
                  },
                },
              }
              setProgress(advanced)
            } else {
              setProgress(nextProgress)
            }
            return
          }

          const advanced = {
            ...progressedWithCompletion,
            themes: {
              ...progressedWithCompletion.themes,
              [currentThemeId]: {
                ...progressedWithCompletion.themes[currentThemeId],
                currentChunkIndex: Math.min(themeState.currentChunkIndex + 1, chunkFiles.length - 1),
              },
            },
          }

          setProgress(advanced)
          return
        }

        const nextIndex = chooseRandomUnmasteredIndex(chunkPositions, progress)
        const nextPosition = chunkPositions[nextIndex]

        setCurrentIndex(nextIndex)
        setGame(new Chess(nextPosition.startFen))
        setStatus(getInstructionText(nextPosition, currentThemeConfig))
        setMessage('')
        setLastMove({})
        clearHighlights()
        setInputLocked(false)
        setMoveTimesMs([])
        setCurrentMoveElapsedMs(0)
        setJustMated(false)
        setFlashSolvedPositionId(null)
        moveStartedAtRef.current = Date.now()
        void analyzeCurrentFen(nextPosition.startFen)
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : `Failed to load chunk ${currentChunkFile}`)
        setStatus('Chunk load failed.')
      } finally {
        setLoadingChunk(false)
      }
    }

    void loadCurrentChunk()
  }, [progression, currentThemeId, currentThemeConfig, currentChunkFile, currentChunkFiles, allComplete])

  function moveToNextChunkOrTheme(updatedProgress: TrainerProgress) {
    if (!currentThemeId || !currentThemeProgress || !currentThemeConfig) return

    const themeState = updatedProgress.themes[currentThemeId] ?? createEmptyThemeProgress()
    const chunkFiles = currentChunkFiles
    const currentChunkIdx = themeState.currentChunkIndex
    const currentChunk = chunkFiles[currentChunkIdx]

    const updatedChunkComplete =
      positions.length > 0 &&
      positions.every((p) => getPositionStats(updatedProgress, p.id).mastered)

    if (updatedChunkComplete) {
      const progressedWithCompletion = currentChunk
        ? {
            ...updatedProgress,
            themes: {
              ...updatedProgress.themes,
              [currentThemeId]: {
                ...themeState,
                completedChunkFiles: Array.from(new Set([...themeState.completedChunkFiles, currentChunk])),
              },
            },
          }
        : updatedProgress

      const isLastChunk = currentChunkIdx >= chunkFiles.length - 1

      if (isLastChunk) {
        const completedThemeProgress: TrainerProgress = {
          ...progressedWithCompletion,
          themes: {
            ...progressedWithCompletion.themes,
            [currentThemeId]: {
              ...progressedWithCompletion.themes[currentThemeId],
              mastered: true,
            },
          },
        }

        setProgress(completedThemeProgress)

        const nextThemeIndex = updatedProgress.currentThemeIndex + 1
        if (nextThemeIndex >= (progression?.order.length ?? 0)) {
          setAllComplete(true)
          setStatus('All chunks complete')
          setMessage('')
          setInputLocked(true)
          return
        }

        setStatus('Theme mastered.')
        setMessage(`Completed ${currentThemeConfig.label ?? currentThemeId}. Loading next theme...`)

        feedbackTimeoutRef.current = window.setTimeout(() => {
          setInputLocked(false)
          moveToNextTheme()
        }, CORRECT_DELAY_MS)
        return
      }

      const nextChunkIndex = Math.min(currentChunkIdx + 1, chunkFiles.length - 1)

      const nextProgress: TrainerProgress = {
        ...progressedWithCompletion,
        themes: {
          ...progressedWithCompletion.themes,
          [currentThemeId]: {
            ...progressedWithCompletion.themes[currentThemeId],
            currentChunkIndex: nextChunkIndex,
          },
        },
      }

      setProgress(nextProgress)
      setStatus('Chunk complete.')
      setMessage('Loading next chunk...')
      setInputLocked(false)
      return
    }

    setInputLocked(false)
    loadRandomNextPosition(updatedProgress, currentPosition?.id ?? null)
  }

  function resetCurrentPosition() {
    loadPosition(currentIndex)
    setStatus('Position restarted.')
  }

  function nextPuzzle() {
    if (!progress || positions.length === 0) return
    loadRandomNextPosition(progress, currentPosition?.id ?? null)
  }

  async function restartCurrentChunk() {
    if (!progress || positions.length === 0) return

    const nextPositions = { ...progress.positions }
    const ids = positions.map((p) => p.id)

    for (const id of ids) {
      delete nextPositions[id]
    }

    const updated = {
      ...progress,
      positions: nextPositions,
    }

    setProgress(updated)

    const { data: authData } = await supabase.auth.getUser()
    const user = authData.user

    if (user && ids.length > 0) {
      const { error } = await supabase
        .from('training_progress')
        .delete()
        .eq('user_id', user.id)
        .eq('course', 'endgame')
        .eq('theme', 'bn')
        .in('item_id', ids)

      if (error) {
        console.error('Failed to restart BN chunk:', error)
      }
    }

    const nextIndex = chooseRandomUnmasteredIndex(positions, updated, null)
    loadPosition(nextIndex)
    setStatus('Chunk restarted.')
    setMessage('')
  }

  function resetWholeProgression() {
    if (!progression) return

    clearPendingFeedbackTimeout()
    const fresh = createEmptyTrainerProgress(progression.order ?? [])

    void (async () => {
      const { data: authData } = await supabase.auth.getUser()
      const user = authData.user
      if (!user) return

      const { error } = await supabase
        .from('training_progress')
        .delete()
        .eq('user_id', user.id)
        .eq('course', 'endgame')
        .eq('theme', 'bn')

      if (error) {
        console.error('Failed to reset BN progress:', error)
      }
    })()

    localStorage.removeItem(PROGRESS_KEY)
    setAllComplete(false)
    setProgress(fresh)
    setPositions([])
    setCurrentIndex(0)
    clearHighlights()
    setInputLocked(false)
    setMoveTimesMs([])
    setCurrentMoveElapsedMs(0)
    setJustMated(false)
    setFlashSolvedPositionId(null)
    setStatus('Progression reset.')
    setMessage('')
    setEngineInfo(null)
  }

  function showWrongAndReset(
    nextGame: Chess,
    move: { from: string; to: string; promotion?: string },
    nextStatus: string,
    nextMessage: string
  ) {
    clearPendingFeedbackTimeout()

    const blackKingSquare = getBlackKingSquare(nextGame)
    const escapes = getBlackKingEscapeSquares(nextGame)

    setGame(nextGame)
    setLastMove({ from: move.from, to: move.to })
    setMarkedSquare(blackKingSquare ?? null)
    setCorrectSquares([])
    setHintSquares([])
    setEscapeSquares(escapes)
    setCurrentMoveElapsedMs(Date.now() - moveStartedAtRef.current)
    setJustMated(false)
    setStatus(nextStatus)
    setMessage(
      escapes.length > 0
        ? `${nextMessage} Escape squares: ${formatSquares(escapes)}`
        : nextMessage
    )
    setInputLocked(true)

    feedbackTimeoutRef.current = window.setTimeout(() => {
      loadPosition(currentIndex)
    }, WRONG_DELAY_MS)
  }

  function handleSolved(
    nextGame: Chess,
    correctMove: { from: string; to: string; promotion?: string }
  ) {
    if (!progress || !currentThemeId || !currentPosition || !currentThemeConfig) return

    clearPendingFeedbackTimeout()
    setFlashSolvedPositionId(currentPosition.id)

    const moveElapsedMs = Date.now() - moveStartedAtRef.current
    setCurrentMoveElapsedMs(moveElapsedMs)
    setJustMated(nextGame.isCheckmate())

    const nextMoveTimes = [...moveTimesMs, moveElapsedMs]
    setMoveTimesMs(nextMoveTimes)

    const maxSecondsPerMove = currentThemeConfig.maxSecondsPerMove ?? 3
    const maxMsPerMove = maxSecondsPerMove * 1000
    const wasFast = nextMoveTimes.every((ms) => ms <= maxMsPerMove)

    const oldStats = getPositionStats(progress, currentPosition.id)

    const nextFastSolves = wasFast
      ? Math.min(POSITION_FAST_SOLVES_TO_MASTER, oldStats.fastSolves + 1)
      : oldStats.fastSolves

    const positionMastered = nextFastSolves >= POSITION_FAST_SOLVES_TO_MASTER

    const updatedProgress: TrainerProgress = {
      ...progress,
      positions: {
        ...progress.positions,
        [currentPosition.id]: {
          fastSolves: nextFastSolves,
          totalSolves: oldStats.totalSolves + 1,
          mastered: positionMastered,
        },
      },
      themes: {
        ...progress.themes,
        [currentThemeId]: {
          ...progress.themes[currentThemeId],
        },
      },
    }

    setProgress(updatedProgress)
    setGame(nextGame)
    setLastMove({ from: correctMove.from, to: correctMove.to })
    setMarkedSquare(null)
    setEscapeSquares([])
    setHintSquares([])
    addCorrectSquare(correctMove.to)
    setInputLocked(true)

    setStatus(nextGame.isCheckmate() ? 'CHECKMATE!' : 'Correct.')
    setMessage(
      nextGame.isCheckmate()
        ? wasFast
          ? `Checkmate. Fast solve ${nextFastSolves}/${POSITION_FAST_SOLVES_TO_MASTER} for this puzzle.`
          : `Checkmate, but slower than ${maxSecondsPerMove} seconds.`
        : wasFast
          ? `Fast solve ${nextFastSolves}/${POSITION_FAST_SOLVES_TO_MASTER} for this puzzle.`
          : `Solved, but slower than ${maxSecondsPerMove} seconds.`
    )

    feedbackTimeoutRef.current = window.setTimeout(() => {
      moveToNextChunkOrTheme(updatedProgress)
    }, CORRECT_DELAY_MS)
  }

  function userMoveCompletesGoal(nextGame: Chess) {
    const goal = normalizeGoal(currentThemeConfig?.goal)

    if (goal === 'checkmate') return nextGame.isCheckmate()
    if (goal === 'h_file' || goal === 'h8') return evaluateGoal(nextGame, currentThemeConfig?.goal)
    if (typeof currentPosition?.mateDistance === 'number' && currentPosition.mateDistance === 1) {
      return nextGame.isCheckmate()
    }

    return nextGame.isCheckmate()
  }

  async function playEngineReplyIfNeeded(
    afterUserGame: Chess,
    userMove: { from: string; to: string; promotion?: string },
    afterUserInfo?: EngineResult | null
  ) {
    if (userMoveCompletesGoal(afterUserGame)) {
      handleSolved(afterUserGame, userMove)
      return
    }

    const replyInfo = afterUserInfo ?? await evaluatePosition(afterUserGame.fen())
    if (!replyInfo?.bestMove) {
      setGame(afterUserGame)
      setLastMove({ from: userMove.from, to: userMove.to })
      clearHighlights()
      setStatus(getInstructionText(currentPosition, currentThemeConfig))
      setMessage('Accepted move. No engine reply available.')
      setInputLocked(false)
      moveStartedAtRef.current = Date.now()
      setCurrentMoveElapsedMs(0)
      await analyzeCurrentFen(afterUserGame.fen())
      return
    }

    setGame(afterUserGame)
    setLastMove({ from: userMove.from, to: userMove.to })
    clearHighlights()
    setStatus('Good move.')
    setMessage(`Black is replying: ${replyInfo.bestMove}`)
    setInputLocked(true)

    await sleep(ENGINE_REPLY_DELAY_MS)

    const replyResult = applyUciMoveToGame(afterUserGame.fen(), replyInfo.bestMove)
    if (!replyResult) {
      setStatus(getInstructionText(currentPosition, currentThemeConfig))
      setMessage('Accepted move, but engine reply could not be played.')
      setInputLocked(false)
      moveStartedAtRef.current = Date.now()
      setCurrentMoveElapsedMs(0)
      await analyzeCurrentFen(afterUserGame.fen())
      return
    }

    setGame(replyResult.game)
    setLastMove({ from: replyResult.move.from, to: replyResult.move.to })
    clearHighlights()
    setStatus(getInstructionText(currentPosition, currentThemeConfig))
    setMessage(`Black played ${replyInfo.bestMove}. Your move.`)
    setInputLocked(false)
    setJustMated(false)
    moveStartedAtRef.current = Date.now()
    setCurrentMoveElapsedMs(0)
    await analyzeCurrentFen(replyResult.game.fen())
  }

  async function showHintAction() {
    if (loadingChunk || inputLocked || !currentPosition) return

    const analysis = engineInfo ?? await evaluatePosition(game.fen())
    const hintMoveUci = chooseHintMove(game, currentPosition, currentChunkFile, analysis)

    if (!hintMoveUci) {
      setStatus('Hint')
      setMessage('No legal hint available.')
      return
    }

    const parsed = parseUciMove(hintMoveUci)
    if (!parsed) {
      setStatus('Hint')
      setMessage(`Suggested move: ${hintMoveUci}`)
      return
    }

    setMarkedSquare(parsed.from)
    setHintSquares([parsed.to])
    setEscapeSquares([])
    setStatus('Hint')
    setMessage(`Try ${parsed.from} → ${parsed.to}${parsed.promotion ? ` (${parsed.promotion})` : ''}`)
  }

  async function validateByEngine(
    beforeFen: string,
    afterFen: string,
    attemptedUci: string,
    nextGame: Chess
  ) {
    const before = engineInfo ?? await evaluatePosition(beforeFen)
    const afterUser = await evaluatePosition(afterFen)

    if (!before || !afterUser) {
      return {
        ok: false,
        reason: 'Could not evaluate this move.',
        afterUser,
      }
    }

    const moveIsBest = before.bestMove === attemptedUci

    if (typeof before.mate === 'number' && before.mate > 0) {
      const afterMate = afterUser.mate
      const keepsWinningMate =
        typeof afterMate === 'number' &&
        (
          (afterMate < 0 && Math.abs(afterMate) <= before.mate) ||
          (afterMate > 0 && afterMate < before.mate)
        )

      if (!nextGame.isCheckmate() && !moveIsBest && !keepsWinningMate) {
        return {
          ok: false,
          reason: 'This move does not keep the forced mate.',
          afterUser,
        }
      }

      return { ok: true, reason: '', afterUser }
    }

    if (typeof before.mate === 'number' && before.mate < 0) {
      return {
        ok: false,
        reason: 'This move allows the king to escape the winning route.',
        afterUser,
      }
    }

    if (typeof afterUser.mate === 'number' && afterUser.mate < 0) {
      return { ok: true, reason: '', afterUser }
    }

    const evalOk =
      typeof afterUser.eval === 'number' &&
      typeof before.eval === 'number' &&
      afterUser.eval >= before.eval - NON_MATE_EVAL_SLACK_CP

    if (!moveIsBest && !evalOk) {
      return {
        ok: false,
        reason: 'Not one of the best engine moves.',
        afterUser,
      }
    }

    return { ok: true, reason: '', afterUser }
  }

  function onDrop(sourceSquare: string, targetSquare: string) {
    if (!currentPosition || !progress || !currentThemeConfig) return false
    if (loadingChunk || loadError || inputLocked || allComplete) return false

    const beforeFen = game.fen()
    const nextGame = new Chess(beforeFen)
    const moveObj = nextGame.move({
      from: sourceSquare,
      to: targetSquare,
      promotion: 'q',
    })

    if (!moveObj) return false

    const move = {
      from: moveObj.from,
      to: moveObj.to,
      promotion: moveObj.promotion,
    }

    const attemptedUci = moveToUci(move)

    if (nextGame.isStalemate()) {
      showWrongAndReset(
        nextGame,
        move,
        'Wrong move.',
        'Stalemate — avoid this.'
      )
      return true
    }

    if (nextGame.isCheckmate()) {
      handleSolved(nextGame, move)
      return true
    }

    const strictChunk = isStrictTrainingChunk(currentChunkFile)
    const hasPreparedRoute = currentPosition.allowedMoves.length > 0

    setGame(nextGame)
    setLastMove({ from: move.from, to: move.to })
    clearHighlights()
    setJustMated(false)
    setInputLocked(true)
    setStatus('Checking move...')
    setMessage(engineReady ? 'Engine is evaluating...' : 'Engine not ready.')

    void (async () => {
      const legalAllowedMoves = currentPosition.allowedMoves.filter((uci) =>
        getLegalUciMoves(new Chess(beforeFen)).includes(uci)
      )

      if ((strictChunk || hasPreparedRoute) && legalAllowedMoves.includes(attemptedUci)) {
        await playEngineReplyIfNeeded(nextGame, move)
        return
      }

      const validation = await validateByEngine(beforeFen, nextGame.fen(), attemptedUci, nextGame)

      if (!validation.ok) {
        if (strictChunk || hasPreparedRoute) {
          showWrongAndReset(
            nextGame,
            move,
            'Wrong move.',
            legalAllowedMoves.length > 0
              ? `Route move expected. ${validation.reason}`
              : validation.reason
          )
          return
        }

        showWrongAndReset(
          nextGame,
          move,
          'Wrong move.',
          validation.reason
        )
        return
      }

      await playEngineReplyIfNeeded(nextGame, move, validation.afterUser)
    })()

    return true
  }

  useRegisterPlayableBoard({
    fen: game.fen(),
    orientation: boardOrientation,
    setOrientation: setBoardOrientation,
    suggestedColor: boardOrientation,
    canFlip: true,
  })

  if (loadError) {
    return (
      <div style={{ minHeight: '100vh', background: '#262421', color: '#ffffff', padding: '24px', fontFamily: 'Arial, sans-serif' }}>
        <h1>Bishop + Knight Trainer</h1>
        <p>{loadError}</p>
      </div>
    )
  }

  if (allComplete) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#262421',
          color: '#ffffff',
          padding: '24px',
          boxSizing: 'border-box',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: '900px',
            margin: '0 auto',
            background: '#312e2b',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          }}
        >
          <div
            style={{
              display: 'inline-block',
              background: '#4b4847',
              borderRadius: '12px',
              padding: '12px 18px',
              fontWeight: 700,
              marginBottom: '18px',
            }}
          >
            B+N Mate Trainer
          </div>

          <div style={{ fontSize: '30px', fontWeight: 800, marginBottom: '12px' }}>
            All chunks complete
          </div>

          <div style={{ color: '#d6d6d6', marginBottom: '18px', lineHeight: 1.5 }}>
            You finished the full Bishop + Knight progression.
          </div>

          <button
            onClick={resetWholeProgression}
            style={{
              background: '#7a3d3d',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              padding: '12px 18px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Reset All
          </button>
        </div>
      </div>
    )
  }

  if (!progression || !progress || !currentThemeId || !currentThemeConfig || !currentThemeProgress || !currentPosition) {
    return (
      <div style={{ minHeight: '100vh', background: '#262421', color: '#ffffff', padding: '24px', fontFamily: 'Arial, sans-serif' }}>
        {status}
      </div>
    )
  }

  const progressPercent = chunkTarget > 0 ? (chunkFastSolveCount / chunkTarget) * 100 : 0
  const currentInstruction = getInstructionText(currentPosition, currentThemeConfig)
  const evalSplit = getEvalBarSplit(engineInfo)
  const topEvalLabel = getTopEvalLabel(engineInfo)
  const bottomEvalLabel = getBottomEvalLabel(engineInfo)

  const sideToMoveText = game.turn() === 'b' ? 'Black' : 'White'
  const sideSquareColor = game.turn() === 'b' ? '#111111' : '#ffffff'
  const currentFastSolves = currentStats?.fastSolves ?? 0
  const maxSecondsPerMove = currentThemeConfig.maxSecondsPerMove ?? 3

  const boardLeft = (
    <div
      style={{
        width: 38,
        height: boardWidth,
        borderRadius: 10,
        overflow: 'hidden',
        background: '#111',
        border: '1px solid #3a3a3a',
        position: 'relative',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            flex: evalSplit,
            background: '#f5f5f5',
            transition: 'all 0.25s ease',
          }}
        />
        <div
          style={{
            flex: 100 - evalSplit,
            background: '#2a2a2a',
            transition: 'all 0.25s ease',
          }}
        />
      </div>

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 4px',
          fontSize: 11,
          fontWeight: 800,
        }}
      >
        <div style={{ color: '#111' }}>{topEvalLabel}</div>
        <div style={{ color: '#fff' }}>{bottomEvalLabel}</div>
      </div>
    </div>
  )

  const boardOverlay = justMated ? (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20,
      }}
    >
      <div
        style={{
          padding: '12px 20px',
          borderRadius: '12px',
          background: 'rgba(58,42,28,0.88)',
          border: '1px solid #ffb347',
          color: '#ffd28a',
          fontWeight: 800,
          fontSize: '28px',
          letterSpacing: 1,
          boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
        }}
      >
        CHECKMATE
      </div>
    </div>
  ) : null

  return (
    <TrainerShell
      title="B+N Mate Trainer"
      subtitle={currentChunkFile ?? currentThemeConfig.label ?? currentThemeId ?? ''}
      boardSize={boardWidth}
      isDragging={isDragging}
      isHandleHovered={isHandleHovered}
      setIsDragging={setIsDragging}
      setIsHandleHovered={setIsHandleHovered}
      containerRef={containerRef}
      footerLeft={currentThemeConfig.label ?? currentThemeId}
      footerRight={`${boardWidth}px`}
      boardId="BNMateTrainerBoard"
      fen={game.fen()}
      onPieceDrop={onDrop}
      getLegalTargets={getLegalTargets}
      boardOrientation={boardOrientation}
      customDarkSquareStyle={{ backgroundColor: '#769656' }}
      customLightSquareStyle={{ backgroundColor: '#eeeed2' }}
      customBoardStyle={{
        borderRadius: '8px',
        overflow: 'hidden',
      }}
      customSquareStyles={getCustomSquareStyles(
        lastMove,
        markedSquare,
        correctSquares,
        escapeSquares,
        hintSquares
      )}
      arePiecesDraggable={!loadingChunk && !inputLocked && !allComplete}
      boardLeft={boardLeft}
      boardOverlay={boardOverlay}
      sidePanel={
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            minHeight: boardWidth,
          }}
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
                {`${sideToMoveText} to Move`}
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
                {currentThemeConfig.label ?? currentThemeId}
              </div>
              <div style={{ color: '#d3d3d3' }}>
                {currentIndex + 1} / {positions.length}
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
              <div>{currentChunkFile}</div>
              <div>Chunk {currentGlobalChunkNumber ?? currentThemeProgress.currentChunkIndex + 1}</div>
            </div>
          </PanelCard>

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
                {chunkFastSolveCount} / {chunkTarget}
              </div>
            </div>

            <ProgressBar percent={progressPercent} style={{ marginBottom: 8 }} />

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: 12,
                color: '#c5c5c5',
              }}
            >
              <div>{Math.round(progressPercent)}% stage mastery</div>
              <div>{chunkMasteredCount} / {positions.length} puzzles at 5/5</div>
            </div>
          </PanelCard>

          <PanelCard>
            <SectionTitle>This puzzle</SectionTitle>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: 6,
                marginBottom: 8,
              }}
            >
              {Array.from({ length: POSITION_FAST_SOLVES_TO_MASTER }).map((_, i) => {
                const filled = i < currentFastSolves
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
              <div>{currentFastSolves} / {POSITION_FAST_SOLVES_TO_MASTER} fast solves</div>
              <div>Fast = ≤ {maxSecondsPerMove}s</div>
            </div>
          </PanelCard>

          <BigMessage streak={`🔥 ${chunkFastSolveCount}`} message={status || currentInstruction} />

          <PanelCard>
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              {positions.map((p, i) => {
                const stats = getPositionStats(progress, p.id)
                const mastered = stats.mastered
                const done = i === currentIndex && flashSolvedPositionId === p.id

                return (
                  <div
                    key={p.id}
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
              <div>Category: Endgame</div>
              <div>Theme: {currentThemeConfig.label ?? currentThemeId}</div>
              <div>Puzzle ID: {currentPosition.id}</div>
              <div>Label: {currentPosition.label}</div>
              <div>Mate distance: {currentPosition.mateDistance ?? '-'}</div>
              <div>Allowed moves: {currentPosition.allowedMoves.length}</div>
              <div>Current move time: {(currentMoveElapsedMs / 1000).toFixed(1)}s</div>
              <div>Engine: {engineReady ? 'ready' : 'loading'}</div>
              <div>Completed themes: {themeDoneCount} / {progression.order.length}</div>
            </div>
          </PanelCard>

          <PanelCard>
            <SectionTitle>Actions</SectionTitle>
            <div style={{ display: 'grid', gap: 8 }}>
              <HintButton onClick={() => void showHintAction()}>
                Hint
              </HintButton>

              <PrimaryButton onClick={resetCurrentPosition}>
                Restart position
              </PrimaryButton>

              <SecondaryButton onClick={nextPuzzle}>
                Next puzzle
              </SecondaryButton>

              <SecondaryButton onClick={() => void restartCurrentChunk()}>
                Restart chunk
              </SecondaryButton>
            </div>
          </PanelCard>

          <PanelCard>
            <SectionTitle>Chunk navigation</SectionTitle>
            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <SecondaryButton onClick={goToPrevChunk}>
                  Prev
                </SecondaryButton>
                <SecondaryButton onClick={goToNextChunk}>
                  Next
                </SecondaryButton>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <ShellInput
                  value={jumpChunkInput}
                  onChange={(e) => setJumpChunkInput(e.target.value)}
                  placeholder="Jump to chunk #"
                />
                <PrimaryButton onClick={() => jumpToChunkByNumber(jumpChunkInput)}>
                  Go
                </PrimaryButton>
              </div>
            </div>
          </PanelCard>

          <PanelCard>
            <SectionTitle>Message</SectionTitle>
            <div style={{ fontSize: 12, color: '#d0d0d0', lineHeight: 1.55, minHeight: 36 }}>
              {message || '—'}
            </div>
          </PanelCard>

          <PanelCard>
            <SectionTitle>Danger zone</SectionTitle>
            <SecondaryButton onClick={resetWholeProgression}>
              Reset all progression
            </SecondaryButton>
          </PanelCard>
        </div>
      }
    />
  )
}