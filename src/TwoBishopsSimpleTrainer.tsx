import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import phase1Data from '../two_bishop_mate/two_bishops_phase1_chunks.json'
import phase2Data from '../two_bishop_mate/two_bishops_phase2.json'
import phase3Data from '../two_bishop_mate/two_bishops_phase3.json'
import { BNEngine } from './lib/bnEngine'
import type { EngineResult } from './lib/bnEngine'

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

const SOLVES_TO_MASTER = 5
const ENGINE_DEPTH_PHASE2 = 12
const ENGINE_DEPTH_PHASE3 = 14
const ENGINE_REPLY_DELAY_MS = 450

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
      label: chunk.label,
      mateDistance,
      puzzles: Array.from(dedup.values()),
      isFullLines: false,
    }
  })

  const builtFullChunk: Phase1TrainerChunk[] =
    fullLinesChunk?.lines?.length
      ? [
          {
            id: fullLinesChunk.chunk_id,
            label: fullLinesChunk.label,
            mateDistance: null,
            isFullLines: true,
            puzzles: [...fullLinesChunk.lines]
              .sort((a, b) => a.line_number - b.line_number)
              .map((line) => {
                const steps = buildStepsFromFullLine(line)
                return {
                  id: `${fullLinesChunk.chunk_id}::${line.line_id}`,
                  lineId: line.line_id,
                  lineNumber: line.line_number,
                  fen: normalizeFen(line.start_fen),
                  startFen: normalizeFen(line.start_fen),
                  mateDistance: steps.length,
                  steps,
                  source: 'full' as const,
                  isLongLine: LONG_LINE_IDS.has(line.line_id),
                }
              }),
          },
        ]
      : []

  return [...builtMateChunks, ...builtFullChunk]
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

function getCustomSquareStyles(
  lastMove?: { from?: string; to?: string },
  markedSquares: string[] = [],
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

  return styles
}

export default function TwoBishopsSimpleTrainer() {
  const phase1Chunks = useMemo(() => buildPhase1TrainerChunks(), [])
  const phase2 = useMemo(() => buildFreeplaySet(phase2Data as FreeplayFile), [])
  const phase3 = useMemo(() => buildFreeplaySet(phase3Data as FreeplayFile), [])

  const engineRef = useRef<BNEngine | null>(null)
  const analysisTokenRef = useRef(0)

  const [mode, setMode] = useState<Mode>({ kind: 'phase1', chunkIndex: 0 })
  const [mastery, setMastery] = useState<Record<string, number>>({})
  const [order, setOrder] = useState<number[]>([])
  const [queueIndex, setQueueIndex] = useState(0)
  const [game, setGame] = useState<Chess>(() => new Chess())
  const [stepIndex, setStepIndex] = useState(0)
  const [message, setMessage] = useState('Loading...')
  const [locked, setLocked] = useState(false)
  const [lastMove, setLastMove] = useState<{ from?: string; to?: string }>({})
  const [activeSteps, setActiveSteps] = useState<WhiteStep[]>([])
  const [allComplete, setAllComplete] = useState(false)
  const [engineReady, setEngineReady] = useState(false)
  const [engineInfo, setEngineInfo] = useState<EngineResult | null>(null)
  const [markedSquares, setMarkedSquares] = useState<string[]>([])
  const [hintSquares, setHintSquares] = useState<string[]>([])
  const [boardWidth, setBoardWidth] = useState(520)

  const isPhase1 = mode.kind === 'phase1'
  const currentChunk = isPhase1 ? phase1Chunks[mode.chunkIndex] : null
  const currentPuzzleIndex = order[queueIndex]
  const currentPuzzle = currentChunk?.puzzles[currentPuzzleIndex] ?? null
  const currentFreeplaySet = mode.kind === 'phase2' ? phase2 : mode.kind === 'phase3' ? phase3 : null
  const currentFreeplayFen = currentFreeplaySet?.positions[currentPuzzleIndex] ?? ''
  const currentFreeplayId =
    currentFreeplaySet && currentFreeplayFen ? `${currentFreeplaySet.id}::${currentFreeplayFen}` : ''

  useEffect(() => {
    engineRef.current = new BNEngine()
    setEngineReady(true)
    return () => {
      engineRef.current?.destroy()
    }
  }, [])

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

  function getSolveCount(id: string) {
    return mastery[id] ?? 0
  }

  function isMastered(id: string) {
    return getSolveCount(id) >= SOLVES_TO_MASTER
  }

  function getPhase1ChunkLabel(chunk: Phase1TrainerChunk | null) {
    if (!chunk) return ''
    return chunk.isFullLines ? 'Full lines' : chunk.label
  }

  function getCurrentModeLabel() {
    if (mode.kind === 'phase1') {
      if (!currentChunk) return ''
      return currentChunk.isFullLines ? 'Full lines' : `Mate in ${currentChunk.mateDistance}`
    }
    if (mode.kind === 'phase2') return 'Phase 2'
    return 'Phase 3'
  }

  function getCurrentPrompt() {
    if (mode.kind === 'phase1') {
      if (!currentChunk || !currentPuzzle) return 'Find the correct move'
      if (currentChunk.isFullLines) return `Play full line (${currentPuzzle.mateDistance} white moves)`
      return `Find mate in ${currentChunk.mateDistance}`
    }
    if (mode.kind === 'phase2') return 'Drive the king to the 8th rank'
    return 'Mate the king'
  }

  function getCurrentPoolSize() {
    if (mode.kind === 'phase1') return currentChunk?.puzzles.length ?? 0
    return currentFreeplaySet?.positions.length ?? 0
  }

  function getCurrentPuzzleIdByIndex(index: number) {
    if (mode.kind === 'phase1') {
      return currentChunk?.puzzles[index]?.id ?? ''
    }
    if (mode.kind === 'phase2') return `${phase2.id}::${phase2.positions[index]}`
    return `${phase3.id}::${phase3.positions[index]}`
  }

  function buildQueue(options?: {
    excludePuzzleId?: string | null
    nextMastery?: Record<string, number>
  }) {
    const masteryMap = options?.nextMastery ?? mastery
    const excludePuzzleId = options?.excludePuzzleId ?? null
    const size = getCurrentPoolSize()
    let base: number[] = []

    for (let i = 0; i < size; i += 1) {
      const id = getCurrentPuzzleIdByIndex(i)
      if ((masteryMap[id] ?? 0) < SOLVES_TO_MASTER) {
        base.push(i)
      }
    }

    if (excludePuzzleId && base.length > 1) {
      const filtered = base.filter((i) => getCurrentPuzzleIdByIndex(i) !== excludePuzzleId)
      if (filtered.length > 0) base = filtered
    }

    return shuffleArray(base)
  }

  async function setEngineForCurrentPosition(fen: string) {
    setEngineInfo(null)
    await analyzeCurrentFen(fen)
  }

  async function loadPhase1Chunk(chunkIndex: number, options?: { excludePuzzleId?: string | null }) {
    const safe = Math.max(0, Math.min(phase1Chunks.length - 1, chunkIndex))
    const chunk = phase1Chunks[safe]
    if (!chunk) return

    setMode({ kind: 'phase1', chunkIndex: safe })
    setMarkedSquares([])
    setHintSquares([])

    const ids = chunk.puzzles.map((p) => p.id)
    let base = ids
      .map((id, i) => ({ id, i }))
      .filter(({ id }) => (mastery[id] ?? 0) < SOLVES_TO_MASTER)
      .map(({ i }) => i)

    if (options?.excludePuzzleId && base.length > 1) {
      const filtered = base.filter((i) => chunk.puzzles[i].id !== options.excludePuzzleId)
      if (filtered.length > 0) base = filtered
    }

    const nextOrder = shuffleArray(base)
    if (nextOrder.length === 0) {
      setOrder([])
      setQueueIndex(0)
      setGame(new Chess())
      setStepIndex(0)
      setActiveSteps([])
      setLocked(true)
      setLastMove({})
      setMessage(safe === phase1Chunks.length - 1 ? 'Phase 1 complete' : `${getPhase1ChunkLabel(chunk)} complete`)
      return
    }

    const puzzle = chunk.puzzles[nextOrder[0]]
    setOrder(nextOrder)
    setQueueIndex(0)
    setGame(new Chess(puzzle.fen))
    setStepIndex(0)
    setActiveSteps(puzzle.steps)
    setLocked(false)
    setLastMove({})
    setMessage(chunk.isFullLines ? `Play full line (${puzzle.mateDistance} white moves)` : `Find mate in ${chunk.mateDistance}`)
    setAllComplete(false)
    await setEngineForCurrentPosition(puzzle.fen)
  }

  async function loadFreeplay(kind: 'phase2' | 'phase3', options?: { excludePuzzleId?: string | null }) {
    const setData = kind === 'phase2' ? phase2 : phase3
    setMode({ kind })
    setMarkedSquares([])
    setHintSquares([])

    let base = setData.positions
      .map((fen, i) => ({ id: `${setData.id}::${fen}`, i }))
      .filter(({ id }) => (mastery[id] ?? 0) < SOLVES_TO_MASTER)
      .map(({ i }) => i)

    if (options?.excludePuzzleId && base.length > 1) {
      const filtered = base.filter((i) => `${setData.id}::${setData.positions[i]}` !== options.excludePuzzleId)
      if (filtered.length > 0) base = filtered
    }

    const nextOrder = shuffleArray(base)
    if (nextOrder.length === 0) {
      setOrder([])
      setQueueIndex(0)
      setGame(new Chess())
      setStepIndex(0)
      setActiveSteps([])
      setLocked(true)
      setLastMove({})
      setMessage(kind === 'phase2' ? 'Phase 2 complete' : 'All chunks complete')
      setAllComplete(kind === 'phase3')
      return
    }

    const fen = setData.positions[nextOrder[0]]
    const startGame = new Chess(fen)

    setOrder(nextOrder)
    setQueueIndex(0)
    setGame(startGame)
    setStepIndex(0)
    setActiveSteps([])
    setLocked(false)
    setLastMove({})
    setMessage(kind === 'phase2' ? 'Drive the king to the 8th rank' : 'Mate the king')
    setAllComplete(false)
    await setEngineForCurrentPosition(fen)
  }

  useEffect(() => {
    if (phase1Chunks.length === 0) return
    void loadPhase1Chunk(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase1Chunks.length])

  async function resetPuzzle() {
    setMarkedSquares([])
    setHintSquares([])

    if (mode.kind === 'phase1') {
      if (!currentChunk || !currentPuzzle) return
      setGame(new Chess(currentPuzzle.fen))
      setStepIndex(0)
      setActiveSteps(currentPuzzle.steps)
      setLocked(false)
      setLastMove({})
      setMessage(getCurrentPrompt())
      await setEngineForCurrentPosition(currentPuzzle.fen)
      return
    }

    if (!currentFreeplayFen) return
    const fresh = new Chess(currentFreeplayFen)
    setGame(fresh)
    setStepIndex(0)
    setActiveSteps([])
    setLocked(false)
    setLastMove({})
    setMessage(getCurrentPrompt())
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
    await shuffleCurrent()
  }

  async function prevModeOrChunk() {
    if (mode.kind === 'phase3') {
      await loadFreeplay('phase2')
      return
    }
    if (mode.kind === 'phase2') {
      await loadPhase1Chunk(phase1Chunks.length - 1)
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

  async function finishSuccess() {
    let currentId = ''
    if (mode.kind === 'phase1') {
      if (!currentPuzzle) return
      currentId = currentPuzzle.id
    } else {
      if (!currentFreeplaySet || currentPuzzleIndex == null) return
      currentId = `${currentFreeplaySet.id}::${currentFreeplaySet.positions[currentPuzzleIndex]}`
    }

    const nextCount = Math.min(SOLVES_TO_MASTER, getSolveCount(currentId) + 1)
    const nextMastery = { ...mastery, [currentId]: nextCount }
    setMastery(nextMastery)

    if (mode.kind === 'phase1') {
      if (!currentChunk) return

      const chunkComplete = currentChunk.puzzles.every((p) => (nextMastery[p.id] ?? 0) >= SOLVES_TO_MASTER)

      if (chunkComplete) {
        if (mode.chunkIndex < phase1Chunks.length - 1) {
          setLocked(true)
          setMessage(`${getPhase1ChunkLabel(currentChunk)} complete — moving on`)
          await sleep(700)
          await loadPhase1Chunk(mode.chunkIndex + 1)
          return
        }

        setLocked(true)
        setMessage('Phase 1 complete — moving to Phase 2')
        await sleep(700)
        await loadFreeplay('phase2')
        return
      }

      await sleep(600)
      await loadPhase1Chunk(mode.chunkIndex, { excludePuzzleId: currentPuzzle?.id ?? null })
      return
    }

    const setData = currentFreeplaySet
    if (!setData) return

    const allIds = setData.positions.map((fen) => `${setData.id}::${fen}`)
    const complete = allIds.every((id) => (nextMastery[id] ?? 0) >= SOLVES_TO_MASTER)

    if (complete) {
      if (mode.kind === 'phase2') {
        setLocked(true)
        setMessage('Phase 2 complete — moving to Phase 3')
        await sleep(700)
        await loadFreeplay('phase3')
        return
      }

      setLocked(true)
      setAllComplete(true)
      setMessage('All chunks complete')
      return
    }

    await sleep(600)
    await loadFreeplay(mode.kind, { excludePuzzleId: currentId })
  }

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

    if (typeof engineEval.mate === 'number') {
      return engineEval.mate >= 0
    }

    if (typeof engineEval.eval === 'number') {
      return engineEval.eval > -300
    }

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

  async function showHint() {
    setMarkedSquares([])

    if (mode.kind === 'phase1') {
      const step = activeSteps[stepIndex]
      const move = parseUci(step?.whiteUci)
      if (!move) return
      setMarkedSquares([move.from])
      setHintSquares([move.to])
      setMessage(`Hint: ${move.from} → ${move.to}`)
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
      setMessage('No hint available')
      return
    }

    setMarkedSquares([parsed.from])
    setHintSquares([parsed.to])
    setMessage(`Hint: ${parsed.from} → ${parsed.to}`)
  }

  async function playEngineBlackMove(afterWhiteGame: Chess) {
    const depth = mode.kind === 'phase3' ? ENGINE_DEPTH_PHASE3 : ENGINE_DEPTH_PHASE2
    const info = await evaluatePosition(afterWhiteGame.fen(), depth)
    setEngineInfo(info)

    const parsed = parseUci(info?.bestMove)
    if (!parsed) {
      setLocked(false)
      setMessage('Engine could not find a black move')
      return
    }

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
      setMessage('Engine move failed')
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
    setMarkedSquares([])
    setHintSquares([])

    if (result === 'success') {
      setLocked(true)
      setMessage(mode.kind === 'phase2' ? 'Success — king reached 8th rank!' : 'Checkmate!')
      await finishSuccess()
      return
    }

    if (result === 'fail') {
      setLocked(true)
      setMarkedSquares([getBlackKingSquare(replyGame), ...getLegalBlackKingMoves(replyGame)].filter(Boolean))
      setMessage(mode.kind === 'phase2' ? 'Failed — draw or stalemate' : 'Failed — king escaped the net')
      return
    }

    setLocked(false)
    setMessage(mode.kind === 'phase2' ? 'Continue — drive king to rank 8' : 'Continue — mate the king')
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
        setMessage(`Wrong — expected ${step.whiteSan}`)
        return false
      }

      if (stepsToUse !== activeSteps) {
        setActiveSteps(stepsToUse)
      }

      setGame(nextGame)
      setLastMove({ from: moveObj.from, to: moveObj.to })
      setMarkedSquares([])
      setHintSquares([])
      setLocked(true)

      const acceptedStep = stepsToUse[stepIndex]
      const isFinalWhiteMove = stepIndex === stepsToUse.length - 1

      if (isFinalWhiteMove) {
        setMessage(nextGame.isCheckmate() ? 'Correct — checkmate!' : 'Correct!')
        void finishSuccess()
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
              setGame(replyGame)
              setLastMove({ from: blackMove.from, to: blackMove.to })
              setStepIndex(nextWhiteIndex)
              setLocked(false)
              setMessage(
                currentChunk.isFullLines
                  ? `Continue full line — move ${nextWhiteIndex + 1} of ${stepsToUse.length}`
                  : `Continue — play ${stepsToUse[nextWhiteIndex].whiteSan}`
              )
              await setEngineForCurrentPosition(replyGame.fen())
              return
            }
          }
        }

        if (acceptedStep?.nextFen) {
          const nextWhiteIndex = stepIndex + 1
          setGame(new Chess(acceptedStep.nextFen))
          setLastMove({})
          setStepIndex(nextWhiteIndex)
          setLocked(false)
          setMessage(
            currentChunk.isFullLines
              ? `Continue full line — move ${nextWhiteIndex + 1} of ${stepsToUse.length}`
              : `Continue — play ${stepsToUse[nextWhiteIndex].whiteSan}`
          )
          await setEngineForCurrentPosition(acceptedStep.nextFen)
          return
        }

        setLocked(false)
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

    setGame(nextGame)
    setLastMove({ from: whiteMove.from, to: whiteMove.to })
    setMarkedSquares([])
    setHintSquares([])
    setLocked(true)

    void (async () => {
      const afterWhiteEval = await evaluatePosition(
        nextGame.fen(),
        mode.kind === 'phase3' ? ENGINE_DEPTH_PHASE3 : ENGINE_DEPTH_PHASE2
      )
      setEngineInfo(afterWhiteEval)

      const whiteResult = getFreeplayResult(nextGame, currentFreeplaySet!, afterWhiteEval)

      if (whiteResult === 'success') {
        setMessage(mode.kind === 'phase2' ? 'Success — king reached 8th rank!' : 'Checkmate!')
        await finishSuccess()
        return
      }

      if (whiteResult === 'fail') {
        setMarkedSquares([getBlackKingSquare(nextGame), ...getLegalBlackKingMoves(nextGame)].filter(Boolean))
        setMessage(mode.kind === 'phase2' ? 'Failed — draw or stalemate' : 'Failed — king escaped the net')
        return
      }

      await playEngineBlackMove(nextGame)
    })()

    return true
  }

  const currentPuzzleId =
    mode.kind === 'phase1'
      ? currentPuzzle?.id ?? ''
      : currentFreeplayId

  const poolIds =
    mode.kind === 'phase1'
      ? currentChunk?.puzzles.map((p) => p.id) ?? []
      : currentFreeplaySet?.positions.map((fen) => `${currentFreeplaySet.id}::${fen}`) ?? []

  const solvedInCurrent = poolIds.filter((id) => isMastered(id)).length
  const currentPoolTotal = poolIds.length
  const currentSolveCount = currentPuzzleId ? getSolveCount(currentPuzzleId) : 0

  const bishopSquares = getWhiteBishopSquares(game)
  const wkSquare = getWhiteKingSquare(game)
  const bkSquare = getBlackKingSquare(game)

  return (
    <div style={{ padding: 20, maxWidth: 980 }}>
      <h2 style={{ marginTop: 0 }}>Two Bishops Trainer</h2>

      <div style={infoCardStyle}>
        <div style={infoRowStyle}>
          <strong>Section:</strong>{' '}
          {mode.kind === 'phase1'
            ? getPhase1ChunkLabel(currentChunk)
            : mode.kind === 'phase2'
              ? phase2.label
              : phase3.label}
        </div>

        <div style={infoRowStyle}>
          <strong>Mode:</strong> {getCurrentModeLabel()}
        </div>

        <div style={infoRowStyle}>
          <strong>Puzzle solves:</strong> {currentSolveCount} / {SOLVES_TO_MASTER}
        </div>

        <div style={infoRowStyle}>
          <strong>Progress:</strong> {solvedInCurrent} / {currentPoolTotal} mastered
        </div>

        {mode.kind === 'phase1' ? (
          <>
            <div style={infoRowStyle}>
              <strong>Step in line:</strong> move {stepIndex + 1} of {activeSteps.length}
            </div>
            <div style={infoRowStyle}>
              <strong>Line:</strong> {currentPuzzle?.lineId}
            </div>
          </>
        ) : (
          <div style={infoRowStyle}>
            <strong>Freeplay:</strong> real engine
          </div>
        )}

        <div style={infoRowStyle}>
          <strong>Engine:</strong> {engineReady ? 'ready' : 'loading'}
        </div>

        <div style={infoRowStyle}>
          <strong>Eval:</strong>{' '}
          {engineInfo?.mate !== null && engineInfo?.mate !== undefined
            ? `mate ${engineInfo.mate}`
            : engineInfo?.eval !== null && engineInfo?.eval !== undefined
              ? engineInfo.eval
              : '-'}
        </div>

        <div style={infoRowStyle}>
          <strong>Best:</strong> {engineInfo?.bestMove ?? '-'}
        </div>

        <div style={infoRowStyle}>
          <strong>WK:</strong> {wkSquare || '-'} | <strong>BK:</strong> {bkSquare || '-'} | <strong>Bishops:</strong> {bishopSquares.join(', ') || '-'}
        </div>

        {shouldAllowWaitingMoveOverride() ? (
          <div style={infoRowStyle}>
            <strong>Waiting move rule:</strong> first move may be any bishop move to a1, b2, c3, d4, e5, or h8
          </div>
        ) : null}
      </div>

      <div style={{ marginTop: 16, marginBottom: 16, fontSize: 22, fontWeight: 700 }}>
        {getCurrentPrompt()}
      </div>

      <Chessboard
        id="TwoBishopsTrainerBoard"
        position={game.fen()}
        onPieceDrop={onDrop}
        boardWidth={boardWidth}
        arePiecesDraggable={!locked && !allComplete}
        customSquareStyles={getCustomSquareStyles(lastMove, markedSquares, hintSquares)}
      />

      <div style={messageStyle}>{message}</div>

      <div style={buttonBarStyle}>
        <button onClick={() => void resetPuzzle()} style={buttonStyle}>
          Reset puzzle
        </button>
        <button onClick={() => void shuffleCurrent()} style={buttonStyle}>
          Shuffle chunk
        </button>
        <button onClick={() => void nextPuzzle()} style={buttonStyle}>
          Next puzzle
        </button>
        <button onClick={() => void prevModeOrChunk()} style={buttonStyle}>
          Prev chunk
        </button>
        <button onClick={() => void nextModeOrChunk()} style={buttonStyle}>
          Next chunk
        </button>
        <button onClick={() => void showHint()} style={buttonStyle}>
          Hint
        </button>
      </div>

      <div style={{ marginTop: 16, maxWidth: 520 }}>
        <div style={{ fontSize: 13, marginBottom: 6 }}>Board size: {boardWidth}px</div>
        <input
          type="range"
          min={420}
          max={760}
          step={10}
          value={boardWidth}
          onChange={(e) => setBoardWidth(Number(e.target.value))}
          style={{ width: '100%' }}
        />
      </div>

      <div style={{ marginTop: 20 }}>
        {phase1Chunks.map((chunk, i) => {
          const masteredCount = chunk.puzzles.filter((p) => isMastered(p.id)).length
          return (
            <button
              key={chunk.id}
              onClick={() => void loadPhase1Chunk(i)}
              style={{
                ...chunkButtonStyle,
                background: mode.kind === 'phase1' && mode.chunkIndex === i ? '#6a6238' : '#444',
              }}
            >
              {chunk.isFullLines ? 'Full lines' : `M${chunk.mateDistance}`} ({masteredCount}/{chunk.puzzles.length})
            </button>
          )
        })}

        <button
          onClick={() => void loadFreeplay('phase2')}
          style={{
            ...chunkButtonStyle,
            background: mode.kind === 'phase2' ? '#6a6238' : '#444',
          }}
        >
          Phase 2 ({phase2.positions.filter((fen) => isMastered(`${phase2.id}::${fen}`)).length}/{phase2.positions.length})
        </button>

        <button
          onClick={() => void loadFreeplay('phase3')}
          style={{
            ...chunkButtonStyle,
            background: mode.kind === 'phase3' ? '#6a6238' : '#444',
          }}
        >
          Phase 3 ({phase3.positions.filter((fen) => isMastered(`${phase3.id}::${fen}`)).length}/{phase3.positions.length})
        </button>
      </div>
    </div>
  )
}

const infoCardStyle: CSSProperties = {
  padding: 12,
  borderRadius: 10,
  background: '#262626',
  color: '#fff',
  display: 'grid',
  gap: 6,
  maxWidth: 720,
}

const infoRowStyle: CSSProperties = {
  fontSize: 15,
}

const messageStyle: CSSProperties = {
  marginTop: 18,
  minHeight: 28,
  fontSize: 16,
  fontWeight: 600,
}

const buttonBarStyle: CSSProperties = {
  display: 'flex',
  gap: 10,
  marginTop: 16,
  flexWrap: 'wrap',
}

const buttonStyle: CSSProperties = {
  padding: '10px 16px',
  borderRadius: 8,
  border: 'none',
  background: '#444',
  color: '#fff',
  cursor: 'pointer',
}

const chunkButtonStyle: CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: 'none',
  color: '#fff',
  cursor: 'pointer',
  marginRight: 8,
  marginBottom: 8,
}