import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, MutableRefObject } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { BNEngine } from './lib/bnEngine'
import type { EngineResult } from './lib/bnEngine'

import phase1Data from '../two_bishop_mate/two_bishops_phase1_chunks.json'
import phase2Data from '../two_bishop_mate/two_bishops_phase2.json'
import phase3Data from '../two_bishop_mate/two_bishops_phase3.json'

type PositionProgress = {
  fastSolves: number
  totalSolves: number
  mastered: boolean
}

type TrainerProgress = {
  positions: Record<string, PositionProgress>
  currentChunkIndex: number
}

type Phase1Position = {
  line_number: number
  line_id: string
  distance_from_mate: number
  fen: string
  move: string
  start_fen: string
}

type Phase1Line = {
  line_number: number
  line_id: string
  start_fen: string
  moves: string[]
}

type Phase1Chunk =
  | {
      chunk_id: string
      label: string
      distance_from_mate: number
      positions: Phase1Position[]
      lines?: never
    }
  | {
      chunk_id: string
      label: string
      positions?: never
      lines: Phase1Line[]
    }

type Phase1File = {
  phase: number
  line_count: number
  chunks: Phase1Chunk[]
}

type FreeplayFile = {
  chunk_id: string
  label: string
  type: 'freeplay'
  goal: 'reach_entry' | 'mate'
  entry_fens?: string[]
  positions: string[]
}

type ExactPuzzle = {
  id: string
  label: string
  kind: 'exact'
  startFen: string
  expectedSan: string
  expectedUci: string
  distanceFromMate: number
}

type LinePuzzleStep = {
  whiteSan: string
  whiteUci: string
  blackSan?: string
  blackUci?: string
  nextFen?: string
}

type FullLinePuzzle = {
  id: string
  label: string
  kind: 'line'
  startFen: string
  steps: LinePuzzleStep[]
  distanceFromMate?: number
}

type FreeplayPuzzle = {
  id: string
  label: string
  kind: 'freeplay'
  startFen: string
  goal: 'reach_entry' | 'mate'
  entryFens?: string[]
}

type TrainerPuzzle = ExactPuzzle | FullLinePuzzle | FreeplayPuzzle

type ChunkDef = {
  id: string
  label: string
  phase: 'phase1' | 'phase2' | 'phase3'
  mode: 'exact' | 'line' | 'freeplay'
  goal?: 'reach_entry' | 'mate'
  puzzles: TrainerPuzzle[]
}

type ChunkGroup = {
  phaseId: 'phase1' | 'phase2' | 'phase3'
  label: string
  chunks: ChunkDef[]
}

const BOARD_WIDTH_KEY = 'twoBishops_boardWidth_v1'
const PROGRESS_KEY = 'twoBishops_progress_v1'
const POSITION_FAST_SOLVES_TO_MASTER = 5
const CORRECT_DELAY_MS = 1300
const WRONG_DELAY_MS = 2200
const ENGINE_REPLY_DELAY_MS = 450
const ENGINE_DEPTH = 14
const NON_MATE_EVAL_SLACK_CP = 40

function normalizeFen(fen: string) {
  return fen.trim()
}

function fenKey4(fen: string) {
  return normalizeFen(fen).split(' ').slice(0, 4).join(' ')
}

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

function extractChunkNumber(chunkId: string, fallbackNumber: number) {
  const match = chunkId.match(/(\d+)/)
  if (match) return Number(match[1])
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

function loadStoredProgress(): TrainerProgress | null {
  const raw = localStorage.getItem(PROGRESS_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as TrainerProgress
  } catch {
    return null
  }
}

function saveProgress(progress: TrainerProgress) {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress))
}

function createEmptyTrainerProgress(): TrainerProgress {
  return {
    positions: {},
    currentChunkIndex: 0,
  }
}

function mergeProgress(stored: TrainerProgress | null): TrainerProgress {
  return {
    positions: stored?.positions ?? {},
    currentChunkIndex: stored?.currentChunkIndex ?? 0,
  }
}

function getPositionStats(progress: TrainerProgress | null, positionId: string): PositionProgress {
  if (!progress) {
    return { fastSolves: 0, totalSolves: 0, mastered: false }
  }

  return progress.positions[positionId] ?? {
    fastSolves: 0,
    totalSolves: 0,
    mastered: false,
  }
}

function shuffleArray<T>(items: T[]) {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function buildPuzzleCycle(
  puzzles: TrainerPuzzle[],
  trainerProgress: TrainerProgress,
  recentIds: string[] = []
) {
  const unmastered = puzzles.filter((p) => !getPositionStats(trainerProgress, p.id).mastered)
  const source = unmastered.length > 0 ? unmastered : puzzles

  const filtered =
    source.length > 3
      ? source.filter((p) => !recentIds.includes(p.id))
      : source

  const finalSource = filtered.length > 0 ? filtered : source
  return shuffleArray(finalSource.map((p) => p.id))
}

function chooseNextPuzzleIndexFromCycle(
  puzzles: TrainerPuzzle[],
  trainerProgress: TrainerProgress,
  cycleRef: MutableRefObject<string[]>,
  recentIdsRef: MutableRefObject<string[]>,
  excludeId?: string | null
) {
  const availableIds = new Set(
    puzzles
      .filter((p) => !getPositionStats(trainerProgress, p.id).mastered)
      .map((p) => p.id)
  )

  if (availableIds.size === 0) {
    const allIds = puzzles.map((p) => p.id)
    cycleRef.current = shuffleArray(
      excludeId && allIds.length > 1 ? allIds.filter((id) => id !== excludeId) : allIds
    )
  } else {
    cycleRef.current = cycleRef.current.filter((id) => availableIds.has(id))
    if (cycleRef.current.length === 0) {
      cycleRef.current = buildPuzzleCycle(puzzles, trainerProgress, recentIdsRef.current)
    }
  }

  let nextId = cycleRef.current.shift() ?? null

  if (excludeId && puzzles.length > 1 && nextId === excludeId) {
    const fallback = cycleRef.current.find((id) => id !== excludeId)
    if (fallback) {
      cycleRef.current = cycleRef.current.filter((id) => id !== fallback)
      cycleRef.current.push(nextId)
      nextId = fallback
    }
  }

  const index = puzzles.findIndex((p) => p.id === nextId)
  return index >= 0 ? index : 0
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

  return moves.filter((m) => m.color === 'b' && m.piece === 'k').map((m) => m.to)
}

function formatSquares(squares: string[]) {
  if (squares.length === 0) return 'none'
  return squares.join(', ')
}

function convertSanToUci(startFen: string, san: string) {
  const board = new Chess(startFen)
  const moveObj = board.move(san)
  if (!moveObj) {
    throw new Error(`Could not convert SAN ${san} from ${startFen}`)
  }
  return {
    uci: moveToUci({
      from: moveObj.from,
      to: moveObj.to,
      promotion: moveObj.promotion,
    }),
    afterFen: board.fen(),
  }
}

function buildLineSteps(startFen: string, sanMoves: string[]): LinePuzzleStep[] {
  const board = new Chess(startFen)
  const steps: LinePuzzleStep[] = []

  for (let i = 0; i < sanMoves.length; i += 2) {
    const whiteSan = sanMoves[i]
    const whiteMove = board.move(whiteSan)
    if (!whiteMove) throw new Error(`Bad white SAN ${whiteSan}`)

    const step: LinePuzzleStep = {
      whiteSan,
      whiteUci: moveToUci({
        from: whiteMove.from,
        to: whiteMove.to,
        promotion: whiteMove.promotion,
      }),
    }

    const blackSan = sanMoves[i + 1]
    if (blackSan) {
      const blackMove = board.move(blackSan)
      if (!blackMove) throw new Error(`Bad black SAN ${blackSan}`)
      step.blackSan = blackSan
      step.blackUci = moveToUci({
        from: blackMove.from,
        to: blackMove.to,
        promotion: blackMove.promotion,
      })
    }

    steps.push(step)
  }

  return steps
}

function sortPositionsInLine(a: Phase1Position, b: Phase1Position) {
  if (a.distance_from_mate !== b.distance_from_mate) {
    return b.distance_from_mate - a.distance_from_mate
  }
  if (a.line_number !== b.line_number) {
    return a.line_number - b.line_number
  }
  return a.fen.localeCompare(b.fen)
}

function findBlackReplyUciToReachNextWhiteFen(afterWhiteFen: string, nextWhiteFen: string) {
  const board = new Chess(afterWhiteFen)
  const targetKey = fenKey4(nextWhiteFen)

  const legalMoves = board.moves({ verbose: true }) as Array<{
    from: string
    to: string
    promotion?: string
    san: string
  }>

  for (const legal of legalMoves) {
    const probe = new Chess(afterWhiteFen)
    const played = probe.move({
      from: legal.from,
      to: legal.to,
      promotion: legal.promotion,
    })

    if (!played) continue

    if (fenKey4(probe.fen()) === targetKey) {
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

function buildContinuationStepsFromPositions(linePositions: Phase1Position[], startIndex: number) {
  const steps: LinePuzzleStep[] = []

  for (let i = startIndex; i < linePositions.length; i += 1) {
    const current = linePositions[i]
    const currentBoard = new Chess(current.fen)

    const whitePlayed = currentBoard.move(current.move)
    if (!whitePlayed) {
      throw new Error(`Bad white SAN ${current.move} from ${current.fen}`)
    }

    const step: LinePuzzleStep = {
      whiteSan: current.move,
      whiteUci: moveToUci({
        from: whitePlayed.from,
        to: whitePlayed.to,
        promotion: whitePlayed.promotion,
      }),
    }

    const nextPosition = linePositions[i + 1]
    if (nextPosition) {
      step.nextFen = normalizeFen(nextPosition.fen)

      const reply = findBlackReplyUciToReachNextWhiteFen(currentBoard.fen(), nextPosition.fen)
      if (reply) {
        step.blackSan = reply.san
        step.blackUci = reply.uci
      }
    }

    steps.push(step)
  }

  return steps
}

function buildDedupedPositionChunkPuzzles(
  rawChunk: Extract<Phase1Chunk, { positions: Phase1Position[] }>
): FullLinePuzzle[] {
  const byLineId = new Map<string, Phase1Position[]>()

  for (const pos of rawChunk.positions) {
    const arr = byLineId.get(pos.line_id) ?? []
    arr.push(pos)
    byLineId.set(pos.line_id, arr)
  }

  const candidates: FullLinePuzzle[] = []

  for (const [lineId, linePositionsRaw] of byLineId.entries()) {
    const linePositions = [...linePositionsRaw].sort(sortPositionsInLine)

    for (let startIndex = 0; startIndex < linePositions.length; startIndex += 1) {
      const startPos = linePositions[startIndex]
      const steps = buildContinuationStepsFromPositions(linePositions, startIndex)

      if (steps.length === 0) continue

      candidates.push({
        id: `phase1::${rawChunk.chunk_id}::${lineId}::${startIndex + 1}`,
        label: `${lineId} · ${rawChunk.label}`,
        kind: 'line',
        startFen: normalizeFen(startPos.fen),
        steps,
        distanceFromMate: startPos.distance_from_mate,
      })
    }
  }

  const dedupedByFen = new Map<string, FullLinePuzzle>()

  for (const puzzle of candidates) {
    const key = fenKey4(puzzle.startFen)
    const existing = dedupedByFen.get(key)

    if (!existing) {
      dedupedByFen.set(key, puzzle)
      continue
    }

    const currentSteps = puzzle.steps.length
    const existingSteps = existing.steps.length

    if (currentSteps > existingSteps) {
      dedupedByFen.set(key, puzzle)
      continue
    }

    if (
      currentSteps === existingSteps &&
      (puzzle.distanceFromMate ?? 999) < (existing.distanceFromMate ?? 999)
    ) {
      dedupedByFen.set(key, puzzle)
    }
  }

  return Array.from(dedupedByFen.values())
}

function buildChunks(): ChunkDef[] {
  const phase1 = phase1Data as Phase1File
  const phase2 = phase2Data as FreeplayFile
  const phase3 = phase3Data as FreeplayFile

  const chunks: ChunkDef[] = []

  for (const rawChunk of phase1.chunks) {
    if ('positions' in rawChunk && rawChunk.positions) {
      const puzzles = buildDedupedPositionChunkPuzzles(rawChunk)

      chunks.push({
        id: rawChunk.chunk_id,
        label: rawChunk.label,
        phase: 'phase1',
        mode: 'line',
        puzzles,
      })
    } else if ('lines' in rawChunk && rawChunk.lines) {
      const puzzles: FullLinePuzzle[] = rawChunk.lines.map((line) => ({
        id: `phase1::${rawChunk.chunk_id}::${line.line_number}`,
        label: `${line.line_id} · full line`,
        kind: 'line',
        startFen: normalizeFen(line.start_fen),
        steps: buildLineSteps(line.start_fen, line.moves),
      }))

      chunks.push({
        id: rawChunk.chunk_id,
        label: rawChunk.label,
        phase: 'phase1',
        mode: 'line',
        puzzles,
      })
    }
  }

  chunks.push({
    id: phase2.chunk_id,
    label: phase2.label,
    phase: 'phase2',
    mode: 'freeplay',
    goal: phase2.goal,
    puzzles: phase2.positions.map((fen, index) => ({
      id: `phase2::${index + 1}`,
      label: `Center to entry #${index + 1}`,
      kind: 'freeplay',
      startFen: normalizeFen(fen),
      goal: 'reach_entry',
      entryFens: phase2.entry_fens?.map(fenKey4),
    })),
  })

  chunks.push({
    id: phase3.chunk_id,
    label: phase3.label,
    phase: 'phase3',
    mode: 'freeplay',
    goal: phase3.goal,
    puzzles: phase3.positions.map((fen, index) => ({
      id: `phase3::${index + 1}`,
      label: `Center to mate #${index + 1}`,
      kind: 'freeplay',
      startFen: normalizeFen(fen),
      goal: 'mate',
    })),
  })

  return chunks
}

function getChunkGroups(chunks: ChunkDef[]): ChunkGroup[] {
  return [
    {
      phaseId: 'phase1',
      label: 'Phase 1 · Entry to mate',
      chunks: chunks.filter((c) => c.phase === 'phase1'),
    },
    {
      phaseId: 'phase2',
      label: 'Phase 2 · Start to entry',
      chunks: chunks.filter((c) => c.phase === 'phase2'),
    },
    {
      phaseId: 'phase3',
      label: 'Phase 3 · Start to mate',
      chunks: chunks.filter((c) => c.phase === 'phase3'),
    },
  ]
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

function getInstructionText(puzzle: TrainerPuzzle | null, chunk: ChunkDef | null, lineStepIndex = 0) {
  if (!puzzle || !chunk) return 'Find the move'

  if (puzzle.kind === 'exact') {
    if (puzzle.distanceFromMate === 1) return 'Find the mate in 1'
    return `Find the move (mate in ${puzzle.distanceFromMate})`
  }

  if (puzzle.kind === 'line') {
    const stepNo = lineStepIndex + 1
    return `Play line move ${stepNo} / ${puzzle.steps.length}`
  }

  if (puzzle.goal === 'reach_entry') return 'Drive the black king to one of the entry positions'
  return 'Mate the black king'
}

function matchesEntryGoal(game: Chess, entryFens: string[] = []) {
  const current = fenKey4(game.fen())
  return entryFens.includes(current)
}

export default function TwoBishopsMateTrainer() {
  const chunks = useMemo(() => buildChunks(), [])
  const chunkGroups = useMemo(() => getChunkGroups(chunks), [chunks])

  const [progress, setProgress] = useState<TrainerProgress>(() => mergeProgress(loadStoredProgress()))
  const [currentIndex, setCurrentIndex] = useState(0)
  const [game, setGame] = useState(new Chess())
  const [status, setStatus] = useState('Loading...')
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
  const [moveTimesMs, setMoveTimesMs] = useState<number[]>([])
  const [engineReady, setEngineReady] = useState(false)
  const [engineInfo, setEngineInfo] = useState<EngineResult | null>(null)
  const [currentMoveElapsedMs, setCurrentMoveElapsedMs] = useState(0)
  const [justMated, setJustMated] = useState(false)
  const [flashSolvedPositionId, setFlashSolvedPositionId] = useState<string | null>(null)
  const [jumpChunkInput, setJumpChunkInput] = useState('')
  const [lineStepIndex, setLineStepIndex] = useState(0)

  const moveStartedAtRef = useRef<number>(Date.now())
  const feedbackTimeoutRef = useRef<number | null>(null)
  const engineRef = useRef<BNEngine | null>(null)
  const analysisTokenRef = useRef(0)
  const puzzleCycleRef = useRef<string[]>([])
  const recentPuzzleIdsRef = useRef<string[]>([])

  useEffect(() => {
    localStorage.setItem(BOARD_WIDTH_KEY, String(boardWidth))
  }, [boardWidth])

  useEffect(() => {
    saveProgress(progress)
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
      if (inputLocked) return
      setCurrentMoveElapsedMs(Date.now() - moveStartedAtRef.current)
    }, 100)

    return () => window.clearInterval(interval)
  }, [inputLocked])

  const currentChunk = chunks[progress.currentChunkIndex] ?? null
  const currentPuzzles = currentChunk?.puzzles ?? []
  const currentPuzzle = currentPuzzles[currentIndex] ?? null
  const currentStats = currentPuzzle ? getPositionStats(progress, currentPuzzle.id) : null

  const currentChunkNumber = useMemo(() => {
    if (!currentChunk) return null
    return progress.currentChunkIndex + 1
  }, [progress.currentChunkIndex, currentChunk])

  const chunkMasteredCount = useMemo(() => {
    return currentPuzzles.filter((p) => getPositionStats(progress, p.id).mastered).length
  }, [currentPuzzles, progress])

  const chunkFastSolveCount = useMemo(() => {
    return currentPuzzles.reduce((sum, p) => sum + getPositionStats(progress, p.id).fastSolves, 0)
  }, [currentPuzzles, progress])

  const chunkTarget = currentPuzzles.length * POSITION_FAST_SOLVES_TO_MASTER
  const progressPercent = chunkTarget > 0 ? (chunkFastSolveCount / chunkTarget) * 100 : 0
  const chunkComplete = currentPuzzles.length > 0 && chunkMasteredCount === currentPuzzles.length

  const themeDoneCount = useMemo(() => {
    return chunkGroups.reduce((sum, group) => {
      const groupDone = group.chunks.every((chunk) =>
        chunk.puzzles.every((p) => getPositionStats(progress, p.id).mastered)
      )
      return sum + (groupDone ? 1 : 0)
    }, 0)
  }, [chunkGroups, progress])

  function clearHighlights() {
    setMarkedSquare(null)
    setCorrectSquares([])
    setEscapeSquares([])
    setHintSquares([])
  }

  function addCorrectSquare(square: string) {
    setCorrectSquares((prev) => (prev.includes(square) ? prev : [...prev, square]))
  }

  function clearPendingFeedbackTimeout() {
    if (feedbackTimeoutRef.current) {
      window.clearTimeout(feedbackTimeoutRef.current)
      feedbackTimeoutRef.current = null
    }
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

  function loadPuzzle(index: number) {
    const puzzle = currentPuzzles[index]
    if (!puzzle || !currentChunk) return

    clearPendingFeedbackTimeout()
    setFlashSolvedPositionId(null)
    setCurrentIndex(index)
    setGame(new Chess(puzzle.startFen))
    setStatus(getInstructionText(puzzle, currentChunk, 0))
    setMessage('')
    setLastMove({})
    clearHighlights()
    setInputLocked(false)
    setMoveTimesMs([])
    setCurrentMoveElapsedMs(0)
    setJustMated(false)
    setLineStepIndex(0)
    moveStartedAtRef.current = Date.now()

    recentPuzzleIdsRef.current = [puzzle.id, ...recentPuzzleIdsRef.current.filter((id) => id !== puzzle.id)].slice(0, 4)

    void analyzeCurrentFen(puzzle.startFen)
  }

  function loadRandomNextPuzzle(excludeId?: string | null) {
    const nextIndex = chooseNextPuzzleIndexFromCycle(
      currentPuzzles,
      progress,
      puzzleCycleRef,
      recentPuzzleIdsRef,
      excludeId
    )
    loadPuzzle(nextIndex)
  }

  useEffect(() => {
    if (!currentChunk || currentPuzzles.length === 0) {
      setStatus('No chunk loaded.')
      return
    }

    puzzleCycleRef.current = buildPuzzleCycle(currentPuzzles, progress, recentPuzzleIdsRef.current)

    const nextIndex = chooseNextPuzzleIndexFromCycle(
      currentPuzzles,
      progress,
      puzzleCycleRef,
      recentPuzzleIdsRef
    )
    const puzzle = currentPuzzles[nextIndex]

    setCurrentIndex(nextIndex)
    setGame(new Chess(puzzle.startFen))
    setStatus(getInstructionText(puzzle, currentChunk, 0))
    setMessage('')
    setLastMove({})
    clearHighlights()
    setInputLocked(false)
    setMoveTimesMs([])
    setCurrentMoveElapsedMs(0)
    setJustMated(false)
    setFlashSolvedPositionId(null)
    setLineStepIndex(0)
    moveStartedAtRef.current = Date.now()
    recentPuzzleIdsRef.current = [puzzle.id, ...recentPuzzleIdsRef.current.filter((id) => id !== puzzle.id)].slice(0, 4)
    void analyzeCurrentFen(puzzle.startFen)
  }, [progress.currentChunkIndex])

  function resetCurrentPuzzle() {
    loadPuzzle(currentIndex)
    setStatus('Position restarted.')
  }

  function nextPuzzle() {
    loadRandomNextPuzzle(currentPuzzle?.id ?? null)
  }

  function resetCurrentChunk() {
    const nextPositions = { ...progress.positions }
    for (const p of currentPuzzles) {
      nextPositions[p.id] = {
        fastSolves: 0,
        totalSolves: 0,
        mastered: false,
      }
    }

    const updated = {
      ...progress,
      positions: nextPositions,
    }

    puzzleCycleRef.current = buildPuzzleCycle(currentPuzzles, updated, [])
    recentPuzzleIdsRef.current = []

    setProgress(updated)
    const nextIndex = chooseNextPuzzleIndexFromCycle(
      currentPuzzles,
      updated,
      puzzleCycleRef,
      recentPuzzleIdsRef
    )
    loadPuzzle(nextIndex)
    setStatus('Chunk reset.')
    setMessage('')
  }

  function resetWholeProgression() {
    clearPendingFeedbackTimeout()
    localStorage.removeItem(PROGRESS_KEY)
    const fresh = createEmptyTrainerProgress()
    puzzleCycleRef.current = []
    recentPuzzleIdsRef.current = []
    setProgress(fresh)
    setCurrentIndex(0)
    clearHighlights()
    setInputLocked(false)
    setMoveTimesMs([])
    setCurrentMoveElapsedMs(0)
    setJustMated(false)
    setFlashSolvedPositionId(null)
    setLineStepIndex(0)
    setStatus('Progression reset.')
    setMessage('')
    setEngineInfo(null)
  }

  function goToChunk(targetIndex: number) {
    const safe = Math.max(0, Math.min(chunks.length - 1, targetIndex))
    clearPendingFeedbackTimeout()
    puzzleCycleRef.current = []
    recentPuzzleIdsRef.current = []
    setFlashSolvedPositionId(null)
    setCurrentIndex(0)
    clearHighlights()
    setInputLocked(false)
    setMoveTimesMs([])
    setCurrentMoveElapsedMs(0)
    setJustMated(false)
    setLineStepIndex(0)
    setStatus('Loading chunk...')
    setMessage('')
    setProgress((prev) => ({
      ...prev,
      currentChunkIndex: safe,
    }))
  }

  function jumpToChunkByNumber(raw: string) {
    const targetNumber = parseJumpChunkNumber(raw)
    if (!targetNumber) {
      setStatus('Jump chunk')
      setMessage('Enter a valid chunk number.')
      return
    }

    const targetIndex = targetNumber - 1
    if (targetIndex < 0 || targetIndex >= chunks.length) {
      setStatus('Jump chunk')
      setMessage(`Chunk ${targetNumber} not found.`)
      return
    }

    goToChunk(targetIndex)
    setJumpChunkInput(String(targetNumber))
  }

  function moveToNextChunk() {
    if (progress.currentChunkIndex >= chunks.length - 1) {
      setStatus('All phases complete.')
      setMessage('Two Bishops progression finished.')
      setInputLocked(false)
      return
    }

    goToChunk(progress.currentChunkIndex + 1)
  }

  function moveToPrevChunk() {
    goToChunk(progress.currentChunkIndex - 1)
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
      loadPuzzle(currentIndex)
    }, WRONG_DELAY_MS)
  }

  function finishSolvedPosition(nextGame: Chess, correctMove: { from: string; to: string; promotion?: string }) {
    if (!currentPuzzle || !currentChunk) return

    clearPendingFeedbackTimeout()
    setFlashSolvedPositionId(currentPuzzle.id)

    const moveElapsedMs = Date.now() - moveStartedAtRef.current
    setCurrentMoveElapsedMs(moveElapsedMs)

    const nextMoveTimes = [...moveTimesMs, moveElapsedMs]
    setMoveTimesMs(nextMoveTimes)

    const maxMsPerMove = 3000
    const wasFast = nextMoveTimes.every((ms) => ms <= maxMsPerMove)

    const oldStats = getPositionStats(progress, currentPuzzle.id)
    const nextFastSolves = wasFast
      ? Math.min(POSITION_FAST_SOLVES_TO_MASTER, oldStats.fastSolves + 1)
      : oldStats.fastSolves

    const positionMastered = nextFastSolves >= POSITION_FAST_SOLVES_TO_MASTER

    const updatedProgress: TrainerProgress = {
      ...progress,
      positions: {
        ...progress.positions,
        [currentPuzzle.id]: {
          fastSolves: nextFastSolves,
          totalSolves: oldStats.totalSolves + 1,
          mastered: positionMastered,
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
    setJustMated(nextGame.isCheckmate())

    setStatus(nextGame.isCheckmate() ? 'CHECKMATE!' : 'Correct.')
    setMessage(
      wasFast
        ? `Fast solve ${nextFastSolves}/${POSITION_FAST_SOLVES_TO_MASTER} for this puzzle.`
        : 'Solved, but slower than 3 seconds.'
    )

    feedbackTimeoutRef.current = window.setTimeout(() => {
      const newChunkComplete = currentPuzzles.every((p) => {
        const stats =
          p.id === currentPuzzle.id
            ? updatedProgress.positions[p.id]
            : getPositionStats(updatedProgress, p.id)
        return stats.mastered
      })

      if (newChunkComplete) {
        setStatus('Chunk complete.')
        setMessage('Loading next chunk...')
        moveToNextChunk()
        return
      }

      setInputLocked(false)
      const nextIndex = chooseNextPuzzleIndexFromCycle(
        currentPuzzles,
        updatedProgress,
        puzzleCycleRef,
        recentPuzzleIdsRef,
        currentPuzzle.id
      )
      loadPuzzle(nextIndex)
    }, CORRECT_DELAY_MS)
  }

  async function validateByEngine(beforeFen: string, afterFen: string, attemptedUci: string, nextGame: Chess) {
    const before = engineInfo ?? (await evaluatePosition(beforeFen))
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

  async function playFreeplayEngineReplyIfNeeded(
    afterUserGame: Chess,
    userMove: { from: string; to: string; promotion?: string },
    afterUserInfo?: EngineResult | null
  ) {
    if (!currentPuzzle || currentPuzzle.kind !== 'freeplay') return

    if (currentPuzzle.goal === 'mate' && afterUserGame.isCheckmate()) {
      finishSolvedPosition(afterUserGame, userMove)
      return
    }

    const replyInfo = afterUserInfo ?? (await evaluatePosition(afterUserGame.fen()))
    if (!replyInfo?.bestMove) {
      setGame(afterUserGame)
      setLastMove({ from: userMove.from, to: userMove.to })
      clearHighlights()
      setStatus(getInstructionText(currentPuzzle, currentChunk))
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

    const parsed = parseUciMove(replyInfo.bestMove)
    if (!parsed) {
      setStatus(getInstructionText(currentPuzzle, currentChunk))
      setMessage('Accepted move, but engine reply could not be parsed.')
      setInputLocked(false)
      moveStartedAtRef.current = Date.now()
      setCurrentMoveElapsedMs(0)
      await analyzeCurrentFen(afterUserGame.fen())
      return
    }

    const replyGame = new Chess(afterUserGame.fen())
    const replyMove = replyGame.move({
      from: parsed.from,
      to: parsed.to,
      promotion: parsed.promotion,
    })

    if (!replyMove) {
      setStatus(getInstructionText(currentPuzzle, currentChunk))
      setMessage('Accepted move, but engine reply could not be played.')
      setInputLocked(false)
      moveStartedAtRef.current = Date.now()
      setCurrentMoveElapsedMs(0)
      await analyzeCurrentFen(afterUserGame.fen())
      return
    }

    setGame(replyGame)
    setLastMove({ from: replyMove.from, to: replyMove.to })
    clearHighlights()
    setInputLocked(false)
    setJustMated(false)

    if (currentPuzzle.goal === 'reach_entry' && matchesEntryGoal(replyGame, currentPuzzle.entryFens)) {
      finishSolvedPosition(replyGame, userMove)
      return
    }

    setStatus(getInstructionText(currentPuzzle, currentChunk))
    setMessage(`Black played ${replyInfo.bestMove}. Your move.`)
    moveStartedAtRef.current = Date.now()
    setCurrentMoveElapsedMs(0)
    await analyzeCurrentFen(replyGame.fen())
  }

  async function showHint() {
    if (!currentPuzzle || inputLocked) return

    if (currentPuzzle.kind === 'exact') {
      const parsed = parseUciMove(currentPuzzle.expectedUci)
      if (!parsed) return
      setMarkedSquare(parsed.from)
      setHintSquares([parsed.to])
      setEscapeSquares([])
      setStatus('Hint')
      setMessage(`Try ${parsed.from} → ${parsed.to}`)
      return
    }

    if (currentPuzzle.kind === 'line') {
      const step = currentPuzzle.steps[lineStepIndex]
      if (!step) return
      const parsed = parseUciMove(step.whiteUci)
      if (!parsed) return
      setMarkedSquare(parsed.from)
      setHintSquares([parsed.to])
      setEscapeSquares([])
      setStatus('Hint')
      setMessage(`Play ${parsed.from} → ${parsed.to}`)
      return
    }

    const analysis = engineInfo ?? (await evaluatePosition(game.fen()))
    const hintMoveUci = analysis?.bestMove

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
    setMessage(`Try ${parsed.from} → ${parsed.to}`)
  }

  function handleExactPuzzleDrop(
    _beforeFen: string,
    attemptedUci: string,
    nextGame: Chess,
    move: { from: string; to: string; promotion?: string },
    puzzle: ExactPuzzle
  ) {
    if (attemptedUci !== puzzle.expectedUci) {
      showWrongAndReset(
        nextGame,
        move,
        'Wrong move.',
        `Expected ${puzzle.expectedSan}.`
      )
      return true
    }

    finishSolvedPosition(nextGame, move)
    return true
  }

  async function handleLinePuzzleDrop(
    _beforeFen: string,
    attemptedUci: string,
    nextGame: Chess,
    move: { from: string; to: string; promotion?: string },
    puzzle: FullLinePuzzle
  ) {
    const step = puzzle.steps[lineStepIndex]
    if (!step) return false

    if (attemptedUci !== step.whiteUci) {
      showWrongAndReset(
        nextGame,
        move,
        'Wrong move.',
        `Expected ${step.whiteSan}.`
      )
      return true
    }

    const moveElapsedMs = Date.now() - moveStartedAtRef.current
    const nextMoveTimes = [...moveTimesMs, moveElapsedMs]
    setMoveTimesMs(nextMoveTimes)
    setCurrentMoveElapsedMs(moveElapsedMs)
    setGame(nextGame)
    setLastMove({ from: move.from, to: move.to })
    clearHighlights()
    addCorrectSquare(move.to)

    const isLastWhiteMove = lineStepIndex >= puzzle.steps.length - 1
    if (isLastWhiteMove) {
      finishSolvedPosition(nextGame, move)
      return true
    }

    setInputLocked(true)
    setStatus('Correct.')

    await sleep(ENGINE_REPLY_DELAY_MS)

    const nextLineStepIndex = lineStepIndex + 1

    if (step.blackUci) {
      const parsed = parseUciMove(step.blackUci)

      if (parsed) {
        const replyGame = new Chess(nextGame.fen())
        const replyMove = replyGame.move({
          from: parsed.from,
          to: parsed.to,
          promotion: parsed.promotion,
        })

        if (replyMove) {
          setGame(replyGame)
          setLastMove({ from: replyMove.from, to: replyMove.to })
          clearHighlights()
          setLineStepIndex(nextLineStepIndex)
          setStatus(getInstructionText(puzzle, currentChunk, nextLineStepIndex))
          setMessage(`Black played ${step.blackSan ?? step.blackUci}. Continue the line.`)
          setInputLocked(false)
          moveStartedAtRef.current = Date.now()
          setCurrentMoveElapsedMs(0)
          return true
        }
      }
    }

    if (step.nextFen) {
      const jumpedGame = new Chess(step.nextFen)
      setGame(jumpedGame)
      setLastMove({})
      clearHighlights()
      setLineStepIndex(nextLineStepIndex)
      setStatus(getInstructionText(puzzle, currentChunk, nextLineStepIndex))
      setMessage('Continuing line.')
      setInputLocked(false)
      moveStartedAtRef.current = Date.now()
      setCurrentMoveElapsedMs(0)
      return true
    }

    finishSolvedPosition(nextGame, move)
    return true
  }

  async function handleFreeplayDrop(
    beforeFen: string,
    attemptedUci: string,
    nextGame: Chess,
    move: { from: string; to: string; promotion?: string }
  ) {
    const validation = await validateByEngine(beforeFen, nextGame.fen(), attemptedUci, nextGame)

    if (!validation.ok) {
      showWrongAndReset(
        nextGame,
        move,
        'Wrong move.',
        validation.reason
      )
      return true
    }

    await playFreeplayEngineReplyIfNeeded(nextGame, move, validation.afterUser)
    return true
  }

  function onDrop(sourceSquare: string, targetSquare: string) {
    if (!currentPuzzle || inputLocked) return false

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

    setGame(nextGame)
    setLastMove({ from: move.from, to: move.to })
    clearHighlights()
    setJustMated(false)
    setInputLocked(true)
    setStatus('Checking move...')
    setMessage(engineReady ? 'Evaluating...' : 'Engine not ready.')

    if (currentPuzzle.kind === 'exact') {
      return handleExactPuzzleDrop(beforeFen, attemptedUci, nextGame, move, currentPuzzle)
    }

    if (currentPuzzle.kind === 'line') {
      void handleLinePuzzleDrop(beforeFen, attemptedUci, nextGame, move, currentPuzzle)
      return true
    }

    void handleFreeplayDrop(beforeFen, attemptedUci, nextGame, move)
    return true
  }

  if (!currentChunk || !currentPuzzle) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#262421',
          color: '#ffffff',
          padding: '24px',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        Loading...
      </div>
    )
  }

  const evalSplit = getEvalBarSplit(engineInfo)
  const topEvalLabel = getTopEvalLabel(engineInfo)
  const bottomEvalLabel = getBottomEvalLabel(engineInfo)

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
            Two Bishops Mate Trainer
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
                background: justMated ? '#3a2a1c' : '#312e2b',
                borderRadius: '16px',
                padding: '16px',
                width: 'fit-content',
                boxShadow: justMated
                  ? '0 0 0 2px rgba(255,179,71,0.8), 0 8px 28px rgba(255,179,71,0.35)'
                  : '0 8px 24px rgba(0,0,0,0.25)',
                transition: 'all 0.2s ease',
              }}
            >
              <Chessboard
                id="TwoBishopsMateTrainerBoard"
                position={game.fen()}
                onPieceDrop={onDrop}
                boardWidth={boardWidth}
                customSquareStyles={getCustomSquareStyles(
                  lastMove,
                  markedSquare,
                  correctSquares,
                  escapeSquares,
                  hintSquares
                )}
                arePiecesDraggable={!inputLocked}
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
            <button onClick={resetCurrentPuzzle} style={buttonStyle('#4b4847')}>
              Restart
            </button>

            <button onClick={nextPuzzle} style={buttonStyle('#81b64c')}>
              Next Puzzle
            </button>

            <button onClick={showHint} style={buttonStyle('#3d6d8a')}>
              Hint
            </button>

            <button onClick={resetCurrentChunk} style={buttonStyle('#4b4847')}>
              Reset Chunk
            </button>

            <button onClick={resetWholeProgression} style={buttonStyle('#7a3d3d')}>
              Reset All
            </button>

            <button onClick={moveToPrevChunk} style={buttonStyle('#666')}>
              Prev Chunk
            </button>

            <button onClick={moveToNextChunk} style={buttonStyle('#666')}>
              Next Chunk
            </button>

            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                value={jumpChunkInput}
                onChange={(e) => setJumpChunkInput(e.target.value)}
                placeholder="Chunk #"
                style={inputStyle}
              />
              <button
                onClick={() => jumpToChunkByNumber(jumpChunkInput)}
                style={buttonStyle('#666', '10px 14px')}
              >
                Jump Chunk
              </button>
            </div>
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
            <span>{currentChunk.label}</span>
            <span>{currentIndex + 1} / {currentPuzzles.length}</span>
          </div>

          <div style={panelStyle}>
            <div style={{ fontWeight: 700, marginBottom: '8px' }}>Chunk mastery</div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '14px',
                marginBottom: '6px',
              }}
            >
              <span>{chunkFastSolveCount} / {chunkTarget}</span>
              <span>{Math.round(progressPercent)}%</span>
            </div>
            <div style={progressTrackStyle}>
              <div
                style={{
                  width: `${progressPercent}%`,
                  height: '100%',
                  background: '#81b64c',
                }}
              />
            </div>
            <div
              style={{
                fontSize: '13px',
                color: '#cfcfcf',
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: '6px',
              }}
            >
              <span>{chunkMasteredCount} / {currentPuzzles.length} puzzles at 5/5</span>
              <span>Chunk {currentChunkNumber}</span>
            </div>
          </div>

          <div style={panelStyle}>
            <div style={{ fontWeight: 700, marginBottom: '8px' }}>This puzzle</div>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
              {Array.from({ length: POSITION_FAST_SOLVES_TO_MASTER }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    flex: 1,
                    height: '8px',
                    borderRadius: '999px',
                    background: i < (currentStats?.fastSolves ?? 0) ? '#81b64c' : '#4b4847',
                  }}
                />
              ))}
            </div>
            <div
              style={{
                fontSize: '13px',
                color: '#cfcfcf',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <span>{currentStats?.fastSolves ?? 0} / 5 fast solves</span>
              <span>Fast = ≤ 3s</span>
            </div>
          </div>

          <div
            style={{
              textAlign: 'center',
              fontSize: '34px',
              fontWeight: 700,
              color: '#ffb347',
              margin: '8px 0 6px',
            }}
          >
            🔥 {chunkFastSolveCount}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${Math.min(10, Math.max(1, currentPuzzles.length))}, 1fr)`,
              gap: '4px',
              marginBottom: '14px',
            }}
          >
            {currentPuzzles.map((p, i) => {
              const stats = getPositionStats(progress, p.id)
              const isCurrent = i === currentIndex
              const isMastered = stats.mastered
              const isFlashingSolved = flashSolvedPositionId === p.id

              let background = '#4b4847'
              let border = '1px solid transparent'
              let boxShadow = 'none'

              if (isMastered) {
                background = '#81b64c'
              } else if (isFlashingSolved) {
                background = '#d8ff8a'
                boxShadow = '0 0 10px rgba(216,255,138,0.65)'
              }

              if (isCurrent) {
                border = '1px solid #ffd54a'
                if (!isMastered && !isFlashingSolved) {
                  background = '#6a6238'
                }
              }

              return (
                <div
                  key={p.id}
                  title={`${i + 1}. ${p.label} | fast ${stats.fastSolves}/5${stats.mastered ? ' | mastered' : ''}`}
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
            {getInstructionText(currentPuzzle, currentChunk, lineStepIndex)}
          </div>

          <div style={panelStyle}>
            <div><strong>Puzzle {currentIndex + 1}</strong></div>
            <div>Category: 2 Bishops</div>
            <div>Phase: {currentChunk.phase}</div>
            <div>Chunk: {currentChunk.label}</div>
            <div>Puzzle ID: {currentPuzzle.id.slice(0, 24)}</div>
            <div>User moves: {moveTimesMs.length}</div>
            <div>Time: {(currentMoveElapsedMs / 1000).toFixed(1)}s</div>
            <div>Chunk #: {currentChunkNumber}</div>
            <div>Phases complete: {themeDoneCount} / {chunkGroups.length}</div>
            <div>Engine: {engineReady ? 'ready' : 'loading'}</div>
            <div>
              Eval:{' '}
              {engineInfo?.mate !== null && engineInfo?.mate !== undefined
                ? 'Forced mate'
                : engineInfo?.eval !== null && engineInfo?.eval !== undefined
                  ? `${engineInfo.eval > 0 ? '+' : ''}${engineInfo.eval}`
                  : '-'}
            </div>
            <div>Best: {engineInfo?.bestMove ?? '-'}</div>
            <div>Chunk complete: {chunkComplete ? 'yes' : 'no'}</div>
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
            <button onClick={resetCurrentPuzzle} style={{ ...buttonStyle('#4b4847'), flex: 1 }}>
              Restart
            </button>

            <button onClick={showHint} style={{ ...buttonStyle('#3d6d8a'), flex: 1 }}>
              Hint
            </button>

            <button onClick={nextPuzzle} style={{ ...buttonStyle('#81b64c'), flex: 1 }}>
              Next Puzzle
            </button>
          </div>

          <div
            style={{
              fontSize: '13px',
              color: '#bfbfbf',
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '6px',
            }}
          >
            <span>{currentChunk.label}</span>
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

          <div style={{ ...panelStyle, marginTop: '14px' }}>
            <div style={{ fontWeight: 700, marginBottom: '6px' }}>
              {status}
            </div>

            {justMated ? (
              <div
                style={{
                  marginBottom: '8px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  background: '#3a2a1c',
                  border: '1px solid #ffb347',
                  color: '#ffd28a',
                  fontWeight: 800,
                  textAlign: 'center',
                  fontSize: '18px',
                }}
              >
                CHECKMATE
              </div>
            ) : null}

            {message ? <div style={{ color: '#d6d6d6', lineHeight: 1.5 }}>{message}</div> : null}

            <div style={{ color: '#9e9e9e', marginTop: '8px', fontSize: '12px' }}>
              {currentChunk.id}
            </div>
          </div>
        </div>

        <div
          style={{
            background: '#312e2b',
            borderRadius: '16px',
            padding: '14px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
            maxHeight: 'calc(100vh - 48px)',
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              background: '#4b4847',
              borderRadius: '12px',
              padding: '12px 14px',
              fontWeight: 700,
              fontSize: '18px',
              marginBottom: '12px',
            }}
          >
            Course order
          </div>

          <div style={{ display: 'grid', gap: '12px' }}>
            {chunkGroups.map((group) => (
              <div
                key={group.phaseId}
                style={{
                  background: '#262421',
                  borderRadius: '12px',
                  padding: '10px',
                }}
              >
                <div
                  style={{
                    fontWeight: 800,
                    marginBottom: '8px',
                    color: '#ffdf9b',
                  }}
                >
                  {group.label}
                </div>

                <div style={{ display: 'grid', gap: '6px' }}>
                  {group.chunks.map((chunk) => {
                    const index = chunks.findIndex((c) => c.id === chunk.id)
                    const active = index === progress.currentChunkIndex
                    const done = chunk.puzzles.every((p) => getPositionStats(progress, p.id).mastered)
                    const chunkNumber = extractChunkNumber(chunk.id, index + 1)

                    return (
                      <button
                        key={chunk.id}
                        onClick={() => goToChunk(index)}
                        style={{
                          textAlign: 'left',
                          padding: '10px 12px',
                          borderRadius: '10px',
                          border: active
                            ? '1px solid #ffd54a'
                            : '1px solid rgba(255,255,255,0.08)',
                          background: done
                            ? '#365526'
                            : active
                              ? '#5a512d'
                              : '#3a3734',
                          color: '#fff',
                          cursor: 'pointer',
                        }}
                      >
                        <div style={{ fontWeight: 700 }}>
                          {chunkNumber}. {chunk.label}
                        </div>
                        <div style={{ fontSize: '12px', color: '#ddd', marginTop: '4px' }}>
                          {chunk.puzzles.filter((p) => getPositionStats(progress, p.id).mastered).length}
                          {' / '}
                          {chunk.puzzles.length} mastered
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function buttonStyle(background: string, padding = '10px 16px'): CSSProperties {
  return {
    background,
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    padding,
    fontWeight: 700,
    cursor: 'pointer',
  }
}

const inputStyle: CSSProperties = {
  width: '82px',
  padding: '10px',
  borderRadius: '8px',
  border: '1px solid #555',
  background: '#222',
  color: '#fff',
}

const panelStyle: CSSProperties = {
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
}