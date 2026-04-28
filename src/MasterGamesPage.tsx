import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useParams } from 'react-router-dom'
import { Chess, Move } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { supabase, getMasterGamePgnUrl } from './lib/supabase'
import { useRegisterPlayableBoard } from './hooks/useRegisterPlayableBoard'
import { loadTrainingProgressMap, saveTrainingProgress } from './lib/trainingProgress'

type MasterGame = {
  id: number
  slug?: string
  title?: string
  white: string
  black: string
  event?: string
  site?: string
  year?: number
  round?: string
  result?: string
  opening?: string
  eco?: string
  pgn?: string
  pgn_storage_key?: string
  description?: string
}

type ParsedMove = Move & {
  san: string
}

type Stage = {
  id: string
  startFullMove: number
  endFullMove: number
  startPly: number
  endPly: number
  startFen: string
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

const MS_PER_MOVE = 3000
const REQUIRED_FAST_RUNS = 5
const GROW_UNTIL = 15
const SLIDE_FROM = 10
const SLIDE_WINDOW = 16
const SLIDE_STEP = 10
const MESSAGE_DELAY_MS = 3000

const PIECE_URLS: Record<PieceCode, string> = {
  wP: 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wp.png',
  wN: 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wn.png',
  wB: 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wb.png',
  wR: 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wr.png',
  wQ: 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wq.png',
  wK: 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wk.png',
  bP: 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/bp.png',
  bN: 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/bn.png',
  bB: 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/bb.png',
  bR: 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/br.png',
  bQ: 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/bq.png',
  bK: 'https://images.chesscomfiles.com/chess-themes/pieces/neo/150/bk.png',
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

function errorMessage(err: unknown) {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  try {
    return JSON.stringify(err)
  } catch {
    return 'Unknown error'
  }
}

function parseGame(game: MasterGame) {
  const pgn = (game.pgn || '').trim()

  if (!pgn) {
    return {
      moves: [] as ParsedMove[],
      positionsBeforeEachPly: [new Chess().fen()],
      totalPlies: 0,
      totalFullMoves: 0,
      hasValidPgn: false,
    }
  }

  const base = new Chess()

  try {
    base.loadPgn(pgn)
  } catch {
    return {
      moves: [] as ParsedMove[],
      positionsBeforeEachPly: [new Chess().fen()],
      totalPlies: 0,
      totalFullMoves: 0,
      hasValidPgn: false,
    }
  }

  const replay = new Chess()
  const history = base.history({ verbose: true }) as ParsedMove[]

  const positionsBeforeEachPly: string[] = [replay.fen()]
  for (const mv of history) {
    replay.move(mv)
    positionsBeforeEachPly.push(replay.fen())
  }

  const totalPlies = history.length
  const totalFullMoves = Math.ceil(totalPlies / 2)

  return {
    moves: history,
    positionsBeforeEachPly,
    totalPlies,
    totalFullMoves,
    hasValidPgn: true,
  }
}

function buildStages(totalFullMoves: number, positionsBeforeEachPly: string[]): Stage[] {
  if (totalFullMoves <= 0) {
    return [
      {
        id: 'empty',
        startFullMove: 1,
        endFullMove: 1,
        startPly: 0,
        endPly: -1,
        startFen: positionsBeforeEachPly[0] ?? new Chess().fen(),
      },
    ]
  }

  const stages: Stage[] = []

  const growingEnd = Math.min(GROW_UNTIL, totalFullMoves)

  for (let end = 1; end <= growingEnd; end += 1) {
    const startFullMove = 1
    const endFullMove = end
    const startPly = 0
    const endPly = Math.min(endFullMove * 2, totalFullMoves * 2) - 1

    stages.push({
      id: `${startFullMove}-${endFullMove}`,
      startFullMove,
      endFullMove,
      startPly,
      endPly,
      startFen: positionsBeforeEachPly[startPly],
    })
  }

  if (totalFullMoves > GROW_UNTIL) {
    let start = SLIDE_FROM

    while (true) {
      const end = Math.min(start + SLIDE_WINDOW - 1, totalFullMoves)
      const startPly = (start - 1) * 2
      const endPly = Math.min(end * 2, totalFullMoves * 2) - 1

      stages.push({
        id: `${start}-${end}`,
        startFullMove: start,
        endFullMove: end,
        startPly,
        endPly,
        startFen: positionsBeforeEachPly[startPly],
      })

      if (end >= totalFullMoves) break
      start += SLIDE_STEP
    }
  }

  stages.push({
    id: `1-${totalFullMoves}-full`,
    startFullMove: 1,
    endFullMove: totalFullMoves,
    startPly: 0,
    endPly: totalFullMoves * 2 - 1,
    startFen: positionsBeforeEachPly[0],
  })

  return stages
}

function formatSeconds(ms: number) {
  return (ms / 1000).toFixed(2)
}

function getStageMoveRows(
  allMoves: ParsedMove[],
  startPly: number,
  endPly: number,
): Array<{ moveNumber: number; white?: string; black?: string }> {
  const rows: Array<{ moveNumber: number; white?: string; black?: string }> = []

  if (endPly < startPly) return rows

  for (let ply = startPly; ply <= endPly; ply += 2) {
    const whiteMove = allMoves[ply]
    const blackMove = ply + 1 <= endPly ? allMoves[ply + 1] : undefined
    const moveNumber = Math.floor(ply / 2) + 1

    rows.push({
      moveNumber,
      white: whiteMove?.san,
      black: blackMove?.san,
    })
  }

  return rows
}

function panelCardStyle(): CSSProperties {
  return {
    background: '#2a2523',
    borderRadius: 10,
    padding: 12,
    border: '1px solid rgba(255,255,255,0.05)',
  }
}

function playerBarStyle(): CSSProperties {
  return {
    background: '#1f1d1c',
    borderRadius: 12,
    padding: '10px 14px',
    border: '1px solid rgba(255,255,255,0.06)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  }
}

function calculateNextReview(mastery: number) {
  const now = new Date()

  const intervals = [1, 3, 7, 14, 30]
  const index = Math.min(Math.max(mastery - 1, 0), intervals.length - 1)
  const days = mastery <= 0 ? 0 : intervals[index]

  const next = new Date(now)
  next.setDate(now.getDate() + days)

  return {
    review_count: mastery,
    last_reviewed_at: now.toISOString(),
    next_review_at: mastery > 0 ? next.toISOString() : null,
    interval_days: days,
  }
}

async function loadGameProgress(gameTheme: string) {
  return loadTrainingProgressMap('master_games', gameTheme)
}

async function saveStageProgress(gameTheme: string, stageId: string, mastery: number) {
  const sr = calculateNextReview(mastery)

  await saveTrainingProgress({
    course: 'master_games',
    theme: gameTheme,
    itemId: stageId,
    mastery: Math.max(0, Math.min(REQUIRED_FAST_RUNS, mastery)),
    nextReviewAt: sr.next_review_at,
    reviewCount: sr.review_count,
    intervalDays: sr.interval_days,
  })
}

async function fetchGameByRouteParam(rawGameId: string): Promise<MasterGame> {
  const decoded = decodeURIComponent(rawGameId).trim()
  const isNumeric = /^\d+$/.test(decoded)

  const selectFields = `
    id,
    slug,
    title,
    white,
    black,
    event,
    site,
    year,
    round,
    result,
    opening,
    eco,
    description,
    pgn_storage_key
  `

  let row: any = null

  if (isNumeric) {
    const numericId = Number(decoded)

    const { data, error } = await supabase
      .from('master_games')
      .select(selectFields)
      .eq('id', numericId)
      .limit(1)
      .maybeSingle()

    if (error) {
      throw new Error(`master_games id query failed: ${error.message}`)
    }

    row = data
  }

  if (!row) {
    const { data, error } = await supabase
      .from('master_games')
      .select(selectFields)
      .eq('slug', decoded)
      .limit(1)
      .maybeSingle()

    if (error) {
      throw new Error(`master_games slug query failed: ${error.message}`)
    }

    row = data
  }

  if (!row) {
    throw new Error(`No game found for route param: ${decoded}`)
  }

  const loadedGame: MasterGame = { ...row }

  if (!loadedGame.pgn_storage_key) {
    throw new Error(`No pgn_storage_key for game ${loadedGame.id}`)
  }

  const pgnUrl = getMasterGamePgnUrl(loadedGame.pgn_storage_key)
  const response = await fetch(pgnUrl)

  if (!response.ok) {
    throw new Error(
      `PGN fetch failed: ${response.status} ${response.statusText} | key=${loadedGame.pgn_storage_key}`,
    )
  }

  loadedGame.pgn = await response.text()

  if (!loadedGame.pgn.trim()) {
    throw new Error(`PGN file is empty | key=${loadedGame.pgn_storage_key}`)
  }

  return loadedGame
}

export default function MasterGamesPage() {
  const { gameId } = useParams()

  const [gameRecord, setGameRecord] = useState<MasterGame | null>(null)
  const [gameLoading, setGameLoading] = useState(true)
  const [gameError, setGameError] = useState('')

  const containerRef = useRef<HTMLDivElement | null>(null)
  const resetTimeoutRef = useRef<number | null>(null)
  const nextStageTimeoutRef = useRef<number | null>(null)

  const [boardSize, setBoardSize] = useState(720)
  const [isDragging, setIsDragging] = useState(false)
  const [isHandleHovered, setIsHandleHovered] = useState(false)
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null)

  const customPieces = {
    wP: ({ squareWidth }: { squareWidth: number }) => renderPieceImage('wP', squareWidth),
    wN: ({ squareWidth }: { squareWidth: number }) => renderPieceImage('wN', squareWidth),
    wB: ({ squareWidth }: { squareWidth: number }) => renderPieceImage('wB', squareWidth),
    wR: ({ squareWidth }: { squareWidth: number }) => renderPieceImage('wR', squareWidth),
    wQ: ({ squareWidth }: { squareWidth: number }) => renderPieceImage('wQ', squareWidth),
    wK: ({ squareWidth }: { squareWidth: number }) => renderPieceImage('wK', squareWidth),
    bP: ({ squareWidth }: { squareWidth: number }) => renderPieceImage('bP', squareWidth),
    bN: ({ squareWidth }: { squareWidth: number }) => renderPieceImage('bN', squareWidth),
    bB: ({ squareWidth }: { squareWidth: number }) => renderPieceImage('bB', squareWidth),
    bR: ({ squareWidth }: { squareWidth: number }) => renderPieceImage('bR', squareWidth),
    bQ: ({ squareWidth }: { squareWidth: number }) => renderPieceImage('bQ', squareWidth),
    bK: ({ squareWidth }: { squareWidth: number }) => renderPieceImage('bK', squareWidth),
  }

  const parsed = useMemo(() => {
    if (!gameRecord) {
      return {
        moves: [] as ParsedMove[],
        positionsBeforeEachPly: [new Chess().fen()],
        totalPlies: 0,
        totalFullMoves: 0,
        hasValidPgn: false,
      }
    }
    return parseGame(gameRecord)
  }, [gameRecord])

  const stages = useMemo(
    () => buildStages(parsed.totalFullMoves, parsed.positionsBeforeEachPly),
    [parsed.totalFullMoves, parsed.positionsBeforeEachPly],
  )

  const [stageIndex, setStageIndex] = useState(0)
  const [position, setPosition] = useState(stages[0]?.startFen ?? new Chess().fen())
  const [currentPly, setCurrentPly] = useState(stages[0]?.startPly ?? 0)
  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>('white')
  const [runStartAt, setRunStartAt] = useState<number | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [fastSuccesses, setFastSuccesses] = useState(0)
  const [notationHidden, setNotationHidden] = useState(false)
  const [hintVisible, setHintVisible] = useState(false)
  const [hasFirstSuccessInStage, setHasFirstSuccessInStage] = useState(false)
  const [status, setStatus] = useState('Play the game moves exactly.')
  const [flash, setFlash] = useState<'idle' | 'good' | 'bad' | 'slow' | 'mastered'>('idle')
  const [gameMastered, setGameMastered] = useState(false)
  const [stageProgressMap, setStageProgressMap] = useState<Record<string, number>>({})
  const [progressReady, setProgressReady] = useState(false)

  function getLegalTargets(fromSquare: string) {
    if (!parsed.hasValidPgn) return []
    if (!progressReady) return []
    if (gameMastered) return []
    if (currentPly > stage.endPly) return []

    const working = new Chess(position)
    const moves = working.moves({ verbose: true }) as Array<{ from: string; to: string }>

    return moves
      .filter((m) => m.from === fromSquare)
      .map((m) => m.to)
  }

  function getCustomSquareStyles() {
    const styles: Record<string, CSSProperties> = {}

    if (selectedSquare) {
      styles[selectedSquare] = {
        ...(styles[selectedSquare] ?? {}),
        boxShadow: 'inset 0 0 0 4px rgba(255, 213, 74, 0.85)',
        backgroundColor: 'rgba(255, 213, 74, 0.22)',
      }
    }

    for (const square of getLegalTargets(selectedSquare ?? '')) {
      styles[square] = {
        ...(styles[square] ?? {}),
        backgroundImage:
          "radial-gradient(circle, rgba(20,20,20,0.32) 0%, rgba(20,20,20,0.32) 22%, transparent 24%)",
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        backgroundSize: '38% 38%',
      }
    }

    return styles
  }

  function onSquareClick(square: string) {
    if (!parsed.hasValidPgn) return
    if (!progressReady) return
    if (gameMastered) return
    if (currentPly > stage.endPly) return

    const working = new Chess(position)
    const clickedPiece = working.get(square as any)
    const turnCode = working.turn() === 'w' ? 'w' : 'b'

    if (selectedSquare === square) {
      setSelectedSquare(null)
      return
    }

    if (clickedPiece) {
      const clickedPieceCode = `${clickedPiece.color}${clickedPiece.type}`.toLowerCase()
      if (clickedPieceCode.startsWith(turnCode) && getLegalTargets(square).length > 0) {
        setSelectedSquare(square)
        return
      }
    }

    if (selectedSquare) {
      const sourcePiece = working.get(selectedSquare as any)
      const didMove = onPieceDrop(
        selectedSquare,
        square,
        sourcePiece ? `${sourcePiece.color}${sourcePiece.type}` : '',
      )
      if (didMove) {
        setSelectedSquare(null)
        return
      }
    }

    setSelectedSquare(null)
  }

  useEffect(() => {
    let cancelled = false

    async function loadGame() {
      setGameLoading(true)
      setGameError('')
      setGameRecord(null)

      if (!gameId?.trim()) {
        if (!cancelled) {
          setGameError('Missing route param: gameId')
          setGameLoading(false)
        }
        return
      }

      try {
        const loadedGame = await fetchGameByRouteParam(gameId)
        if (cancelled) return
        setGameRecord(loadedGame)
      } catch (error) {
        console.error('Failed to load master game:', error)
        if (!cancelled) {
          setGameError(errorMessage(error))
        }
      } finally {
        if (!cancelled) {
          setGameLoading(false)
        }
      }
    }

    void loadGame()

    return () => {
      cancelled = true
    }
  }, [gameId])

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

  const safeStageIndex = Math.min(stageIndex, Math.max(0, stages.length - 1))
  const stage = stages[safeStageIndex]
  const stageRows = useMemo(
    () => getStageMoveRows(parsed.moves, stage.startPly, stage.endPly),
    [parsed.moves, stage.startPly, stage.endPly],
  )

  const stagePlyCount = Math.max(0, stage.endPly - stage.startPly + 1)
  const fastLimitMs = Math.max(1000, stagePlyCount * MS_PER_MOVE)

  const gameTheme = gameRecord ? String(gameRecord.id) : ''

  const topPlayer =
    boardOrientation === 'white'
      ? {
          name: gameRecord?.black ?? '',
          side: 'Black',
          meta: gameRecord?.site || '—',
        }
      : {
          name: gameRecord?.white ?? '',
          side: 'White',
          meta: gameRecord?.year || '—',
        }

  const bottomPlayer =
    boardOrientation === 'white'
      ? {
          name: gameRecord?.white ?? '',
          side: 'White',
          meta: gameRecord?.year || '—',
        }
      : {
          name: gameRecord?.black ?? '',
          side: 'Black',
          meta: gameRecord?.site || '—',
        }

  useEffect(() => {
    return () => {
      if (resetTimeoutRef.current) window.clearTimeout(resetTimeoutRef.current)
      if (nextStageTimeoutRef.current) window.clearTimeout(nextStageTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    if (runStartAt == null) return

    const id = window.setInterval(() => {
      setElapsedMs(Date.now() - runStartAt)
    }, 50)

    return () => window.clearInterval(id)
  }, [runStartAt])

  useEffect(() => {
    let cancelled = false

    async function bootProgress() {
      const firstStage = stages[0]

      setStageIndex(0)
      setPosition(firstStage?.startFen ?? new Chess().fen())
      setCurrentPly(firstStage?.startPly ?? 0)
      setRunStartAt(null)
      setElapsedMs(0)
      setFastSuccesses(0)
      setNotationHidden(false)
      setHintVisible(false)
      setSelectedSquare(null)
      setHasFirstSuccessInStage(false)
      setStatus(parsed.hasValidPgn ? 'Play the game moves exactly.' : 'PGN missing for this game.')
      setFlash('idle')
      setGameMastered(false)
      setStageProgressMap({})
      setProgressReady(false)

      if (!gameTheme || !parsed.hasValidPgn || stages.length === 0) {
        if (!cancelled) setProgressReady(true)
        return
      }

      const progressMap = await loadGameProgress(gameTheme)
      if (cancelled) return

      setStageProgressMap(progressMap)

      const allMastered = stages.every((s) => (progressMap[s.id] ?? 0) >= REQUIRED_FAST_RUNS)

      if (allMastered) {
        const finalIndex = Math.max(0, stages.length - 1)
        const finalStage = stages[finalIndex]

        setStageIndex(finalIndex)
        setPosition(finalStage.startFen)
        setCurrentPly(finalStage.startPly)
        setRunStartAt(null)
        setElapsedMs(0)
        setFastSuccesses(REQUIRED_FAST_RUNS)
        setNotationHidden(true)
        setHintVisible(false)
        setHasFirstSuccessInStage(true)
        setStatus('game mastered')
        setFlash('mastered')
        setGameMastered(true)
        setProgressReady(true)
        return
      }

      const startedStageIndexes = stages
        .map((s, index) => ({
          index,
          mastery: progressMap[s.id] ?? 0,
        }))
        .filter((x) => x.mastery > 0)

      const resumeIndex =
        startedStageIndexes.length > 0
          ? startedStageIndexes[startedStageIndexes.length - 1].index
          : 0

      const resumeStage = stages[resumeIndex]
      const savedMastery = Math.max(
        0,
        Math.min(REQUIRED_FAST_RUNS, progressMap[resumeStage.id] ?? 0),
      )

      setStageIndex(resumeIndex)
      setPosition(resumeStage.startFen)
      setCurrentPly(resumeStage.startPly)
      setRunStartAt(null)
      setElapsedMs(0)
      setFastSuccesses(savedMastery)
      setNotationHidden(savedMastery > 0)
      setHintVisible(false)
      setHasFirstSuccessInStage(savedMastery > 0)
      setStatus(parsed.hasValidPgn ? 'Play the game moves exactly.' : 'PGN missing for this game.')
      setFlash('idle')
      setGameMastered(false)
      setProgressReady(true)
    }

    void bootProgress()

    return () => {
      cancelled = true
    }
  }, [gameTheme, stages, parsed.hasValidPgn])

  function clearTimers() {
    if (resetTimeoutRef.current) {
      window.clearTimeout(resetTimeoutRef.current)
      resetTimeoutRef.current = null
    }
    if (nextStageTimeoutRef.current) {
      window.clearTimeout(nextStageTimeoutRef.current)
      nextStageTimeoutRef.current = null
    }
  }

  function beginStageRun() {
    clearTimers()
    setPosition(stage.startFen)
    setCurrentPly(stage.startPly)
    setRunStartAt(null)
    setElapsedMs(0)
    setHintVisible(false)
    setSelectedSquare(null)
    setStatus(parsed.hasValidPgn ? 'Play the game moves exactly.' : 'PGN missing for this game.')
    setFlash('idle')
  }

  function resetWholeStageProgress() {
    clearTimers()

    const nextMap = {
      ...stageProgressMap,
      [stage.id]: 0,
    }

    setStageProgressMap(nextMap)
    setFastSuccesses(0)
    setNotationHidden(false)
    setHintVisible(false)
    setHasFirstSuccessInStage(false)
    setGameMastered(false)
    void saveStageProgress(gameTheme, stage.id, 0)
    beginStageRun()
  }

  function moveToNextStage() {
    clearTimers()

    const isLastStage = safeStageIndex >= stages.length - 1
    if (isLastStage) {
      setGameMastered(true)
      setFlash('mastered')
      setStatus('game mastered')
      return
    }

    const nextIndex = safeStageIndex + 1
    const nextStage = stages[nextIndex]
    const savedMastery = Math.max(
      0,
      Math.min(REQUIRED_FAST_RUNS, stageProgressMap[nextStage.id] ?? 0),
    )

    setStageIndex(nextIndex)
    setFastSuccesses(savedMastery)
    setNotationHidden(savedMastery > 0)
    setHintVisible(false)
    setHasFirstSuccessInStage(savedMastery > 0)
    setSelectedSquare(null)
    setPosition(nextStage.startFen)
    setCurrentPly(nextStage.startPly)
    setRunStartAt(null)
    setElapsedMs(0)
    setFlash('idle')
    setStatus('Play the game moves exactly.')
  }

  function restartRunAfterDelay(
    message: string,
    nextFlash: 'good' | 'bad' | 'slow',
    delay = MESSAGE_DELAY_MS,
  ) {
    clearTimers()
    setStatus(message)
    setFlash(nextFlash)

    resetTimeoutRef.current = window.setTimeout(() => {
      beginStageRun()
    }, delay)
  }

  function completeRun() {
    const finishedMs = runStartAt == null ? elapsedMs : Date.now() - runStartAt

    setElapsedMs(finishedMs)
    setRunStartAt(null)

    const wasFast = finishedMs <= fastLimitMs

    if (!hasFirstSuccessInStage) {
      setHasFirstSuccessInStage(true)
      setNotationHidden(true)
      setHintVisible(false)
    }

    if (wasFast) {
      const nextFastSuccesses = Math.min(REQUIRED_FAST_RUNS, fastSuccesses + 1)

      setFastSuccesses(nextFastSuccesses)

      const nextProgressMap = {
        ...stageProgressMap,
        [stage.id]: nextFastSuccesses,
      }

      setStageProgressMap(nextProgressMap)
      void saveStageProgress(gameTheme, stage.id, nextFastSuccesses)

      if (nextFastSuccesses >= REQUIRED_FAST_RUNS) {
        setStatus(
          safeStageIndex === stages.length - 1
            ? 'Final stage cleared.'
            : `Stage ${stage.startFullMove}-${stage.endFullMove} cleared.`,
        )
        setFlash('good')

        nextStageTimeoutRef.current = window.setTimeout(() => {
          moveToNextStage()
        }, MESSAGE_DELAY_MS)
      } else {
        restartRunAfterDelay(
          `Fast success ${nextFastSuccesses}/${REQUIRED_FAST_RUNS}. Play again from memory.`,
          'good',
        )
      }
    } else {
      restartRunAfterDelay(
        `Correct but too slow (${formatSeconds(finishedMs)}s). Need under ${formatSeconds(
          fastLimitMs,
        )}s.`,
        'slow',
      )
    }
  }

  function onPieceDrop(sourceSquare: string, targetSquare: string, piece: string) {
    if (!parsed.hasValidPgn) return false
    if (!progressReady) return false
    if (gameMastered) return false
    if (currentPly > stage.endPly) return false

    const expected = parsed.moves[currentPly]
    if (!expected) return false

    const promotion =
      piece?.toLowerCase() === 'wp' && targetSquare.endsWith('8')
        ? 'q'
        : piece?.toLowerCase() === 'bp' && targetSquare.endsWith('1')
          ? 'q'
          : undefined

    const working = new Chess(position)
    const attempted = working.move({
      from: sourceSquare,
      to: targetSquare,
      promotion,
    })

    if (!attempted) return false

    const correct =
      attempted.from === expected.from &&
      attempted.to === expected.to &&
      (attempted.promotion ?? undefined) === (expected.promotion ?? undefined)

    if (!correct) {
      setSelectedSquare(null)
      restartRunAfterDelay(`Wrong move. Expected ${expected.san}. Start again.`, 'bad')
      return false
    }

    const nextFen = working.fen()

    if (runStartAt == null) {
      setRunStartAt(Date.now())
      setElapsedMs(0)
    }

    setSelectedSquare(null)
    setPosition(nextFen)

    const nextPly = currentPly + 1
    setCurrentPly(nextPly)

    if (nextPly > stage.endPly) {
      window.setTimeout(() => {
        completeRun()
      }, 120)
    } else {
      setStatus('Correct. Keep going.')
      setFlash('idle')
    }

    return true
  }

  useEffect(() => {
    if (!progressReady) return
    if (gameMastered) return
    beginStageRun()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safeStageIndex, progressReady, gameMastered])

  useRegisterPlayableBoard({
    fen: position,
    orientation: boardOrientation,
    setOrientation: setBoardOrientation,
    suggestedColor: boardOrientation,
    canFlip: true,
  })

  if (gameLoading) {
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
        Loading game...
      </div>
    )
  }

  if (gameError || !gameRecord) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#161512',
          color: '#f3f3f3',
          padding: 40,
          fontFamily: 'Arial, sans-serif',
          whiteSpace: 'pre-wrap',
        }}
      >
        <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>Failed to load game</div>
        <div style={{ color: '#ffb4b4' }}>{gameError || 'Game not found'}</div>
        <div style={{ marginTop: 14, color: '#c9c9c9', fontSize: 13 }}>
          route param: {gameId || '(missing)'}
        </div>
      </div>
    )
  }

  if (!parsed.hasValidPgn) {
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
        <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>
          {gameRecord.title || `${gameRecord.white} vs ${gameRecord.black}`}
        </div>
        <div style={{ fontSize: 16, color: '#d0d0d0', marginBottom: 8 }}>
          This route is working, but this game does not yet have a valid PGN file in storage.
        </div>
        <div style={{ fontSize: 14, color: '#b8b8b8' }}>
          Add a PGN file and connect its path in <code>pgn_storage_key</code>.
        </div>
      </div>
    )
  }

  const currentExpected = parsed.moves[currentPly]
  const totalStages = stages.length
  const stageNumber = safeStageIndex + 1
  const isFinalStage = safeStageIndex === stages.length - 1
  const stageProgressPercent = Math.min(100, (fastSuccesses / REQUIRED_FAST_RUNS) * 100)
  const showMoveList = !notationHidden || hintVisible

  const statusBg =
    flash === 'bad'
      ? 'rgba(190, 60, 60, 0.16)'
      : flash === 'good'
        ? 'rgba(100, 170, 90, 0.18)'
        : flash === 'slow'
          ? 'rgba(210, 160, 70, 0.16)'
          : flash === 'mastered'
            ? 'rgba(90, 160, 210, 0.16)'
            : '#23201f'

  const statusColor =
    flash === 'bad'
      ? '#ffb4b4'
      : flash === 'good'
        ? '#cce8b3'
        : flash === 'slow'
          ? '#f3d28e'
          : flash === 'mastered'
            ? '#b9e0ff'
            : '#d7d7d7'

  const handleActive = isDragging || isHandleHovered

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#161512',
        color: '#f3f3f3',
        padding: '18px 14px 24px',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div
          style={{
            marginBottom: 12,
            display: 'inline-block',
            padding: '10px 16px',
            borderRadius: 14,
            background: '#3a3431',
            fontSize: 24,
            fontWeight: 800,
          }}
        >
          Master Games
        </div>

        <div ref={containerRef} style={{ display: 'flex', alignItems: 'flex-start', gap: 18 }}>
          <div style={{ flex: '0 0 auto' }}>
            <div
              style={{
                width: boardSize + 16,
                background: '#201d1b',
                borderRadius: 16,
                padding: 8,
                border: '1px solid rgba(255,255,255,0.06)',
                boxSizing: 'border-box',
              }}
            >
              <div style={playerBarStyle()}>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 19,
                      fontWeight: 800,
                      color: '#f3f3f3',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {topPlayer.name}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: '#b8b8b8',
                      marginTop: 2,
                    }}
                  >
                    {topPlayer.side}
                  </div>
                </div>

                <div
                  style={{
                    flexShrink: 0,
                    fontSize: 12,
                    color: '#c9c9c9',
                    textAlign: 'right',
                  }}
                >
                  {topPlayer.meta}
                </div>
              </div>

              <div style={{ height: 8 }} />

              <Chessboard
                id="master-games-board"
                position={position}
                onPieceDrop={onPieceDrop}
                onSquareClick={onSquareClick}
                boardWidth={boardSize}
                boardOrientation={boardOrientation}
                arePiecesDraggable={!gameMastered && progressReady}
                animationDuration={180}
                customPieces={customPieces}
                customDarkSquareStyle={{ backgroundColor: '#769656' }}
                customLightSquareStyle={{ backgroundColor: '#eeeed2' }}
                customSquareStyles={getCustomSquareStyles()}
                customBoardStyle={{
                  borderRadius: '8px',
                  overflow: 'hidden',
                }}
              />

              <div style={{ height: 8 }} />

              <div style={playerBarStyle()}>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 19,
                      fontWeight: 800,
                      color: '#f3f3f3',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {bottomPlayer.name}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: '#b8b8b8',
                      marginTop: 2,
                    }}
                  >
                    {bottomPlayer.side}
                  </div>
                </div>

                <div
                  style={{
                    flexShrink: 0,
                    fontSize: 12,
                    color: '#c9c9c9',
                    textAlign: 'right',
                  }}
                >
                  {bottomPlayer.meta}
                </div>
              </div>
            </div>
          </div>

          <div
            onMouseDown={() => setIsDragging(true)}
            onMouseEnter={() => setIsHandleHovered(true)}
            onMouseLeave={() => setIsHandleHovered(false)}
            style={{
              width: 18,
              alignSelf: 'stretch',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'ew-resize',
              userSelect: 'none',
            }}
          >
            <div
              style={{
                width: 8,
                height: 72,
                borderRadius: 999,
                background: handleActive ? '#88a94f' : '#4a4542',
                boxShadow: handleActive ? '0 0 0 2px rgba(136,169,79,0.16)' : 'none',
                transition: 'all 0.15s ease',
              }}
            />
          </div>

          <div
            style={{
              width: 320,
              background: '#1b1816',
              borderRadius: 16,
              padding: 12,
              border: '1px solid rgba(255,255,255,0.06)',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                ...panelCardStyle(),
                marginBottom: 12,
                padding: '14px 12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 18,
                    height: 18,
                    border: '2px solid #bdbdbd',
                    boxSizing: 'border-box',
                  }}
                />
                <div style={{ fontSize: 16, fontWeight: 700 }}>
                  Full Game Replay
                </div>
              </div>
            </div>

            <div style={{ ...panelCardStyle(), marginBottom: 12 }}>
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
                  {gameRecord.white} vs {gameRecord.black}
                </div>
                <div style={{ color: '#d3d3d3' }}>
                  {stageNumber}/{totalStages}
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
                <div>{gameRecord.event || 'Unknown event'}</div>
                <div>{gameRecord.year || '—'}</div>
              </div>
            </div>

            <div style={{ ...panelCardStyle(), marginBottom: 12 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 13,
                  marginBottom: 6,
                }}
              >
                <div style={{ color: '#dcdcdc', fontWeight: 700 }}>Stage</div>
                <div style={{ color: '#f1f1f1', fontWeight: 700 }}>
                  {stage.startFullMove}-{stage.endFullMove}
                </div>
              </div>

              <div
                style={{
                  height: 10,
                  background: '#3a3431',
                  borderRadius: 999,
                  overflow: 'hidden',
                  marginBottom: 8,
                }}
              >
                <div
                  style={{
                    width: `${stageProgressPercent}%`,
                    height: '100%',
                    background: '#7fa650',
                    transition: 'width 0.2s ease',
                  }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 12,
                  color: '#c5c5c5',
                }}
              >
                <div>{Math.round(stageProgressPercent)}% stage mastery</div>
                <div>
                  {fastSuccesses}/{REQUIRED_FAST_RUNS} fast runs
                </div>
              </div>
            </div>

            <div style={{ ...panelCardStyle(), marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                This stage
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(5, 1fr)',
                  gap: 6,
                  marginBottom: 8,
                }}
              >
                {Array.from({ length: REQUIRED_FAST_RUNS }).map((_, i) => {
                  const filled = i < fastSuccesses
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
                <div>{fastSuccesses} / 5 fast runs</div>
                <div>Fast = 3s per move</div>
              </div>
            </div>

            <div
              style={{
                marginBottom: 12,
                textAlign: 'center',
                padding: '4px 0 2px',
              }}
            >
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 800,
                  color: '#f2c14e',
                  marginBottom: 6,
                }}
              >
                ⏱ {formatSeconds(elapsedMs)}
              </div>

              <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 2 }}>
                {isFinalStage
                  ? 'Play the full game'
                  : `Play moves ${stage.startFullMove}-${stage.endFullMove}`}
              </div>

              <div style={{ fontSize: 12, color: '#bcbcbc' }}>
                Limit: {formatSeconds(fastLimitMs)}s
              </div>
            </div>

            <div
              style={{
                ...panelCardStyle(),
                marginBottom: 12,
                background: statusBg,
                color: statusColor,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Status</div>
              <div style={{ fontSize: 13, lineHeight: 1.45 }}>{status}</div>
            </div>

            <div style={{ ...panelCardStyle(), marginBottom: 12 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 8,
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 700 }}>
                  {showMoveList ? 'Current stage moves' : 'Moves hidden'}
                </div>

                {notationHidden && !hintVisible ? (
                  <button
                    onClick={() => setHintVisible(true)}
                    style={{
                      background: '#6d5a2c',
                      color: '#fff4cf',
                      border: 'none',
                      borderRadius: 8,
                      padding: '6px 10px',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Hint
                  </button>
                ) : null}
              </div>

              {showMoveList ? (
                <div
                  style={{
                    maxHeight: 255,
                    overflowY: 'auto',
                    paddingRight: 4,
                  }}
                >
                  {stageRows.map((row) => (
                    <div
                      key={row.moveNumber}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '40px 1fr 1fr',
                        gap: 8,
                        fontSize: 13,
                        padding: '5px 0',
                        borderBottom: '1px solid rgba(255,255,255,0.04)',
                      }}
                    >
                      <div style={{ color: '#a8a8a8' }}>{row.moveNumber}.</div>
                      <div style={{ color: '#f0f0f0', fontWeight: 700 }}>{row.white ?? ''}</div>
                      <div style={{ color: '#f0f0f0', fontWeight: 700 }}>{row.black ?? ''}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    fontSize: 13,
                    color: '#c8c8c8',
                    lineHeight: 1.5,
                  }}
                >
                  First success completed. Use Hint if you need to reveal this stage again.
                </div>
              )}
            </div>

            <div style={{ ...panelCardStyle(), marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                Game info
              </div>
              <div style={{ fontSize: 12, color: '#d0d0d0', lineHeight: 1.55 }}>
                <div>Opening: {gameRecord.opening || 'Unknown opening'}</div>
                <div>Result: {gameRecord.result || '—'}</div>
                <div>Round: {gameRecord.round || '—'}</div>
                <div>Site: {gameRecord.site || '—'}</div>
                <div>ECO: {gameRecord.eco || '—'}</div>
              </div>
            </div>

            <div style={{ ...panelCardStyle(), marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                Next expected move
              </div>
              <div style={{ fontSize: 12, color: '#d0d0d0' }}>
                {notationHidden && !hintVisible
                  ? 'Hidden during memory runs.'
                  : currentExpected
                    ? currentExpected.san
                    : 'Run complete.'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={beginStageRun}
                style={{
                  flex: 1,
                  background: '#4c4744',
                  color: '#f3f3f3',
                  border: 'none',
                  borderRadius: 10,
                  padding: '13px 12px',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Restart Run
              </button>

              <button
                onClick={resetWholeStageProgress}
                style={{
                  flex: 1,
                  background: '#88a94f',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  padding: '13px 12px',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Reset Stage
              </button>
            </div>

            <div
              style={{
                marginTop: 10,
                fontSize: 11,
                color: '#b0b0b0',
                textAlign: 'left',
              }}
            >
              {gameRecord.id}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}