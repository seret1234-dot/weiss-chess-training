import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import phase1Data from '../two_bishop_mate/two_bishops_phase1_chunks.json'
import phase2Data from '../two_bishop_mate/two_bishops_phase2.json'
import phase3Data from '../two_bishop_mate/two_bishops_phase3.json'
import { BNEngine } from './lib/bnEngine'
import type { EngineResult } from './lib/bnEngine'
import { useRegisterPlayableBoard } from './hooks/useRegisterPlayableBoard'

type ChunkPosition = {
  line_number: number
  line_id: string
  distance_from_mate: number
  fen: string
  move: string
  start_fen: string
}

type FullLine = {
  line_number: number
  line_id: string
  start_fen: string
  moves: string[]
}

type RawChunk = {
  chunk_id: string
  label: string
  distance_from_mate?: number
  positions?: ChunkPosition[]
  lines?: FullLine[]
}

type RawFile = {
  phase: number
  line_count: number
  chunks: RawChunk[]
}

type WhiteStep = {
  index: number
  whiteSan: string
  whiteUci: string
  blackSan?: string
  blackUci?: string
  nextFen?: string
}

type Phase1Puzzle = {
  id: string
  lineId: string
  lineNumber: number
  fen: string
  startFen: string
  mateDistance: number
  steps: WhiteStep[]
  source: 'chunk' | 'full'
  isLongLine: boolean
}

type Phase1TrainerChunk = {
  id: string
  label: string
  mateDistance: number | null
  puzzles: Phase1Puzzle[]
  isFullLines: boolean
}

type FreeplayFile = {
  chunk_id: string
  label: string
  type: 'freeplay'
  goal: 'reach_entry' | 'mate'
  entry_fens?: string[]
  positions: string[]
}

type FreeplayGoal = 'reach_entry' | 'mate'

type FreeplaySet = {
  id: string
  label: string
  goal: FreeplayGoal
  positions: string[]
  entryFens: string[]
}

type Mode =
  | { kind: 'phase1'; chunkIndex: number }
  | { kind: 'phase2' }
  | { kind: 'phase3' }

type FreeplayResult = 'success' | 'fail' | 'continue'

type PuzzleProgress = {
  fastSolves: number
  totalSolves: number
  mastered: boolean
}

const PROGRESS_KEY = 'two_bishops_final_progress_v2'
const BOARD_WIDTH_KEY = 'two_bishops_final_board_width_v2'

const FAST_SOLVES_TO_MASTER = 5
const MAX_SECONDS_PER_MOVE = 3

const CORRECT_DELAY_MS = 1300
const WRONG_DELAY_MS = 1800
const ENGINE_REPLY_DELAY_MS = 650
const BOARD_ANIMATION_MS = 500

const ENGINE_DEPTH_PHASE2 = 12
const ENGINE_DEPTH_PHASE3 = 14

const LONG_LINE_IDS = new Set([
  'long_d8',
  'long_b8_c8_c8',
  'long_b8_c8_a8',
  'long_b8_a8',
])

const WAITING_MOVE_DESTINATIONS = new Set(['a1', 'b2', 'c3', 'd4', 'e5', 'h8'])

function normalizeFen(fen: string) {
  const trimmed = fen.trim()
  const parts = trimmed.split(/\s+/)
  if (parts.length === 4) return `${trimmed} 0 1`
  return trimmed
}

function fenKey4(fen: string) {
  return normalizeFen(fen).split(' ').slice(0, 4).join(' ')
}

function moveToUci(move: { from: string; to: string; promotion?: string }) {
  return `${move.from}${move.to}${move.promotion ?? ''}`
}

function parseUci(uci?: string | null) {
  if (!uci || uci.length < 4) return null
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length > 4 ? uci.slice(4, 5) : undefined,
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function shuffleArray<T>(items: T[]) {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function sortLinePositions(a: ChunkPosition, b: ChunkPosition) {
  if (a.distance_from_mate !== b.distance_from_mate) {
    return b.distance_from_mate - a.distance_from_mate
  }
  if (a.line_number !== b.line_number) {
    return a.line_number - b.line_number
  }
  return a.fen.localeCompare(b.fen)
}

function sanToPlayedMove(fen: string, san: string) {
  const game = new Chess(normalizeFen(fen))
  const move = game.move(san)
  if (!move) {
    throw new Error(`Could not play SAN "${san}" from FEN "${fen}"`)
  }

  return {
    san: move.san,
    uci: moveToUci({
      from: move.from,
      to: move.to,
      promotion: move.promotion,
    }),
    afterFen: game.fen(),
  }
}

function findBlackReplyToReachNextWhiteFen(afterWhiteFen: string, nextWhiteFen: string) {
  const board = new Chess(normalizeFen(afterWhiteFen))
  const targetFen4 = fenKey4(nextWhiteFen)
  const legalMoves = board.moves({ verbose: true }) as Array<{
    from: string
    to: string
    promotion?: string
    san: string
  }>

  for (const legal of legalMoves) {
    const probe = new Chess(normalizeFen(afterWhiteFen))
    const played = probe.move({
      from: legal.from,
      to: legal.to,
      promotion: legal.promotion,
    })
    if (!played) continue

    if (fenKey4(probe.fen()) === targetFen4) {
      return {
        san: played.san,
        uci: moveToUci({
          from: played.from,
          to: played.to,
          promotion: played.promotion,
        }),
      }
    }
  }

  return null
}

function buildStepsFromChunkLine(linePositions: ChunkPosition[], startIndex: number): WhiteStep[] {
  const steps: WhiteStep[] = []

  for (let i = startIndex; i < linePositions.length; i += 1) {
    const current = linePositions[i]
    const played = sanToPlayedMove(current.fen, current.move)

    const step: WhiteStep = {
      index: steps.length,
      whiteSan: current.move,
      whiteUci: played.uci,
    }

    const nextPos = linePositions[i + 1]
    if (nextPos) {
      step.nextFen = normalizeFen(nextPos.fen)
      const reply = findBlackReplyToReachNextWhiteFen(played.afterFen, nextPos.fen)
      if (reply) {
        step.blackSan = reply.san
        step.blackUci = reply.uci
      }
    }

    steps.push(step)
  }

  return steps
}

function buildStepsFromFullLine(line: FullLine): WhiteStep[] {
  const game = new Chess(normalizeFen(line.start_fen))
  const plies: Array<{
    san: string
    uci: string
    afterFen: string
    side: 'w' | 'b'
  }> = []

  for (let i = 0; i < line.moves.length; i += 1) {
    const move = game.move(line.moves[i])
    if (!move) {
      throw new Error(`Could not play move "${line.moves[i]}" in full line "${line.line_id}"`)
    }

    plies.push({
      san: move.san,
      uci: moveToUci({
        from: move.from,
        to: move.to,
        promotion: move.promotion,
      }),
      afterFen: game.fen(),
      side: i % 2 === 0 ? 'w' : 'b',
    })
  }

  const whiteSteps: WhiteStep[] = []
  for (let i = 0; i < plies.length; i += 2) {
    const white = plies[i]
    if (!white || white.side !== 'w') continue
    const black = plies[i + 1]

    whiteSteps.push({
      index: whiteSteps.length,
      whiteSan: white.san,
      whiteUci: white.uci,
      blackSan: black?.san,
      blackUci: black?.uci,
      nextFen: black?.afterFen,
    })
  }

  return whiteSteps
}

function buildCustomWaitingFirstStep(puzzle: Phase1Puzzle, chosenUci: string): WhiteStep[] | null {
  if (!puzzle.isLongLine) return null
  if (puzzle.steps.length < 2) return null

  const parsed = parseUci(chosenUci)
  if (!parsed) return null

  const game = new Chess(normalizeFen(puzzle.startFen))
  const piece = game.get(parsed.from as any)
  if (!piece || piece.color !== 'w' || piece.type !== 'b') return null
  if (!WAITING_MOVE_DESTINATIONS.has(parsed.to)) return null

  const whiteMove1 = game.move({
    from: parsed.from,
    to: parsed.to,
    promotion: parsed.promotion,
  })
  if (!whiteMove1) return null

  const blackMove1 = game.move('Ke8')
  if (!blackMove1) return null

  const step0: WhiteStep = {
    index: 0,
    whiteSan: whiteMove1.san,
    whiteUci: moveToUci({
      from: whiteMove1.from,
      to: whiteMove1.to,
      promotion: whiteMove1.promotion,
    }),
    blackSan: blackMove1.san,
    blackUci: moveToUci({
      from: blackMove1.from,
      to: blackMove1.to,
      promotion: blackMove1.promotion,
    }),
    nextFen: game.fen(),
  }

  const canonicalStep1 = puzzle.steps[1]
  if (!canonicalStep1) return [step0]

  const whiteMove2 = game.move('Bg7')
  if (!whiteMove2) return null

  let step1BlackSan: string | undefined
  let step1BlackUci: string | undefined
  let step1NextFen: string | undefined

  if (canonicalStep1.blackSan) {
    const blackMove2 = game.move(canonicalStep1.blackSan)
    if (!blackMove2) return null

    step1BlackSan = blackMove2.san
    step1BlackUci = moveToUci({
      from: blackMove2.from,
      to: blackMove2.to,
      promotion: blackMove2.promotion,
    })
    step1NextFen = game.fen()
  }

  const step1: WhiteStep = {
    index: 1,
    whiteSan: whiteMove2.san,
    whiteUci: moveToUci({
      from: whiteMove2.from,
      to: whiteMove2.to,
      promotion: whiteMove2.promotion,
    }),
    blackSan: step1BlackSan,
    blackUci: step1BlackUci,
    nextFen: step1NextFen,
  }

  const rest = puzzle.steps.slice(2).map((step, idx) => ({
    ...step,
    index: idx + 2,
  }))

  return [step0, step1, ...rest]
}

function buildPhase1TrainerChunks(): Phase1TrainerChunk[] {
  const file = phase1Data as RawFile

  const mateChunks = file.chunks
    .filter((chunk) => /^phase1_m\d+$/.test(chunk.chunk_id))
    .sort((a, b) => {
      const ma = Number(a.chunk_id.match(/^phase1_m(\d+)$/)?.[1] ?? 999)
      const mb = Number(b.chunk_id.match(/^phase1_m(\d+)$/)?.[1] ?? 999)
      return ma - mb
    })
    .filter((chunk) => {
      const mate = Number(chunk.chunk_id.match(/^phase1_m(\d+)$/)?.[1] ?? 999)
      return mate >= 1 && mate <= 10
    })

  const fullLinesChunk = file.chunks.find((chunk) => chunk.chunk_id === 'phase1_full_lines')

  const allMatePositions = mateChunks.flatMap((chunk) => chunk.positions ?? [])
  const positionsByLineId = new Map<string, ChunkPosition[]>()

  for (const pos of allMatePositions) {
    const arr = positionsByLineId.get(pos.line_id) ?? []
    arr.push(pos)
    positionsByLineId.set(pos.line_id, arr)
  }

  for (const [lineId, arr] of positionsByLineId.entries()) {
    positionsByLineId.set(lineId, [...arr].sort(sortLinePositions))
  }

  const builtMateChunks: Phase1TrainerChunk[] = mateChunks.map((chunk) => {
    const mateDistance = chunk.distance_from_mate ?? null
    const dedup = new Map<string, Phase1Puzzle>()

    for (const pos of chunk.positions ?? []) {
      const linePositions = positionsByLineId.get(pos.line_id)
      if (!linePositions) continue

      const startIndex = linePositions.findIndex(
        (p) =>
          p.distance_from_mate === pos.distance_from_mate &&
          fenKey4(p.fen) === fenKey4(pos.fen) &&
          p.move === pos.move
      )
      if (startIndex < 0) continue

      const steps = buildStepsFromChunkLine(linePositions, startIndex)
      if (steps.length === 0) continue

      const dedupeKey = fenKey4(pos.fen)
      const candidate: Phase1Puzzle = {
        id: `${chunk.chunk_id}::${dedupeKey}`,
        lineId: pos.line_id,
        lineNumber: pos.line_number,
        fen: normalizeFen(pos.fen),
        startFen: normalizeFen(pos.start_fen),
        mateDistance: pos.distance_from_mate,
        steps,
        source: 'chunk',
        isLongLine: LONG_LINE_IDS.has(pos.line_id),
      }

      const existing = dedup.get(dedupeKey)
      if (!existing) {
        dedup.set(dedupeKey, candidate)
        continue
      }

      if (candidate.steps.length > existing.steps.length) {
        dedup.set(dedupeKey, candidate)
        continue
      }

      if (candidate.steps.length === existing.steps.length && candidate.lineId < existing.lineId) {
        dedup.set(dedupeKey, candidate)
      }
    }

    return {
      id: chunk.chunk_id,
      label: `Mate in ${mateDistance ?? '?'}`,
      mateDistance,
      puzzles: Array.from(dedup.values()).sort((a, b) => {
        if (a.lineNumber !== b.lineNumber) return a.lineNumber - b.lineNumber
        return a.id.localeCompare(b.id)
      }),
      isFullLines: false,
    }
  })

  const fullLinePuzzles: Phase1Puzzle[] =
    fullLinesChunk?.lines?.length
      ? [...fullLinesChunk.lines]
          .sort((a, b) => a.line_number - b.line_number)
          .map((line) => {
            const steps = buildStepsFromFullLine(line)
            return {
              id: `${line.line_id}::full`,
              lineId: line.line_id,
              lineNumber: line.line_number,
              fen: normalizeFen(line.start_fen),
              startFen: normalizeFen(line.start_fen),
              mateDistance: steps.length,
              steps,
              source: 'full' as const,
              isLongLine: LONG_LINE_IDS.has(line.line_id),
            }
          })
      : []

  const FULL_LINE_CHUNK_COUNT = 8
  const builtFullLineChunks: Phase1TrainerChunk[] = []

  if (fullLinePuzzles.length > 0) {
    const perChunk = Math.ceil(fullLinePuzzles.length / FULL_LINE_CHUNK_COUNT)

    for (let i = 0; i < FULL_LINE_CHUNK_COUNT; i += 1) {
      const start = i * perChunk
      const end = start + perChunk
      const slice = fullLinePuzzles.slice(start, end)
      if (slice.length === 0) continue

      builtFullLineChunks.push({
        id: `phase1_full_lines_${String(i + 1).padStart(3, '0')}`,
        label: `Full lines ${i + 1}`,
        mateDistance: null,
        puzzles: slice,
        isFullLines: true,
      })
    }
  }

  return [...builtMateChunks, ...builtFullLineChunks]
}

function buildFreeplaySet(data: FreeplayFile): FreeplaySet {
  return {
    id: data.chunk_id,
    label: data.label,
    goal: data.goal,
    positions: data.positions.map(normalizeFen),
    entryFens: (data.entry_fens ?? []).map(fenKey4),
  }
}

function getBlackKingSquare(game: Chess) {
  const board = game.board()
  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      const piece = board[rank][file]
      if (piece?.type === 'k' && piece.color === 'b') {
        return `${'abcdefgh'[file]}${8 - rank}`
      }
    }
  }
  return ''
}

function getWhiteBishopSquares(game: Chess) {
  const board = game.board()
  const result: string[] = []
  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      const piece = board[rank][file]
      if (piece?.type === 'b' && piece.color === 'w') {
        result.push(`${'abcdefgh'[file]}${8 - rank}`)
      }
    }
  }
  return result
}

function getWhiteKingSquare(game: Chess) {
  const board = game.board()
  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      const piece = board[rank][file]
      if (piece?.type === 'k' && piece.color === 'w') {
        return `${'abcdefgh'[file]}${8 - rank}`
      }
    }
  }
  return ''
}

function getLegalBlackKingMoves(game: Chess) {
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

function getPuzzleProgress(map: Record<string, PuzzleProgress>, id: string): PuzzleProgress {
  return map[id] ?? { fastSolves: 0, totalSolves: 0, mastered: false }
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

function getEngineMateDistanceText(engineInfo: EngineResult | null) {
  if (engineInfo?.mate === null || engineInfo?.mate === undefined) return '—'
  return `Mate ${engineInfo.mate > 0 ? '+' : ''}${engineInfo.mate}`
}

function getCustomSquareStyles(
  lastMove?: { from?: string; to?: string },
  markedSquares: string[] = [],
  hintSquares: string[] = [],
  correctSquares: string[] = []
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

  for (const sq of markedSquares) {
    styles[sq] = {
      ...(styles[sq] ?? {}),
      boxShadow: 'inset 0 0 0 4px rgba(255,130,40,0.82)',
      backgroundColor: 'rgba(255,145,70,0.22)',
    }
  }

  for (const sq of hintSquares) {
    styles[sq] = {
      ...(styles[sq] ?? {}),
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

function primaryButton(background: string): CSSProperties {
  return {
    background,
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    padding: '10px 16px',
    fontWeight: 700,
    cursor: 'pointer',
  }
}

function phaseTitle(mode: Mode, currentChunk: Phase1TrainerChunk | null) {
  if (mode.kind === 'phase2') return 'Phase 2'
  if (mode.kind === 'phase3') return 'Phase 3'
  if (!currentChunk) return 'Phase 1'
  if (currentChunk.isFullLines) return currentChunk.label
  return `Mate in ${currentChunk.mateDistance}`
}

export default function TwoBishopsFinalTrainer() {
  const phase1Chunks = useMemo(() => buildPhase1TrainerChunks(), [])
  const phase2 = useMemo(() => buildFreeplaySet(phase2Data as FreeplayFile), [])
  const phase3 = useMemo(() => buildFreeplaySet(phase3Data as FreeplayFile), [])

  const engineRef = useRef<BNEngine | null>(null)
  const analysisTokenRef = useRef(0)
  const moveStartedAtRef = useRef<number>(Date.now())

  const [mode, setMode] = useState<Mode>({ kind: 'phase1', chunkIndex: 0 })
  const [progressMap, setProgressMap] = useState<Record<string, PuzzleProgress>>(() => {
    try {
      const raw = localStorage.getItem(PROGRESS_KEY)
      return raw ? (JSON.parse(raw) as Record<string, PuzzleProgress>) : {}
    } catch {
      return {}
    }
  })
  const [order, setOrder] = useState<number[]>([])
  const [queueIndex, setQueueIndex] = useState(0)
  const [game, setGame] = useState<Chess>(() => new Chess())
  const [stepIndex, setStepIndex] = useState(0)
  const [message, setMessage] = useState('Loading...')
  const [status, setStatus] = useState('Loading trainer...')
  const [locked, setLocked] = useState(false)
  const [lastMove, setLastMove] = useState<{ from?: string; to?: string }>({})
  const [activeSteps, setActiveSteps] = useState<WhiteStep[]>([])
  const [allComplete, setAllComplete] = useState(false)
  const [engineReady, setEngineReady] = useState(false)
  const [engineInfo, setEngineInfo] = useState<EngineResult | null>(null)
  const [markedSquares, setMarkedSquares] = useState<string[]>([])
  const [hintSquares, setHintSquares] = useState<string[]>([])
  const [correctSquares, setCorrectSquares] = useState<string[]>([])
  const [boardWidth, setBoardWidth] = useState(() => {
    const raw = localStorage.getItem(BOARD_WIDTH_KEY)
    return raw ? Number(raw) : 580
  })
  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>('white')
  const [currentMoveElapsedMs, setCurrentMoveElapsedMs] = useState(0)
  const [moveTimesMs, setMoveTimesMs] = useState<number[]>([])
  const [justSolved, setJustSolved] = useState(false)
  const [flashSolvedId, setFlashSolvedId] = useState<string | null>(null)

  const isPhase1 = mode.kind === 'phase1'
  const currentChunk = isPhase1 ? phase1Chunks[mode.chunkIndex] : null
  const currentPuzzleIndex = order[queueIndex]
  const currentPuzzle = currentChunk?.puzzles[currentPuzzleIndex] ?? null
  const currentFreeplaySet = mode.kind === 'phase2' ? phase2 : mode.kind === 'phase3' ? phase3 : null
  const currentFreeplayFen = currentFreeplaySet?.positions[currentPuzzleIndex] ?? ''
  const currentFreeplayId =
    currentFreeplaySet && currentFreeplayFen ? `${currentFreeplaySet.id}::${currentFreeplayFen}` : ''

  const currentPuzzleId = mode.kind === 'phase1' ? currentPuzzle?.id ?? '' : currentFreeplayId
  const currentProgress = currentPuzzleId ? getPuzzleProgress(progressMap, currentPuzzleId) : null

  useEffect(() => {
    localStorage.setItem(BOARD_WIDTH_KEY, String(boardWidth))
  }, [boardWidth])

  useEffect(() => {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progressMap))
  }, [progressMap])

  useEffect(() => {
    engineRef.current = new BNEngine()
    setEngineReady(true)
    return () => {
      engineRef.current?.destroy()
    }
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (locked) return
      setCurrentMoveElapsedMs(Date.now() - moveStartedAtRef.current)
    }, 100)
    return () => window.clearInterval(interval)
  }, [locked])

  async function evaluatePosition(fen: string, depth: number) {
    if (!engineRef.current) return null
    try {
      return await engineRef.current.analyze(fen, depth)
    } catch {
      return null
    }
  }

  async function analyzeCurrentFen(fen: string) {
    const token = ++analysisTokenRef.current
    const depth = mode.kind === 'phase3' ? ENGINE_DEPTH_PHASE3 : ENGINE_DEPTH_PHASE2
    const result = await evaluatePosition(fen, depth)
    if (token !== analysisTokenRef.current) return
    setEngineInfo(result)
  }

  function clearHighlights() {
    setMarkedSquares([])
    setHintSquares([])
    setCorrectSquares([])
  }

  function beginMoveTimer() {
    moveStartedAtRef.current = Date.now()
    setCurrentMoveElapsedMs(0)
  }

  function getCurrentPrompt() {
    if (mode.kind === 'phase1') {
      if (!currentChunk || !currentPuzzle) return 'Find the correct move'
      if (currentChunk.isFullLines) return currentChunk.label
      return `Find mate in ${currentChunk.mateDistance}`
    }
    if (mode.kind === 'phase2') return 'Drive the king to the 8th rank'
    return 'Mate the king'
  }

  function isMastered(id: string) {
    return getPuzzleProgress(progressMap, id).mastered
  }

  function getUnmasteredIndices(chunk: Phase1TrainerChunk) {
    return chunk.puzzles
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => !isMastered(p.id))
      .map(({ i }) => i)
  }

  async function setEngineForCurrentPosition(fen: string) {
    setEngineInfo(null)
    await analyzeCurrentFen(fen)
  }

  async function loadPhase1Chunk(
    chunkIndex: number,
    options?: {
      excludePuzzleId?: string | null
      preserveOrder?: boolean
      nextIndexInOrder?: number
    }
  ) {
    const safe = Math.max(0, Math.min(phase1Chunks.length - 1, chunkIndex))
    const chunk = phase1Chunks[safe]
    if (!chunk) return

    const isSameChunk = mode.kind === 'phase1' && mode.chunkIndex === safe

    setMode({ kind: 'phase1', chunkIndex: safe })
    clearHighlights()
    setFlashSolvedId(null)
    setJustSolved(false)

    let nextOrder: number[] = []
    let nextQueueIndex = 0

    if (
      options?.preserveOrder &&
      isSameChunk &&
      order.length > 0
    ) {
      const stillValid = order.filter((i) => {
        const puzzle = chunk.puzzles[i]
        return puzzle && !isMastered(puzzle.id)
      })

      nextOrder = stillValid

      if (nextOrder.length === 0) {
        nextOrder = shuffleArray(getUnmasteredIndices(chunk))
        nextQueueIndex = 0
      } else {
        nextQueueIndex = Math.max(0, Math.min(options.nextIndexInOrder ?? 0, nextOrder.length - 1))
      }
    } else {
      nextOrder = shuffleArray(getUnmasteredIndices(chunk))
      nextQueueIndex = 0
    }

    if (options?.excludePuzzleId && nextOrder.length > 1) {
      const front = nextOrder.filter((i) => chunk.puzzles[i].id !== options.excludePuzzleId)
      const back = nextOrder.filter((i) => chunk.puzzles[i].id === options.excludePuzzleId)
      if (front.length > 0) nextOrder = [...front, ...back]
      nextQueueIndex = 0
    }

    if (nextOrder.length === 0) {
      setOrder([])
      setQueueIndex(0)
      setGame(new Chess())
      setStepIndex(0)
      setActiveSteps([])
      setLocked(true)
      setLastMove({})
      setStatus(`${chunk.label} complete`)
      setMessage('')
      return
    }

    const puzzle = chunk.puzzles[nextOrder[nextQueueIndex]]
    setOrder(nextOrder)
    setQueueIndex(nextQueueIndex)
    setGame(new Chess(puzzle.fen))
    setStepIndex(0)
    setActiveSteps(puzzle.steps)
    setLocked(false)
    setLastMove({})
    setStatus(chunk.isFullLines ? chunk.label : `Find mate in ${chunk.mateDistance}`)
    setMessage('')
    setAllComplete(false)
    setMoveTimesMs([])
    beginMoveTimer()
    await setEngineForCurrentPosition(puzzle.fen)
  }

  async function loadFreeplay(kind: 'phase2' | 'phase3', options?: { excludePuzzleId?: string | null }) {
    const setData = kind === 'phase2' ? phase2 : phase3
    setMode({ kind })
    clearHighlights()
    setFlashSolvedId(null)
    setJustSolved(false)

    let nextOrder = shuffleArray(
      setData.positions
        .map((fen, i) => ({ id: `${setData.id}::${fen}`, i }))
        .filter(({ id }) => !isMastered(id))
        .map(({ i }) => i)
    )

    if (options?.excludePuzzleId && nextOrder.length > 1) {
      const front = nextOrder.filter((i) => `${setData.id}::${setData.positions[i]}` !== options.excludePuzzleId)
      const back = nextOrder.filter((i) => `${setData.id}::${setData.positions[i]}` === options.excludePuzzleId)
      if (front.length > 0) nextOrder = [...front, ...back]
    }

    if (nextOrder.length === 0) {
      setOrder([])
      setQueueIndex(0)
      setGame(new Chess())
      setStepIndex(0)
      setActiveSteps([])
      setLocked(true)
      setLastMove({})
      setStatus(kind === 'phase2' ? 'Phase 2 complete' : 'All chunks complete')
      setMessage('')
      setAllComplete(kind === 'phase3')
      return
    }

    const fen = setData.positions[nextOrder[0]]
    setOrder(nextOrder)
    setQueueIndex(0)
    setGame(new Chess(fen))
    setStepIndex(0)
    setActiveSteps([])
    setLocked(false)
    setLastMove({})
    setStatus(kind === 'phase2' ? 'Drive the king to the 8th rank' : 'Mate the king')
    setMessage('')
    setAllComplete(false)
    setMoveTimesMs([])
    beginMoveTimer()
    await setEngineForCurrentPosition(fen)
  }

  useEffect(() => {
    if (phase1Chunks.length === 0) return
    void loadPhase1Chunk(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase1Chunks.length])

  function shouldAllowWaitingMoveOverride() {
    if (mode.kind !== 'phase1') return false
    if (!currentChunk || !currentPuzzle) return false
    if (!currentPuzzle.isLongLine) return false
    if (stepIndex !== 0) return false
    if (currentChunk.isFullLines) return true
    return currentChunk.mateDistance === 10
  }

  function phase3Escaped(engineEval: EngineResult | null, gameToCheck: Chess) {
    if (gameToCheck.isCheckmate()) return false
    if (!engineEval) return false
    if (typeof engineEval.mate === 'number') return engineEval.mate >= 0
    if (typeof engineEval.eval === 'number') return engineEval.eval > -300
    return false
  }

  function getFreeplayResult(
    gameToCheck: Chess,
    setData: FreeplaySet,
    engineEval?: EngineResult | null
  ): FreeplayResult {
    if (gameToCheck.isStalemate()) return 'fail'
    if (gameToCheck.isDraw()) return 'fail'
    if (gameToCheck.isThreefoldRepetition()) return 'fail'

    if (setData.goal === 'reach_entry') {
      const bk = getBlackKingSquare(gameToCheck)
      if (bk.endsWith('8')) return 'success'
      if (setData.entryFens.includes(fenKey4(gameToCheck.fen()))) return 'success'
      return 'continue'
    }

    if (gameToCheck.isCheckmate()) return 'success'
    if (phase3Escaped(engineEval ?? null, gameToCheck)) return 'fail'
    return 'continue'
  }

  async function resetPuzzle() {
    clearHighlights()
    setFlashSolvedId(null)
    setJustSolved(false)

    if (mode.kind === 'phase1') {
      if (!currentChunk || !currentPuzzle) return
      setGame(new Chess(currentPuzzle.fen))
      setStepIndex(0)
      setActiveSteps(currentPuzzle.steps)
      setLocked(false)
      setLastMove({})
      setStatus(currentChunk.isFullLines ? currentChunk.label : `Find mate in ${currentChunk.mateDistance}`)
      setMessage('')
      setMoveTimesMs([])
      beginMoveTimer()
      await setEngineForCurrentPosition(currentPuzzle.fen)
      return
    }

    if (!currentFreeplayFen) return
    setGame(new Chess(currentFreeplayFen))
    setStepIndex(0)
    setActiveSteps([])
    setLocked(false)
    setLastMove({})
    setStatus(mode.kind === 'phase2' ? 'Drive the king to the 8th rank' : 'Mate the king')
    setMessage('')
    setMoveTimesMs([])
    beginMoveTimer()
    await setEngineForCurrentPosition(currentFreeplayFen)
  }

  async function shuffleCurrent() {
    if (mode.kind === 'phase1') {
      if (!currentPuzzle) return
      await loadPhase1Chunk(mode.chunkIndex, { excludePuzzleId: currentPuzzle.id })
      return
    }

    if (!currentFreeplaySet || currentPuzzleIndex == null) return
    const id = `${currentFreeplaySet.id}::${currentFreeplaySet.positions[currentPuzzleIndex]}`
    await loadFreeplay(mode.kind, { excludePuzzleId: id })
  }

  async function nextPuzzle() {
    if (mode.kind === 'phase1') {
      if (!currentChunk || order.length === 0) return

      const nextIndex = queueIndex + 1
      if (nextIndex < order.length) {
        await loadPhase1Chunk(mode.chunkIndex, {
          preserveOrder: true,
          nextIndexInOrder: nextIndex,
        })
        return
      }

      await loadPhase1Chunk(mode.chunkIndex)
      return
    }

    await shuffleCurrent()
  }

  async function prevModeOrChunk() {
    if (mode.kind === 'phase3') {
      await loadFreeplay('phase2')
      return
    }
    if (mode.kind === 'phase2') {
      await loadPhase1Chunk(0)
      return
    }
    await loadPhase1Chunk(Math.max(0, mode.chunkIndex - 1))
  }

  async function nextModeOrChunk() {
    if (mode.kind === 'phase1') {
      if (mode.chunkIndex < phase1Chunks.length - 1) {
        await loadPhase1Chunk(mode.chunkIndex + 1)
      } else {
        await loadFreeplay('phase2')
      }
      return
    }

    if (mode.kind === 'phase2') {
      await loadFreeplay('phase3')
    }
  }

  function registerSolveForCurrentPuzzle(finalMoveElapsedMs?: number) {
    if (!currentPuzzleId) {
      return {
        nextMap: progressMap,
        nextStats: null as PuzzleProgress | null,
        wasFast: false,
      }
    }

    const oldStats = getPuzzleProgress(progressMap, currentPuzzleId)
    const solveTimes =
      typeof finalMoveElapsedMs === 'number'
        ? [...moveTimesMs, finalMoveElapsedMs]
        : moveTimesMs

    const wasFast =
      solveTimes.length > 0 &&
      solveTimes.every((ms) => ms <= MAX_SECONDS_PER_MOVE * 1000)

    const nextFastSolves = wasFast
      ? Math.min(FAST_SOLVES_TO_MASTER, oldStats.fastSolves + 1)
      : oldStats.fastSolves

    const nextStats: PuzzleProgress = {
      fastSolves: nextFastSolves,
      totalSolves: oldStats.totalSolves + 1,
      mastered: nextFastSolves >= FAST_SOLVES_TO_MASTER,
    }

    const nextMap = {
      ...progressMap,
      [currentPuzzleId]: nextStats,
    }

    setProgressMap(nextMap)

    return {
      nextMap,
      nextStats,
      wasFast,
    }
  }

  async function finishSuccess(successText: string, finalMoveElapsedMs?: number) {
    const { nextMap, nextStats, wasFast } = registerSolveForCurrentPuzzle(finalMoveElapsedMs)

    setLocked(true)
    setJustSolved(true)
    setFlashSolvedId(currentPuzzleId)
    clearHighlights()
    if (lastMove.to) setCorrectSquares([lastMove.to])

    setStatus(successText)
    setMessage(
      wasFast
        ? `Fast solve ${nextStats?.fastSolves ?? 0}/${FAST_SOLVES_TO_MASTER} for this puzzle.`
        : `Solved, but one or more moves were slower than ${MAX_SECONDS_PER_MOVE} seconds.`
    )

    await sleep(CORRECT_DELAY_MS)

    if (mode.kind === 'phase1') {
      if (!currentChunk) return

      const chunkComplete = currentChunk.puzzles.every((p) => getPuzzleProgress(nextMap, p.id).mastered)

      if (chunkComplete) {
        if (mode.chunkIndex < phase1Chunks.length - 1) {
          await loadPhase1Chunk(mode.chunkIndex + 1)
          return
        }

        await loadFreeplay('phase2')
        return
      }

      const remainingUnmastered = currentChunk.puzzles
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => !getPuzzleProgress(nextMap, p.id).mastered)
        .map(({ i }) => i)

      if (remainingUnmastered.length === 0) {
        if (mode.chunkIndex < phase1Chunks.length - 1) {
          await loadPhase1Chunk(mode.chunkIndex + 1)
          return
        }

        await loadFreeplay('phase2')
        return
      }

      await loadPhase1Chunk(mode.chunkIndex, {
        preserveOrder: true,
        nextIndexInOrder: Math.min(queueIndex, Math.max(remainingUnmastered.length - 1, 0)),
      })
      return
    }

    const setData = currentFreeplaySet
    if (!setData) return

    const allMastered = setData.positions.every((fen) =>
      getPuzzleProgress(nextMap, `${setData.id}::${fen}`).mastered
    )

    if (allMastered) {
      if (mode.kind === 'phase2') {
        await loadFreeplay('phase3')
        return
      }

      setLocked(true)
      setAllComplete(true)
      setStatus('All chunks complete')
      setMessage('')
      return
    }

    await loadFreeplay(mode.kind, { excludePuzzleId: currentPuzzleId })
  }

  async function showWrongAndReset(
    nextGame: Chess,
    move: { from: string; to: string; promotion?: string },
    nextStatus: string,
    nextMessage: string
  ) {
    const bk = getBlackKingSquare(nextGame)
    const escapes = getLegalBlackKingMoves(nextGame)
    setGame(nextGame)
    setLastMove({ from: move.from, to: move.to })
    setMarkedSquares([bk, ...escapes].filter(Boolean))
    setHintSquares([])
    setCorrectSquares([])
    setLocked(true)
    setJustSolved(false)
    setStatus(nextStatus)
    setMessage(nextMessage)
    await sleep(WRONG_DELAY_MS)
    await resetPuzzle()
  }

  async function showHint() {
    clearHighlights()

    if (mode.kind === 'phase1') {
      const step = activeSteps[stepIndex]
      const move = parseUci(step?.whiteUci)
      if (!move) return
      setMarkedSquares([move.from])
      setHintSquares([move.to])
      setStatus('Hint')
      setMessage(`Try ${move.from} → ${move.to}`)
      return
    }

    const info =
      engineInfo ??
      (await evaluatePosition(
        game.fen(),
        mode.kind === 'phase3' ? ENGINE_DEPTH_PHASE3 : ENGINE_DEPTH_PHASE2
      ))

    const parsed = parseUci(info?.bestMove)
    if (!parsed) {
      setStatus('Hint')
      setMessage('No hint available')
      return
    }

    setMarkedSquares([parsed.from])
    setHintSquares([parsed.to])
    setStatus('Hint')
    setMessage(`Try ${parsed.from} → ${parsed.to}`)
  }

  async function playEngineBlackMove(afterWhiteGame: Chess) {
    const depth = mode.kind === 'phase3' ? ENGINE_DEPTH_PHASE3 : ENGINE_DEPTH_PHASE2
    const info = await evaluatePosition(afterWhiteGame.fen(), depth)
    setEngineInfo(info)

    const parsed = parseUci(info?.bestMove)
    if (!parsed) {
      setLocked(false)
      setStatus(getCurrentPrompt())
      setMessage('Engine could not find a black move')
      beginMoveTimer()
      return
    }

    setStatus('Good move.')
    setMessage(`Black is replying: ${info?.bestMove ?? ''}`)
    await sleep(ENGINE_REPLY_DELAY_MS)

    const replyGame = new Chess(afterWhiteGame.fen())
    const blackMove = replyGame.move({
      from: parsed.from,
      to: parsed.to,
      promotion: parsed.promotion,
    })

    if (!blackMove) {
      setLocked(false)
      setStatus(getCurrentPrompt())
      setMessage('Engine move failed')
      beginMoveTimer()
      return
    }

    const afterBlackEval = await evaluatePosition(
      replyGame.fen(),
      mode.kind === 'phase3' ? ENGINE_DEPTH_PHASE3 : ENGINE_DEPTH_PHASE2
    )
    setEngineInfo(afterBlackEval)

    const result = getFreeplayResult(replyGame, currentFreeplaySet!, afterBlackEval)

    setGame(replyGame)
    setLastMove({ from: blackMove.from, to: blackMove.to })
    clearHighlights()

    if (result === 'success') {
      await finishSuccess(mode.kind === 'phase2' ? 'Success — king reached 8th rank!' : 'CHECKMATE!')
      return
    }

    if (result === 'fail') {
      await showWrongAndReset(
        replyGame,
        {
          from: blackMove.from,
          to: blackMove.to,
          promotion: blackMove.promotion,
        },
        'Failed',
        mode.kind === 'phase2' ? 'Failed — draw or stalemate' : 'Failed — king escaped the net'
      )
      return
    }

    setLocked(false)
    setStatus(getCurrentPrompt())
    setMessage(mode.kind === 'phase2' ? 'Black replied. Your move.' : 'Black replied. Continue the mate.')
    beginMoveTimer()
  }

  function onDrop(sourceSquare: string, targetSquare: string) {
    if (locked || allComplete) return false

    if (mode.kind === 'phase1') {
      if (!currentPuzzle || !currentChunk) return false

      const step = activeSteps[stepIndex]
      if (!step) return false

      const nextGame = new Chess(game.fen())
      const moveObj = nextGame.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q',
      })
      if (!moveObj) return false

      const attemptedUci = moveToUci({
        from: moveObj.from,
        to: moveObj.to,
        promotion: moveObj.promotion,
      })

      let stepsToUse = activeSteps
      let accepted = attemptedUci === step.whiteUci

      if (!accepted && shouldAllowWaitingMoveOverride()) {
        const customSteps = buildCustomWaitingFirstStep(currentPuzzle, attemptedUci)
        if (customSteps && attemptedUci === customSteps[0].whiteUci) {
          stepsToUse = customSteps
          accepted = true
        }
      }

      if (!accepted) {
        void showWrongAndReset(
          nextGame,
          { from: moveObj.from, to: moveObj.to, promotion: moveObj.promotion },
          'Wrong move.',
          `Expected ${step.whiteSan}`
        )
        return true
      }

      if (stepsToUse !== activeSteps) setActiveSteps(stepsToUse)

      const elapsed = Date.now() - moveStartedAtRef.current
      setMoveTimesMs((prev) => [...prev, elapsed])
      setGame(nextGame)
      setLastMove({ from: moveObj.from, to: moveObj.to })
      clearHighlights()
      setLocked(true)
      setJustSolved(false)

      const acceptedStep = stepsToUse[stepIndex]
      const isFinalWhiteMove = stepIndex === stepsToUse.length - 1

      if (isFinalWhiteMove) {
        void finishSuccess(nextGame.isCheckmate() ? 'CHECKMATE!' : 'Correct.', elapsed)
        return true
      }

      void (async () => {
        if (acceptedStep?.blackUci) {
          const parsed = parseUci(acceptedStep.blackUci)
          if (parsed) {
            const replyGame = new Chess(nextGame.fen())
            const blackMove = replyGame.move({
              from: parsed.from,
              to: parsed.to,
              promotion: parsed.promotion,
            })

            if (blackMove) {
              const nextWhiteIndex = stepIndex + 1
              await sleep(ENGINE_REPLY_DELAY_MS)
              setGame(replyGame)
              setLastMove({ from: blackMove.from, to: blackMove.to })
              setStepIndex(nextWhiteIndex)
              setLocked(false)
              setStatus(currentChunk.isFullLines ? currentChunk.label : `Find mate in ${currentChunk.mateDistance}`)
              setMessage(
                currentChunk.isFullLines
                  ? `Move ${nextWhiteIndex + 1} of ${stepsToUse.length}`
                  : `Continue — play ${stepsToUse[nextWhiteIndex].whiteSan}`
              )
              beginMoveTimer()
              await setEngineForCurrentPosition(replyGame.fen())
              return
            }
          }
        }

        if (acceptedStep?.nextFen) {
          const nextWhiteIndex = stepIndex + 1
          const derivedReply = findBlackReplyToReachNextWhiteFen(nextGame.fen(), acceptedStep.nextFen)

          if (derivedReply?.uci) {
            const parsed = parseUci(derivedReply.uci)
            if (parsed) {
              const replyGame = new Chess(nextGame.fen())
              const blackMove = replyGame.move({
                from: parsed.from,
                to: parsed.to,
                promotion: parsed.promotion,
              })

              if (blackMove) {
                await sleep(ENGINE_REPLY_DELAY_MS)
                setGame(replyGame)
                setLastMove({ from: blackMove.from, to: blackMove.to })
                setStepIndex(nextWhiteIndex)
                setLocked(false)
                setStatus(currentChunk.isFullLines ? currentChunk.label : `Find mate in ${currentChunk.mateDistance}`)
                setMessage(
                  currentChunk.isFullLines
                    ? `Move ${nextWhiteIndex + 1} of ${stepsToUse.length}`
                    : `Continue — play ${stepsToUse[nextWhiteIndex].whiteSan}`
                )
                beginMoveTimer()
                await setEngineForCurrentPosition(replyGame.fen())
                return
              }
            }
          }

          await sleep(ENGINE_REPLY_DELAY_MS)
          setGame(new Chess(acceptedStep.nextFen))
          setLastMove(parseUci(acceptedStep.blackUci ?? '') ?? {})
          setStepIndex(nextWhiteIndex)
          setLocked(false)
          setStatus(currentChunk.isFullLines ? currentChunk.label : `Find mate in ${currentChunk.mateDistance}`)
          setMessage(
            currentChunk.isFullLines
              ? `Move ${nextWhiteIndex + 1} of ${stepsToUse.length}`
              : `Continue — play ${stepsToUse[nextWhiteIndex].whiteSan}`
          )
          beginMoveTimer()
          await setEngineForCurrentPosition(acceptedStep.nextFen)
          return
        }

        setLocked(false)
        setStatus('Error')
        setMessage('Line continuation failed')
      })()

      return true
    }

    const nextGame = new Chess(game.fen())
    const whiteMove = nextGame.move({
      from: sourceSquare,
      to: targetSquare,
      promotion: 'q',
    })

    if (!whiteMove) return false

    const elapsed = Date.now() - moveStartedAtRef.current
    setMoveTimesMs((prev) => [...prev, elapsed])
    setGame(nextGame)
    setLastMove({ from: whiteMove.from, to: whiteMove.to })
    clearHighlights()
    setLocked(true)
    setJustSolved(false)

    void (async () => {
      const afterWhiteEval = await evaluatePosition(
        nextGame.fen(),
        mode.kind === 'phase3' ? ENGINE_DEPTH_PHASE3 : ENGINE_DEPTH_PHASE2
      )
      setEngineInfo(afterWhiteEval)

      const whiteResult = getFreeplayResult(nextGame, currentFreeplaySet!, afterWhiteEval)

      if (whiteResult === 'success') {
        await finishSuccess(
          mode.kind === 'phase2' ? 'Success — king reached 8th rank!' : 'CHECKMATE!',
          elapsed
        )
        return
      }

      if (whiteResult === 'fail') {
        await showWrongAndReset(
          nextGame,
          { from: whiteMove.from, to: whiteMove.to, promotion: whiteMove.promotion },
          'Failed',
          mode.kind === 'phase2' ? 'Failed — draw or stalemate' : 'Failed — king escaped the net'
        )
        return
      }

      await playEngineBlackMove(nextGame)
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

  const poolIds =
    mode.kind === 'phase1'
      ? currentChunk?.puzzles.map((p) => p.id) ?? []
      : currentFreeplaySet?.positions.map((fen) => `${currentFreeplaySet.id}::${fen}`) ?? []

  const solvedInCurrent = poolIds.filter((id) => isMastered(id)).length
  const currentPoolTotal = poolIds.length
  const chunkFastSolveCount = poolIds.reduce((sum, id) => sum + getPuzzleProgress(progressMap, id).fastSolves, 0)
  const chunkTarget = currentPoolTotal * FAST_SOLVES_TO_MASTER
  const progressPercent = chunkTarget > 0 ? (chunkFastSolveCount / chunkTarget) * 100 : 0

  const bishopSquares = getWhiteBishopSquares(game)
  const wkSquare = getWhiteKingSquare(game)
  const bkSquare = getBlackKingSquare(game)
  const evalSplit = getEvalBarSplit(engineInfo)
  const topEvalLabel = getTopEvalLabel(engineInfo)
  const bottomEvalLabel = getBottomEvalLabel(engineInfo)

  if (!engineReady) {
    return (
      <div style={{ minHeight: '100vh', background: '#262421', color: '#ffffff', padding: '24px', fontFamily: 'Arial, sans-serif' }}>
        Loading engine...
      </div>
    )
  }

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
          maxWidth: '1360px',
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'minmax(620px, auto) 360px 1fr',
          gap: '12px',
          alignItems: 'start',
        }}
      >
        <div>
          <div
            style={{
              display: 'inline-block',
              background: '#4b4847',
              borderRadius: '12px',
              padding: '12px 18px',
              fontWeight: 700,
              marginBottom: '12px',
            }}
          >
            Two Bishops Trainer
          </div>

          <div style={{ display: 'flex', alignItems: 'stretch', gap: '10px' }}>
            <div
              style={{
                width: '38px',
                height: `${boardWidth}px`,
                borderRadius: '10px',
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
                <div style={{ flex: evalSplit, background: '#f5f5f5', transition: 'all 0.25s ease' }} />
                <div style={{ flex: 100 - evalSplit, background: '#2a2a2a', transition: 'all 0.25s ease' }} />
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
                  fontSize: '11px',
                  fontWeight: 800,
                }}
              >
                <div style={{ color: '#111' }}>{topEvalLabel}</div>
                <div style={{ color: '#fff' }}>{bottomEvalLabel}</div>
              </div>
            </div>

            <div
              style={{
                background: justSolved ? '#3a2a1c' : '#312e2b',
                borderRadius: '16px',
                padding: '16px',
                width: 'fit-content',
                boxShadow: justSolved
                  ? '0 0 0 2px rgba(255,179,71,0.8), 0 8px 28px rgba(255,179,71,0.35)'
                  : '0 8px 24px rgba(0,0,0,0.25)',
                transition: 'all 0.2s ease',
              }}
            >
              <Chessboard
                id="TwoBishopsTrainerBoard"
                position={game.fen()}
                onPieceDrop={onDrop}
                boardWidth={boardWidth}
                boardOrientation={boardOrientation}
                customSquareStyles={getCustomSquareStyles(lastMove, markedSquares, hintSquares, correctSquares)}
                arePiecesDraggable={!locked && !allComplete}
                animationDuration={BOARD_ANIMATION_MS}
                customBoardStyle={{
                  transition: 'all 0.3s ease-in-out',
                }}
              />
            </div>
          </div>

          <div
            style={{
              marginTop: '14px',
              display: 'flex',
              gap: '10px',
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <button onClick={() => void resetPuzzle()} style={primaryButton('#4b4847')}>
              Restart
            </button>
            <button onClick={() => void nextPuzzle()} style={primaryButton('#81b64c')}>
              Next Puzzle
            </button>
            <button onClick={() => void showHint()} style={primaryButton('#3d6d8a')}>
              Hint
            </button>
            <button onClick={() => void shuffleCurrent()} style={primaryButton('#4b4847')}>
              Shuffle
            </button>
            <button onClick={() => void prevModeOrChunk()} style={primaryButton('#666')}>
              Prev Chunk
            </button>
            <button onClick={() => void nextModeOrChunk()} style={primaryButton('#666')}>
              Next Chunk
            </button>
          </div>
        </div>

        <div
          style={{
            background: '#312e2b',
            borderRadius: '16px',
            padding: '14px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          }}
        >
          <div
            style={{
              background: '#4b4847',
              borderRadius: '12px',
              padding: '12px 14px',
              fontWeight: 700,
              fontSize: '18px',
              marginBottom: '10px',
            }}
          >
            ☐ {game.turn() === 'b' ? 'Black to Move' : 'White to Move'}
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '14px',
              padding: '0 2px',
              marginBottom: '8px',
            }}
          >
            <span>{phaseTitle(mode, currentChunk)}</span>
            <span>{currentPoolTotal === 0 ? 0 : queueIndex + 1} / {Math.max(currentPoolTotal, 0)}</span>
          </div>

          <div style={panelCardStyle}>
            <div style={{ fontWeight: 700, marginBottom: '8px' }}>Chunk mastery</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '6px' }}>
              <span>{chunkFastSolveCount} / {chunkTarget}</span>
              <span>{Math.round(progressPercent)}%</span>
            </div>
            <div style={progressTrackStyle}>
              <div style={{ width: `${progressPercent}%`, height: '100%', background: '#81b64c' }} />
            </div>
            <div style={{ fontSize: '13px', color: '#cfcfcf', display: 'flex', justifyContent: 'space-between' }}>
              <span>{solvedInCurrent} / {currentPoolTotal} puzzles mastered</span>
              <span>5 fast solves each</span>
            </div>
          </div>

          <div style={panelCardStyle}>
            <div style={{ fontWeight: 700, marginBottom: '8px' }}>This puzzle</div>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
              {Array.from({ length: FAST_SOLVES_TO_MASTER }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: '8px',
                    borderRadius: '999px',
                    background: i < (currentProgress?.fastSolves ?? 0) ? '#81b64c' : '#4b4847',
                  }}
                />
              ))}
            </div>
            <div style={{ fontSize: '13px', color: '#cfcfcf', display: 'flex', justifyContent: 'space-between' }}>
              <span>{currentProgress?.fastSolves ?? 0} / {FAST_SOLVES_TO_MASTER} fast solves</span>
              <span>Fast = every move ≤ {MAX_SECONDS_PER_MOVE}s</span>
            </div>
          </div>

          <div
            style={{
              textAlign: 'center',
              fontSize: '34px',
              fontWeight: 700,
              color: currentMoveElapsedMs <= MAX_SECONDS_PER_MOVE * 1000 ? '#ffb347' : '#ff6b6b',
              margin: '8px 0 6px',
            }}
          >
            {(currentMoveElapsedMs / 1000).toFixed(1)}s
          </div>

          <div
            style={{
              textAlign: 'center',
              fontSize: '14px',
              color: '#cfcfcf',
              marginBottom: '14px',
            }}
          >
            Timer for current move
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(10, 1fr)',
              gap: '4px',
              marginBottom: '14px',
            }}
          >
            {poolIds.map((id, i) => {
              const stats = getPuzzleProgress(progressMap, id)
              const isCurrent = i === currentPuzzleIndex
              const isFlashing = flashSolvedId === id

              let background = '#4b4847'
              let border = '1px solid transparent'
              let boxShadow = 'none'

              if (stats.mastered) background = '#81b64c'
              else if (isFlashing) {
                background = '#d8ff8a'
                boxShadow = '0 0 10px rgba(216,255,138,0.65)'
              }

              if (isCurrent) {
                border = '1px solid #ffd54a'
                if (!stats.mastered && !isFlashing) background = '#6a6238'
              }

              return (
                <div
                  key={id}
                  title={`${i + 1} | fast ${stats.fastSolves}/5${stats.mastered ? ' | mastered' : ''}`}
                  style={{
                    height: '14px',
                    borderRadius: '3px',
                    background,
                    border,
                    boxShadow,
                    transition: 'all 0.2s ease',
                  }}
                />
              )
            })}
          </div>

          <div
            style={{
              textAlign: 'center',
              fontWeight: 700,
              fontSize: '26px',
              marginBottom: '14px',
            }}
          >
            {status || getCurrentPrompt()}
          </div>

          <div style={panelCardStyle}>
            <div><strong>Section:</strong> {mode.kind === 'phase1' ? currentChunk?.label : currentFreeplaySet?.label}</div>
            <div><strong>Mode:</strong> {phaseTitle(mode, currentChunk)}</div>
            <div><strong>Puzzle solves:</strong> {currentProgress?.fastSolves ?? 0} / 5</div>
            <div><strong>Total solves:</strong> {currentProgress?.totalSolves ?? 0}</div>
            {mode.kind === 'phase1' ? (
              <>
                <div><strong>Step:</strong> {activeSteps.length > 0 ? `${stepIndex + 1} / ${activeSteps.length}` : '-'}</div>
                <div><strong>Line:</strong> {currentPuzzle?.lineId ?? '-'}</div>
              </>
            ) : (
              <div><strong>Freeplay:</strong> real engine</div>
            )}
            <div><strong>Engine:</strong> {engineReady ? 'ready' : 'loading'}</div>
            <div>
              <strong>Eval:</strong>{' '}
              {engineInfo?.mate !== null && engineInfo?.mate !== undefined
                ? `Mate ${engineInfo.mate}`
                : engineInfo?.eval !== null && engineInfo?.eval !== undefined
                  ? `${engineInfo.eval > 0 ? '+' : ''}${engineInfo.eval}`
                  : '-'}
            </div>
            <div><strong>Best:</strong> {engineInfo?.bestMove ?? '-'}</div>
            <div><strong>Mate distance:</strong> {getEngineMateDistanceText(engineInfo)}</div>
            <div><strong>WK:</strong> {wkSquare || '-'} | <strong>BK:</strong> {bkSquare || '-'}</div>
            <div><strong>Bishops:</strong> {bishopSquares.join(', ') || '-'}</div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
            <button onClick={() => void resetPuzzle()} style={{ ...primaryButton('#4b4847'), flex: 1 }}>
              Restart
            </button>
            <button onClick={() => void showHint()} style={{ ...primaryButton('#3d6d8a'), flex: 1 }}>
              Hint
            </button>
            <button onClick={() => void nextPuzzle()} style={{ ...primaryButton('#81b64c'), flex: 1 }}>
              Next
            </button>
          </div>

          <div style={{ fontSize: '13px', color: '#bfbfbf', display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span>{phaseTitle(mode, currentChunk)}</span>
            <span>{boardWidth}px</span>
          </div>

          <input
            type="range"
            min={420}
            max={760}
            step={10}
            value={boardWidth}
            onChange={(e) => setBoardWidth(Number(e.target.value))}
            style={{ width: '100%' }}
          />

          <div style={panelCardStyle}>
            <div style={{ fontWeight: 700, marginBottom: '6px' }}>{getCurrentPrompt()}</div>
            {message ? <div style={{ color: '#d6d6d6', lineHeight: 1.5 }}>{message}</div> : null}
            {shouldAllowWaitingMoveOverride() ? (
              <div style={{ color: '#9e9e9e', marginTop: '8px', fontSize: '12px' }}>
                Long-line rule: first move may be any bishop waiting move to a1, b2, c3, d4, e5, or h8.
              </div>
            ) : null}
          </div>
        </div>

        <div />
      </div>
    </div>
  )
}

const panelCardStyle: CSSProperties = {
  background: '#262421',
  borderRadius: '12px',
  padding: '12px',
  marginBottom: '12px',
  fontSize: '14px',
  lineHeight: 1.45,
}

const progressTrackStyle: CSSProperties = {
  width: '100%',
  height: '10px',
  background: '#4b4847',
  borderRadius: '999px',
  overflow: 'hidden',
  marginBottom: '6px',
}