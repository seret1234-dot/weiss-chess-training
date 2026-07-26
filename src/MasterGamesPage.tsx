import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useParams } from 'react-router-dom'
import { Chess, Move } from 'chess.js'
import ThemedChessboard from "./theme/ThemedChessboard"
import { supabase, getMasterGamePgnUrl } from './lib/supabase'
import { useRegisterPlayableBoard } from './hooks/useRegisterPlayableBoard'
import { saveTrainingProgress } from './lib/trainingProgress'
import { HintButton } from './components/trainer/ui'
import './MasterGamesPage.css'

import { reportTrainingItemCompleted } from "./lib/trainingQuotaEvents"

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

const MASTER_GAME_REVIEW_INTERVALS_DAYS = [1, 2, 3, 5, 8, 15, 30, 60, 100, 140, 170, 270, 365] as const

function isMasterGameReviewDue(
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

function getMasterGameReviewInterval(reviewCount: number) {
 const safeCount = Math.max(1, Math.floor(reviewCount))
 const index = Math.min(
 safeCount - 1,
 MASTER_GAME_REVIEW_INTERVALS_DAYS.length - 1
 )
 return MASTER_GAME_REVIEW_INTERVALS_DAYS[index]
}

async function loadGameProgress(
  gameTheme: string
): Promise<Record<string, number>> {
  const { data: authData, error: authError } =
    await supabase.auth.getUser()

  if (authError || !authData.user) {
    if (authError) {
      console.error('Failed to load current user:', authError)
    }
    return {}
  }

  const { data, error } = await supabase
    .from('training_progress')
    .select('item_id, mastery, next_review_at')
    .eq('user_id', authData.user.id)
    .eq('course', 'master_games')
    .eq('theme', gameTheme)

  if (error) {
    console.error('Failed to load Master Game progress:', error)
    return {}
  }

  const now = new Date()
 const reviewDeadline = new Date(
 now.getFullYear(),
 now.getMonth(),
 now.getDate() + 1
 ).getTime()

 const map: Record<string, number> = {}

 for (const row of data ?? []) {
 const itemId = String(row.item_id ?? '')
 if (!itemId) continue

 const savedMastery = Math.max(
 0,
 Math.min(REQUIRED_FAST_RUNS, Number(row.mastery ?? 0))
 )
 const dueTime = row.next_review_at
 ? new Date(String(row.next_review_at)).getTime()
 : Number.POSITIVE_INFINITY
 const isDue =
 Number.isFinite(dueTime) &&
 dueTime < reviewDeadline

 map[itemId] =
 isDue && savedMastery >= REQUIRED_FAST_RUNS
 ? REQUIRED_FAST_RUNS - 1
 : savedMastery
 }

 return map
}

async function saveStageProgress(
 gameTheme: string,
 stageId: string,
 mastery: number
) {
 const safeMastery = Math.max(0, Math.min(REQUIRED_FAST_RUNS, mastery))
 const { data: authData, error: authError } = await supabase.auth.getUser()
 const user = authData.user

 if (authError || !user) {
 if (authError) console.error('Master Games review user load failed:', authError)
 return
 }

 const { data: existing, error: existingError } = await supabase
 .from('training_progress')
 .select('mastery, next_review_at, review_count, interval_days')
 .eq('user_id', user.id)
 .eq('course', 'master_games')
 .eq('theme', gameTheme)
 .eq('item_id', stageId)
 .maybeSingle()

 if (existingError) {
 console.error('Master Games review progress load failed:', existingError)
 return
 }

 const existingMastery = Math.max(
 0,
 Math.min(REQUIRED_FAST_RUNS, Number(existing?.mastery ?? 0))
 )
 const storedReviewCount = Math.max(0, Number(existing?.review_count ?? 0))
 const existingReviewCount =
 existingMastery >= REQUIRED_FAST_RUNS &&
 storedReviewCount === REQUIRED_FAST_RUNS &&
 Number(existing?.interval_days ?? 0) === 30
 ? 1
 : storedReviewCount

 if (safeMastery <= 0) {
 await saveTrainingProgress({
 course: 'master_games',
 theme: gameTheme,
 itemId: stageId,
 mastery: 0,
 nextReviewAt: null,
 reviewCount: 0,
 intervalDays: 0,
 })
 return
 }

 if (safeMastery < REQUIRED_FAST_RUNS) {
 await saveTrainingProgress({
 course: 'master_games',
 theme: gameTheme,
 itemId: stageId,
 mastery: safeMastery,
 nextReviewAt: null,
 reviewCount: existingReviewCount,
 intervalDays: Number(existing?.interval_days ?? 0),
 })
 return
 }

 const isNewMastery = existingMastery < REQUIRED_FAST_RUNS
 const isCompletedDueReview =
 existingMastery >= REQUIRED_FAST_RUNS &&
 (!existing?.next_review_at ||
 isMasterGameReviewDue(String(existing.next_review_at)))

 if (!isNewMastery && !isCompletedDueReview) return

 const reviewCount = isNewMastery
 ? 1
 : Math.max(1, existingReviewCount + 1)
 const intervalDays = getMasterGameReviewInterval(reviewCount)
 const nextReviewAt = new Date()
 nextReviewAt.setDate(nextReviewAt.getDate() + intervalDays)

 await saveTrainingProgress({
 course: 'master_games',
 theme: gameTheme,
 itemId: stageId,
 mastery: REQUIRED_FAST_RUNS,
 nextReviewAt: nextReviewAt.toISOString(),
 reviewCount,
 intervalDays,
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
 const [personalLibraryUserId, setPersonalLibraryUserId] =
  useState<string | null>(null)
 const [inPersonalLibrary, setInPersonalLibrary] =
  useState(false)
 const [personalLibraryBusy, setPersonalLibraryBusy] =
  useState(false)

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
 const [masterGameHintArrow, setMasterGameHintArrow] = useState<{
 from: string
 to: string
 } | null>(null)
 const [fullLineVisible, setFullLineVisible] = useState(false)
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
  let cancelled = false

  async function loadPersonalLibraryState() {
   if (!gameRecord) {
    setInPersonalLibrary(false)
    return
   }

   const { data: authData, error: authError } =
    await supabase.auth.getUser()

   if (cancelled) return

   if (authError || !authData.user) {
    setPersonalLibraryUserId(null)
    setInPersonalLibrary(false)
    return
   }

   setPersonalLibraryUserId(authData.user.id)

   const { data, error } = await supabase
    .from('user_master_games')
    .select('game_id')
    .eq('user_id', authData.user.id)
    .eq('game_id', gameRecord.id)
    .maybeSingle()

   if (cancelled) return

   if (error) {
    console.error(
     'Failed to load My Library state:',
     error,
    )
    setInPersonalLibrary(false)
    return
   }

   setInPersonalLibrary(Boolean(data))
  }

  void loadPersonalLibraryState()

  return () => {
   cancelled = true
  }
 }, [gameRecord?.id])

 useEffect(() => {
 function setInitialBoardSize() {
 const width = window.innerWidth
 if (width <= 768) {
 setBoardSize(Math.max(0, Math.floor(width - 16)))
 return
 }
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
 if (window.innerWidth <= 768) {
 setIsDragging(false)
 return
 }

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

 const fullLineRows = useMemo(
  () => getStageMoveRows(
   parsed.moves,
   0,
   Math.max(0, parsed.moves.length - 1)
  ),
  [parsed.moves],
 )

 const stagePlyCount = Math.max(0, stage.endPly - stage.startPly + 1)
 const fastLimitMs = Math.max(1000, stagePlyCount * MS_PER_MOVE)

 const gameTheme = gameRecord ? String(gameRecord.id) : ''

 const currentExpected = parsed.moves[currentPly]
 const positionTurn = (() => {
 try {
 return new Chess(position).turn()
 } catch {
 return null
 }
 })()
 const canRequestHint = Boolean(
 currentExpected &&
 progressReady &&
 !gameMastered &&
 currentPly <= stage.endPly &&
 positionTurn === currentExpected.color,
 )
 const masterGameHintResetKey = `${gameTheme}:${stage.id}:${position}:${currentPly}:${notationHidden}:${fullLineVisible}`

 useEffect(() => {
 if (!canRequestHint) setMasterGameHintArrow(null)
 }, [canRequestHint])

 const topPlayer =
 boardOrientation === 'white'
 ? {
 name: gameRecord?.black ?? '',
 side: 'Black',
 meta: gameRecord?.site || ' - ',
 }
 : {
 name: gameRecord?.white ?? '',
 side: 'White',
 meta: gameRecord?.year || ' - ',
 }

 const bottomPlayer =
 boardOrientation === 'white'
 ? {
 name: gameRecord?.white ?? '',
 side: 'White',
 meta: gameRecord?.year || ' - ',
 }
 : {
 name: gameRecord?.black ?? '',
 side: 'Black',
 meta: gameRecord?.site || ' - ',
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
 setFullLineVisible(false)
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
 setFullLineVisible(false)
 setHasFirstSuccessInStage(true)
 setStatus('game mastered')
 setFlash('mastered')
 setGameMastered(true)
 setProgressReady(true)
 return
 }

 const firstIncompleteStageIndex = stages.findIndex(
      (candidateStage) =>
        (progressMap[candidateStage.id] ?? 0) < REQUIRED_FAST_RUNS
    )

    const resumeIndex =
      firstIncompleteStageIndex >= 0
        ? firstIncompleteStageIndex
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
 setFullLineVisible(false)
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
 setFullLineVisible(false)
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
 setFullLineVisible(false)
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
 setFullLineVisible(false)
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
 reportTrainingItemCompleted(
  "master_game",
  `${gameTheme}:${stage.id}`,
 )

 setElapsedMs(finishedMs)
 setRunStartAt(null)

 const wasFast = finishedMs <= fastLimitMs

 if (!hasFirstSuccessInStage) {
 setHasFirstSuccessInStage(true)
 setNotationHidden(true)
 setHintVisible(false)
 setFullLineVisible(false)
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

  async function togglePersonalLibrary() {
  if (
   !gameRecord ||
   !personalLibraryUserId ||
   personalLibraryBusy
  ) {
   return
  }

  setPersonalLibraryBusy(true)

  try {
   if (inPersonalLibrary) {
    const { error } = await supabase
     .from('user_master_games')
     .delete()
     .eq('user_id', personalLibraryUserId)
     .eq('game_id', gameRecord.id)

    if (error) throw error

    setInPersonalLibrary(false)
   } else {
    const { error } = await supabase
     .from('user_master_games')
     .upsert(
      {
       user_id: personalLibraryUserId,
       game_id: gameRecord.id,
       source: 'manual',
       is_favorite: true,
      },
      {
       onConflict: 'user_id,game_id',
      },
     )

    if (error) throw error

    setInPersonalLibrary(true)
   }
  } catch (error) {
   console.error(
    'Failed to update My Library:',
    error,
   )
  } finally {
   setPersonalLibraryBusy(false)
  }
 }

 if (gameLoading) {
 return (
 <div
 className="master-games-trainer-page site-mobile-dock-scroll"
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

 const totalStages = stages.length
 const stageNumber = safeStageIndex + 1
 const isFinalStage = safeStageIndex === stages.length - 1
 const stageProgressPercent = Math.min(100, (fastSuccesses / REQUIRED_FAST_RUNS) * 100)
 const showMoveList = !notationHidden || hintVisible || fullLineVisible

 const visibleMoveRows = fullLineVisible ? fullLineRows : stageRows

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
 className="master-games-trainer-page site-mobile-dock-scroll"
 style={{
 minHeight: '100vh',
 background: '#161512',
 color: '#f3f3f3',
 padding: '18px 14px 24px',
 fontFamily: 'Arial, sans-serif',
 }}
 >
 <div className="master-games-trainer-content" style={{ maxWidth: 1280, margin: '0 auto' }}>
   <div
    style={{
     display: 'flex',
     justifyContent: 'flex-end',
     marginBottom: 10,
    }}
   >
    <div
     style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: 6,
      borderRadius: 12,
      background: '#24211f',
      border: '1px solid rgba(255,255,255,0.07)',
     }}
    >
     <span
      style={{
       borderRadius: 8,
       padding: '9px 13px',
       background: '#4d7c4d',
       color: '#fff',
       fontWeight: 800,
      }}
     >
      Training
     </span>
     <button
      type="button"
      title="Play the complete master game once without repetitions or progress changes"
      onClick={() => {
       window.location.href =
        '/free-play/master-game/' +
        encodeURIComponent(gameRecord.slug || String(gameRecord.id))
      }}
      style={{
       border: 0,
       borderRadius: 8,
       padding: '9px 13px',
       background: '#2f4f73',
       color: '#fff',
       cursor: 'pointer',
       fontWeight: 800,
      }}
     >
      Free Play
     </button>
    </div>
   </div>

   {personalLibraryUserId ? (
    <div
     style={{
      display: 'flex',
      justifyContent: 'flex-end',
      marginBottom: 10,
     }}
    >
     <button
        type="button"
        onClick={() => {
         window.location.href = '/master-games#my-library'
        }}
        style={{
         border: '1px solid rgba(255,255,255,0.12)',
         borderRadius: 10,
         padding: '9px 14px',
         marginRight: 10,
         background: '#2f4f73',
         color: '#fff',
         cursor: 'pointer',
         fontWeight: 800,
        }}
       >
        Go to My Library
       </button>

       <button
      type="button"
      disabled={personalLibraryBusy}
      onClick={() => void togglePersonalLibrary()}
      style={{
       border:
        '1px solid rgba(255,255,255,0.12)',
       borderRadius: 10,
       padding: '9px 14px',
       background: inPersonalLibrary
        ? '#4d7c4d'
        : '#302e2b',
       color: '#fff',
       cursor: personalLibraryBusy
        ? 'wait'
        : 'pointer',
       fontWeight: 800,
       opacity: personalLibraryBusy ? 0.65 : 1,
      }}
     >
      {personalLibraryBusy
       ? 'Saving...'
       : inPersonalLibrary
        ? '✓ In My Library'
        : '+ Add to My Library'}
     </button>
    </div>
   ) : null}
 <div
 className="master-games-trainer-heading"
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

 <div ref={containerRef} className="master-games-trainer-workspace" style={{ display: 'flex', alignItems: 'flex-start', gap: 18 }}>
 <div className="master-games-trainer-board-column" style={{ flex: '0 0 auto' }}>
 <div
 className="master-games-trainer-board-frame"
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

 <ThemedChessboard
 className="master-games-trainer-board"
 id="master-games-board"
 position={position}
 onPieceDrop={onPieceDrop}
 onSquareClick={onSquareClick}
 boardWidth={boardSize}
 boardOrientation={boardOrientation}
 customArrows={
 masterGameHintArrow
 ? [[masterGameHintArrow.from, masterGameHintArrow.to, 'rgba(80, 180, 255, 0.9)']]
 : []
 }
 arePiecesDraggable={!gameMastered && progressReady}
 animationDuration={180}

 customDarkSquareStyle={{ backgroundColor: '#769656' }}
 customLightSquareStyle={{ backgroundColor: '#eeeed2' }}
 customSquareStyles={getCustomSquareStyles()}
 customBoardStyle={{
 borderRadius: '8px',
 overflow: 'hidden',
 }}
 promotionDialogVariant="modal"
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
 className="master-games-trainer-resize-handle"
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
 className="master-games-trainer-panel"
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
 className="master-games-trainer-replay-card"
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

 <div className="master-games-trainer-game-summary" style={{ ...panelCardStyle(), marginBottom: 12 }}>
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
 <div>{gameRecord.year || ' - '}</div>
 </div>
 </div>

 <div className="master-games-trainer-stage-progress" style={{ ...panelCardStyle(), marginBottom: 12 }}>
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

 <div className="master-games-trainer-run-progress" style={{ ...panelCardStyle(), marginBottom: 12 }}>
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
 className="master-games-trainer-timer"
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
 className="master-games-trainer-status"
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

 <div className="master-games-trainer-moves-card" style={{ ...panelCardStyle(), marginBottom: 12 }}>
 <div
 className="master-games-trainer-move-list"
 style={{
 display: 'flex',
 justifyContent: 'space-between',
 alignItems: 'center',
 gap: 8,
 marginBottom: 8,
 }}
 >
 <div style={{ fontSize: 13, fontWeight: 700 }}>
 {fullLineVisible ? 'Full line' : showMoveList ? 'Current stage moves' : 'Moves hidden'}
 </div>

 <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
 {canRequestHint ? (
 <>
 <HintButton
 getHintMove={() =>
 canRequestHint && currentExpected
 ? { from: currentExpected.from, to: currentExpected.to }
 : null
 }
 onHintStage={(move, hintStage) => {
 setMasterGameHintArrow(hintStage === 'square' ? move : null)
 }}
 onHintReset={() => setMasterGameHintArrow(null)}
 hintResetKey={masterGameHintResetKey}
 fullWidth={false}
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
 </HintButton>
 </>
 ) : null}

 <button
  onClick={() => {
   setFullLineVisible((prev) => !prev)
   setHintVisible(false)
  }}
  style={{
   background: fullLineVisible ? '#4c4744' : '#38506d',
   color: '#eaf3ff',
   border: 'none',
   borderRadius: 8,
   padding: '6px 10px',
   fontSize: 12,
   fontWeight: 700,
   cursor: 'pointer',
  }}
 >
  {fullLineVisible ? 'Stage' : 'Full line'}
 </button>
 </div>
 </div>

 {showMoveList ? (
 <div
 style={{
 maxHeight: 255,
 overflowY: 'auto',
 paddingRight: 4,
 }}
 >
 {visibleMoveRows.map((row) => (
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

 <div className="master-games-trainer-game-info" style={{ ...panelCardStyle(), marginBottom: 12 }}>
 <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
 Game info
 </div>
 <div style={{ fontSize: 12, color: '#d0d0d0', lineHeight: 1.55 }}>
 <div>Opening: {gameRecord.opening || 'Unknown opening'}</div>
 <div>Result: {gameRecord.result || ' - '}</div>
 <div>Round: {gameRecord.round || ' - '}</div>
 <div>Site: {gameRecord.site || ' - '}</div>
 <div>ECO: {gameRecord.eco || ' - '}</div>
 </div>
 </div>

 <div className="master-games-trainer-next-move" style={{ ...panelCardStyle(), marginBottom: 12 }}>
 <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
 Next expected move
 </div>
 <div style={{ fontSize: 12, color: '#d0d0d0' }}>
 {notationHidden && !hintVisible && !fullLineVisible
 ? 'Hidden during memory runs.'
 : currentExpected
 ? currentExpected.san
 : 'Run complete.'}
 </div>
 </div>

 <div className="master-games-trainer-actions" style={{ display: 'flex', gap: 10 }}>
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
