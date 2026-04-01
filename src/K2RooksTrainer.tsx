import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { BNEngine } from './lib/bnEngine'
import type { EngineResult } from './lib/bnEngine'
import { useRegisterPlayableBoard } from './hooks/useRegisterPlayableBoard'
import k2rData from '../two_rooks_mate/k2r_mates_1_to_6_chunks.json'

type RawPosition = {
  id: string
  mate_distance: number
  fen: string
  fen_key4?: string
  best_move_uci?: string
  best_move_san?: string
  black_king_square?: string
  white_king_square?: string
  white_rook_squares?: string[]
}

type RawChunk = {
  chunk_id: string
  label: string
  mate_distance: number
  positions: RawPosition[]
}

type RawFile = {
  piece_set: string
  max_mate: number
  positions_per_mate_target: number
  total_positions: number
  chunks: RawChunk[]
}

type TrainerPuzzle = {
  id: string
  fen: string
  mateDistance: number
  bestMoveUci?: string
  bestMoveSan?: string
}

type TrainerChunk = {
  id: string
  label: string
  mateDistance: number
  puzzles: TrainerPuzzle[]
}

type PuzzleProgress = {
  fastSolves: number
  totalSolves: number
  mastered: boolean
}

const PROGRESS_KEY = 'k2r_trainer_progress_v1'
const BOARD_WIDTH_KEY = 'k2r_trainer_board_width_v1'

const FAST_SOLVES_TO_MASTER = 5
const MAX_SECONDS_PER_MOVE = 3

const CORRECT_DELAY_MS = 1300
const WRONG_DELAY_MS = 1800
const ENGINE_REPLY_DELAY_MS = 650
const BOARD_ANIMATION_MS = 500

const ENGINE_DEPTH = 14

function normalizeFen(fen: string) {
  const trimmed = fen.trim()
  const parts = trimmed.split(/\s+/)
  if (parts.length === 4) return `${trimmed} 0 1`
  return trimmed
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

function buildChunks(): TrainerChunk[] {
  const file = k2rData as RawFile

  return [...file.chunks]
    .sort((a, b) => a.mate_distance - b.mate_distance)
    .map((chunk) => ({
      id: chunk.chunk_id,
      label: chunk.label,
      mateDistance: chunk.mate_distance,
      puzzles: chunk.positions.map((p) => ({
        id: p.id,
        fen: normalizeFen(p.fen),
        mateDistance: p.mate_distance,
        bestMoveUci: p.best_move_uci,
        bestMoveSan: p.best_move_san,
      })),
    }))
}

function getPuzzleProgress(map: Record<string, PuzzleProgress>, id: string): PuzzleProgress {
  return map[id] ?? { fastSolves: 0, totalSolves: 0, mastered: false }
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

function getWhiteRookSquares(game: Chess) {
  const board = game.board()
  const result: string[] = []
  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      const piece = board[rank][file]
      if (piece?.type === 'r' && piece.color === 'w') {
        result.push(`${'abcdefgh'[file]}${8 - rank}`)
      }
    }
  }
  return result
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

export default function K2RooksTrainer() {
  const chunks = useMemo(() => buildChunks(), [])
  const engineRef = useRef<BNEngine | null>(null)
  const analysisTokenRef = useRef(0)
  const moveStartedAtRef = useRef<number>(Date.now())
  const activePuzzleRef = useRef<TrainerPuzzle | null>(null)

  const [chunkIndex, setChunkIndex] = useState(0)
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
  const [message, setMessage] = useState('Loading...')
  const [status, setStatus] = useState('Loading trainer...')
  const [locked, setLocked] = useState(false)
  const [lastMove, setLastMove] = useState<{ from?: string; to?: string }>({})
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

  const currentChunk = chunks[chunkIndex] ?? null
  const currentPuzzleIndex = order[queueIndex]
  const currentPuzzle = currentChunk?.puzzles[currentPuzzleIndex] ?? null
  const currentPuzzleId = currentPuzzle?.id ?? ''
  const currentProgress = currentPuzzleId ? getPuzzleProgress(progressMap, currentPuzzleId) : null

  useEffect(() => {
    activePuzzleRef.current = currentPuzzle ?? null
  }, [currentPuzzle])

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

  function clearHighlights() {
    setMarkedSquares([])
    setHintSquares([])
    setCorrectSquares([])
  }

  function beginMoveTimer() {
    moveStartedAtRef.current = Date.now()
    setCurrentMoveElapsedMs(0)
  }

  function isMastered(id: string) {
    return getPuzzleProgress(progressMap, id).mastered
  }

  function getUnmasteredIndices(chunk: TrainerChunk) {
    return chunk.puzzles
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => !isMastered(p.id))
      .map(({ i }) => i)
  }

  async function setEngineForCurrentPosition(fen: string) {
    setEngineInfo(null)
    await analyzeCurrentFen(fen)
  }

  async function loadPuzzle(puzzle: TrainerPuzzle, nextOrder: number[], nextQueueIndex: number, chunkMate: number) {
    activePuzzleRef.current = puzzle
    clearHighlights()
    setCorrectSquares([])
    setMarkedSquares([])
    setHintSquares([])
    setOrder(nextOrder)
    setQueueIndex(nextQueueIndex)
    setGame(new Chess(puzzle.fen))
    setLocked(false)
    setLastMove({})
    setStatus(`Find mate in ${chunkMate}`)
    setMessage('')
    setAllComplete(false)
    setMoveTimesMs([])
    setFlashSolvedId(null)
    setJustSolved(false)
    beginMoveTimer()
    await setEngineForCurrentPosition(puzzle.fen)
  }

  async function loadChunk(
    nextChunkIndex: number,
    options?: {
      excludePuzzleId?: string | null
      preserveOrder?: boolean
      nextIndexInOrder?: number
    }
  ) {
    const safe = Math.max(0, Math.min(chunks.length - 1, nextChunkIndex))
    const chunk = chunks[safe]
    if (!chunk) return

    const isSameChunk = safe === chunkIndex

    setChunkIndex(safe)
    clearHighlights()
    setFlashSolvedId(null)
    setJustSolved(false)

    let nextOrder: number[] = []
    let nextQueueIndex = 0

    if (options?.preserveOrder && isSameChunk && order.length > 0) {
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
      setLocked(true)
      setLastMove({})
      setStatus(safe === chunks.length - 1 ? 'All chunks complete' : `${chunk.label} complete`)
      setMessage('')
      setAllComplete(safe === chunks.length - 1)
      activePuzzleRef.current = null
      return
    }

    const puzzle = chunk.puzzles[nextOrder[nextQueueIndex]]
    await loadPuzzle(puzzle, nextOrder, nextQueueIndex, chunk.mateDistance)
  }

  useEffect(() => {
    if (chunks.length === 0) return
    void loadChunk(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunks.length])

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

    if (!currentChunk) return

    const chunkComplete = currentChunk.puzzles.every((p) => getPuzzleProgress(nextMap, p.id).mastered)

    if (chunkComplete) {
      if (chunkIndex < chunks.length - 1) {
        await loadChunk(chunkIndex + 1)
        return
      }

      setLocked(true)
      setAllComplete(true)
      setStatus('All chunks complete')
      setMessage('')
      return
    }

    const remainingUnmastered = currentChunk.puzzles
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => !getPuzzleProgress(nextMap, p.id).mastered)
      .map(({ i }) => i)

    if (remainingUnmastered.length === 0) {
      if (chunkIndex < chunks.length - 1) {
        await loadChunk(chunkIndex + 1)
        return
      }

      setLocked(true)
      setAllComplete(true)
      setStatus('All chunks complete')
      setMessage('')
      return
    }

    const nextOrder = order.filter((i) => remainingUnmastered.includes(i))

    if (nextOrder.length > 1 && currentPuzzle) {
      const front = nextOrder.filter((i) => currentChunk.puzzles[i].id !== currentPuzzle.id)
      const back = nextOrder.filter((i) => currentChunk.puzzles[i].id === currentPuzzle.id)
      const rotated = [...front, ...back]
      const nextPuzzle = currentChunk.puzzles[rotated[0]]
      await loadPuzzle(nextPuzzle, rotated, 0, currentChunk.mateDistance)
      return
    }

    await loadChunk(chunkIndex)
  }

  async function resetPuzzle() {
    clearHighlights()
    setFlashSolvedId(null)
    setJustSolved(false)

    const puzzle = activePuzzleRef.current
    if (!puzzle || !currentChunk) return

    setGame(new Chess(puzzle.fen))
    setLocked(false)
    setLastMove({})
    setStatus(`Find mate in ${currentChunk.mateDistance}`)
    setMessage('')
    setMoveTimesMs([])
    beginMoveTimer()
    await setEngineForCurrentPosition(puzzle.fen)
  }

  async function showWrongAndReset(
    nextGame: Chess,
    move: { from?: string; to?: string; promotion?: string },
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

  async function shuffleCurrent() {
    if (!currentPuzzle) return
    await loadChunk(chunkIndex, { excludePuzzleId: currentPuzzle.id })
  }

  async function nextPuzzle() {
    if (!currentChunk || order.length === 0) return

    const nextIndex = queueIndex + 1
    if (nextIndex < order.length) {
      await loadChunk(chunkIndex, {
        preserveOrder: true,
        nextIndexInOrder: nextIndex,
      })
      return
    }

    await loadChunk(chunkIndex)
  }

  async function prevChunk() {
    await loadChunk(Math.max(0, chunkIndex - 1))
  }

  async function nextChunk() {
    await loadChunk(Math.min(chunks.length - 1, chunkIndex + 1))
  }

  async function showHint() {
    clearHighlights()

    const info = engineInfo ?? (await evaluatePosition(game.fen()))
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

  async function getBestBlackReply(afterWhiteGame: Chess) {
    const info = await evaluatePosition(afterWhiteGame.fen())
    const parsed = parseUci(info?.bestMove)
    if (!parsed) {
      return {
        info,
        replyGame: null as Chess | null,
        blackMove: null as ReturnType<Chess['move']> | null,
        afterBlackEval: null as EngineResult | null,
      }
    }

    const replyGame = new Chess(afterWhiteGame.fen())
    const blackMove = replyGame.move({
      from: parsed.from,
      to: parsed.to,
      promotion: parsed.promotion,
    })

    if (!blackMove) {
      return {
        info,
        replyGame: null,
        blackMove: null,
        afterBlackEval: null,
      }
    }

    const afterBlackEval = await evaluatePosition(replyGame.fen())

    return {
      info,
      replyGame,
      blackMove,
      afterBlackEval,
    }
  }

  function onDrop(sourceSquare: string, targetSquare: string) {
    if (locked || allComplete) return false
    if (!currentPuzzle || !currentChunk) return false

    const startPuzzle = activePuzzleRef.current
    if (!startPuzzle) return false

    const nextGame = new Chess(game.fen())
    const whiteMove = nextGame.move({
      from: sourceSquare,
      to: targetSquare,
      promotion: 'q',
    })

    if (!whiteMove) return false

    const attemptedUci = moveToUci({
      from: whiteMove.from,
      to: whiteMove.to,
      promotion: whiteMove.promotion,
    })

    const elapsed = Date.now() - moveStartedAtRef.current
    setMoveTimesMs((prev) => [...prev, elapsed])
    setGame(nextGame)
    setLastMove({ from: whiteMove.from, to: whiteMove.to })
    clearHighlights()
    setLocked(true)
    setJustSolved(false)

    void (async () => {
      const beforeMate = engineInfo?.mate ?? startPuzzle.mateDistance

      if (nextGame.isCheckmate()) {
        await finishSuccess('CHECKMATE!', elapsed)
        return
      }

      const { info, replyGame, blackMove, afterBlackEval } = await getBestBlackReply(nextGame)
      const bestWhiteMoveUci = engineInfo?.bestMove ?? startPuzzle.bestMoveUci ?? ''

      let accepted = false

      if (bestWhiteMoveUci && attemptedUci === bestWhiteMoveUci) {
        accepted = true
      } else if (replyGame && afterBlackEval && typeof afterBlackEval.mate === 'number' && beforeMate) {
        accepted = Math.abs(afterBlackEval.mate) < Math.abs(beforeMate)
      }

      if (!accepted) {
        setEngineInfo(info)
        await showWrongAndReset(
          nextGame,
          { from: whiteMove.from, to: whiteMove.to, promotion: whiteMove.promotion },
          'Wrong move.',
          startPuzzle.bestMoveSan
            ? `Try ${startPuzzle.bestMoveSan} or another move that reduces the mate.`
            : 'That does not reduce the mate.'
        )
        return
      }

      if (!replyGame || !blackMove) {
        setEngineInfo(info)
        await showWrongAndReset(
          nextGame,
          { from: whiteMove.from, to: whiteMove.to, promotion: whiteMove.promotion },
          'Wrong move.',
          'Engine reply failed for this move.'
        )
        return
      }

      setEngineInfo(info)
      setStatus('Good move.')
      setMessage(`Black is replying: ${info?.bestMove ?? ''}`)
      await sleep(ENGINE_REPLY_DELAY_MS)

      setEngineInfo(afterBlackEval)
      setGame(replyGame)
      setLastMove({ from: blackMove.from, to: blackMove.to })
      clearHighlights()

      if (replyGame.isCheckmate()) {
        await finishSuccess('CHECKMATE!', elapsed)
        return
      }

      setLocked(false)
      setStatus(`Continue — mate in ${afterBlackEval?.mate ?? '?'}`)
      setMessage('Black replied. Continue the mate.')
      beginMoveTimer()
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

  const poolIds = currentChunk?.puzzles.map((p) => p.id) ?? []
  const solvedInCurrent = poolIds.filter((id) => isMastered(id)).length
  const currentPoolTotal = poolIds.length
  const chunkFastSolveCount = poolIds.reduce((sum, id) => sum + getPuzzleProgress(progressMap, id).fastSolves, 0)
  const chunkTarget = currentPoolTotal * FAST_SOLVES_TO_MASTER
  const progressPercent = chunkTarget > 0 ? (chunkFastSolveCount / chunkTarget) * 100 : 0

  const rookSquares = getWhiteRookSquares(game)
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
            K + 2 Rooks Trainer
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
                id="K2RooksTrainerBoard"
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
            <button onClick={() => void prevChunk()} style={primaryButton('#666')}>
              Prev Chunk
            </button>
            <button onClick={() => void nextChunk()} style={primaryButton('#666')}>
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
            <span>{currentChunk?.label ?? 'K + 2 Rooks'}</span>
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
            {status || `Find mate in ${currentChunk?.mateDistance ?? '?'}`}
          </div>

          <div style={panelCardStyle}>
            <div><strong>Section:</strong> {currentChunk?.label ?? '-'}</div>
            <div><strong>Mode:</strong> Mate-distance trainer</div>
            <div><strong>Puzzle solves:</strong> {currentProgress?.fastSolves ?? 0} / 5</div>
            <div><strong>Total solves:</strong> {currentProgress?.totalSolves ?? 0}</div>
            <div><strong>Start mate:</strong> {currentPuzzle?.mateDistance ?? '-'}</div>
            <div><strong>Engine:</strong> {engineReady ? 'ready' : 'loading'}</div>
            <div>
              <strong>Eval:</strong>{' '}
              {engineInfo?.mate !== null && engineInfo?.mate !== undefined
                ? `Mate ${engineInfo.mate}`
                : engineInfo?.eval !== null && engineInfo?.eval !== undefined
                  ? `${engineInfo.eval > 0 ? '+' : ''}${engineInfo.eval}`
                  : '-'}
            </div>
            <div><strong>Best:</strong> {engineInfo?.bestMove ?? currentPuzzle?.bestMoveUci ?? '-'}</div>
            <div><strong>Mate distance:</strong> {getEngineMateDistanceText(engineInfo)}</div>
            <div><strong>WK:</strong> {wkSquare || '-'} | <strong>BK:</strong> {bkSquare || '-'}</div>
            <div><strong>Rooks:</strong> {rookSquares.join(', ') || '-'}</div>
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
            <span>{currentChunk?.label ?? 'K + 2 Rooks'}</span>
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
            <div style={{ fontWeight: 700, marginBottom: '6px' }}>
              {currentChunk ? `Find mate in ${currentChunk.mateDistance}` : 'Find the best move'}
            </div>
            {message ? <div style={{ color: '#d6d6d6', lineHeight: 1.5 }}>{message}</div> : null}
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