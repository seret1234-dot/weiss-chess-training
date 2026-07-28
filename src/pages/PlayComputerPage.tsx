import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Chess } from 'chess.js'
import type { Square } from 'chess.js'
import ThemedChessboard from "../theme/ThemedChessboard"
import './PlayComputerPage.css'
import { stockfishService } from '../lib/chess/stockfishService'
import { supabase } from '../lib/supabase'
import { useGlobalBoard } from '../hooks/useGlobalBoard'
import { useHintAction } from '../context/HintActionContext'
import {
 buildWeeklyPlanSignals,
 chooseNewestWeeklyTestState,
 loadWeeklyTestFromCloud,
 saveWeeklyTestToCloud,
} from '../training/weeklyAdaptiveTest'
import {
 createTransferOpportunity,
 findImmediateTransferOpportunity,
 findTargetedComputerCandidates,
 findTransferSteeringCandidates,
 getRecentTransferTargets,
 loadRecentTransferTargets,
 studentMoveMatchesTransferTarget,
 type TargetedComputerCandidate,
 type TransferOpportunity,
 type TransferTarget,
} from '../training/targetedSparring'
import {
 completeEndgameTransferSession,
 gradeEndgameTransfer,
 loadEndgameTransferSession,
 markEndgameTransferStarted,
 saveEndgameTransferProgress,
 type EndgameTransferSession,
} from '../training/endgameTransfer'

type Side = 'white' | 'black'
type Mode = 'play' | 'analyze'

const PLAY_COMPUTER_MOBILE_BREAKPOINT = 768
const PLAY_COMPUTER_DEFAULT_BOARD_SIZE = 820
const PLAY_COMPUTER_MAX_BOARD_SIZE = 920

function getInitialPlayComputerBoardSize() {
 if (typeof window === 'undefined' || window.innerWidth > PLAY_COMPUTER_MOBILE_BREAKPOINT) {
  return PLAY_COMPUTER_DEFAULT_BOARD_SIZE
 }

 return Math.min(PLAY_COMPUTER_MAX_BOARD_SIZE, Math.max(0, window.innerWidth - 16))
}

type WeeklyGameRecord = {
 color: Side
 started: boolean
 completed: boolean
 pgn: string
 fen: string
 result: string
 updatedAt: string
 autoReviewOpenedAt?: string
 transferTarget?: TransferTarget
 transferOpportunities?: TransferOpportunity[]
}

type WeeklyTestState = {
 userId?: string
 weekKey: string
 engineElo: number
 currentGame: 0 | 1 | 2
 games: [WeeklyGameRecord, WeeklyGameRecord]
 completedAt?: string
 updatedAt?: string
 planSignals?: ReturnType<typeof buildWeeklyPlanSignals>
 transferTargets?: TransferTarget[]
}

const WEEKLY_TEST_STORAGE_KEY = 'weiss-weekly-adaptive-test-v1'

function getCurrentWeekKey(date = new Date()) {
 const local = new Date(date.getFullYear(), date.getMonth(), date.getDate())
 const day = local.getDay()
 const daysFromMonday = day === 0 ? 6 : day - 1
 local.setDate(local.getDate() - daysFromMonday)

 const year = local.getFullYear()
 const month = String(local.getMonth() + 1).padStart(2, '0')
 const dayOfMonth = String(local.getDate()).padStart(2, '0')
 return `${year}-${month}-${dayOfMonth}`
}

function emptyWeeklyGame(color: Side, transferTarget?: TransferTarget): WeeklyGameRecord {
 return {
 color,
 started: false,
 completed: false,
 pgn: '',
 fen: new Chess().fen(),
 result: '*',
 updatedAt: new Date().toISOString(),
 transferTarget,
 transferOpportunities: [],
 }
}

function createWeeklyTestState(weekKey: string, engineElo: number): WeeklyTestState {
 const transferTargets = getRecentTransferTargets(2)
 return {
 weekKey,
 engineElo,
 currentGame: 0,
 games: [
  emptyWeeklyGame('white', transferTargets[0]),
  emptyWeeklyGame('black', transferTargets[1] ?? transferTargets[0]),
 ],
 transferTargets,
 updatedAt: new Date().toISOString(),
 }
}

function loadWeeklyTestState(weekKey: string, engineElo: number): WeeklyTestState {
 try {
 const raw = window.localStorage.getItem(WEEKLY_TEST_STORAGE_KEY)
 if (!raw) return createWeeklyTestState(weekKey, engineElo)

 const parsed = JSON.parse(raw) as WeeklyTestState
 if (
 parsed.weekKey !== weekKey ||
 !Array.isArray(parsed.games) ||
 parsed.games.length !== 2
 ) {
 return createWeeklyTestState(weekKey, engineElo)
 }

 return {
 ...parsed,
 engineElo: Number.isFinite(parsed.engineElo) ? parsed.engineElo : engineElo,
 currentGame:
 parsed.currentGame === 1 || parsed.currentGame === 2 ? parsed.currentGame : 0,
 games: [
 {
  ...emptyWeeklyGame('white', parsed.transferTargets?.[0]),
  ...parsed.games[0],
  color: 'white',
  transferOpportunities: parsed.games[0]?.transferOpportunities ?? [],
 },
 {
  ...emptyWeeklyGame('black', parsed.transferTargets?.[1] ?? parsed.transferTargets?.[0]),
  ...parsed.games[1],
  color: 'black',
  transferOpportunities: parsed.games[1]?.transferOpportunities ?? [],
 },
 ],
 transferTargets: parsed.transferTargets ?? parsed.games
  .map((game) => game.transferTarget)
  .filter((target): target is TransferTarget => Boolean(target)),
 }
 } catch {
 return createWeeklyTestState(weekKey, engineElo)
 }
}

function saveWeeklyTestState(state: WeeklyTestState) {
 window.localStorage.setItem(WEEKLY_TEST_STORAGE_KEY, JSON.stringify(state))
}

function getGameResult(chess: Chess) {
 if (chess.isCheckmate()) {
 return chess.turn() === 'w' ? '0-1' : '1-0'
 }

 if (chess.isDraw()) return '1/2-1/2'
 return '*'
}

function chessFromWeeklyGame(record?: WeeklyGameRecord) {
 if (!record) return new Chess()

 if (record.pgn) {
 try {
 const restored = new Chess()
 restored.loadPgn(record.pgn)
 return restored
 } catch {
 // Fall through to the saved FEN.
 }
 }

 return makeChessSafe(record.fen)
}

function setEndgameTransferHeaders(
 chess: Chess,
 session: EndgameTransferSession,
 result = '*',
) {
 chess.header(
  'Event',
  'Endgame Transfer Test',
  'White',
  session.studentColor === 'white' ? 'Student' : 'Computer',
  'Black',
  session.studentColor === 'black' ? 'Student' : 'Computer',
  'Result',
  result,
  'SetUp',
  '1',
  'FEN',
  session.fen,
  'TransferTrainer',
  session.trainerKey,
  'TransferTheme',
  session.theme,
 )
}

function chessFromEndgameTransfer(session?: EndgameTransferSession | null) {
 if (!session) return new Chess()

 if (session.pgn) {
  try {
   const restored = new Chess()
   restored.loadPgn(session.pgn)
   return restored
  } catch {
   // Fall through to the latest saved FEN.
  }
 }

 const restored = makeChessSafe(session.currentFen || session.fen)
 setEndgameTransferHeaders(restored, session, session.gameResult || '*')
 return restored
}

function getPlayEvalBarPercent(evalText: string, fen: string) {
 const text = evalText.trim()

 // Completed games use the real result and fill the bar completely.
 if (text === '1-0') return 100
 if (text === '0-1') return 0
 if (text === '1/2-1/2') return 50

 // Stockfish can report plain "Mate" or M0 in a terminal position.
 // The side to move in a checkmated FEN is the losing side.
 if (text === 'Mate') return sideToMove(fen) === 'white' ? 0 : 100
 if (!text || text === '-' || text === ' - ') return 50

 let sideToMoveScore = 0

 if (text.startsWith('M')) {
  const mateNumber = Number(text.slice(1))

  if (!Number.isFinite(mateNumber)) return 50
  if (mateNumber === 0) return sideToMove(fen) === 'white' ? 0 : 100

  sideToMoveScore = mateNumber > 0 ? 100 : -100
 } else {
  const parsed = Number(text.replace('+', ''))

  if (!Number.isFinite(parsed)) return 50

  sideToMoveScore = parsed
 }

 const turn = sideToMove(fen)
 const whiteScore = turn === 'white' ? sideToMoveScore : -sideToMoveScore
 const percent = 50 + Math.tanh(whiteScore / 6) * 48

 return Math.max(2, Math.min(98, percent))
}


const pieceSymbols: Record<string, string> = {
 p: "\u265F",
 n: "\u265E",
 b: "\u265D",
 r: "\u265C",
 q: "\u265B",
 k: "\u265A",
 P: "\u2659",
 N: "\u2658",
 B: "\u2657",
 R: "\u2656",
 Q: "\u2655",
 K: "\u2654",
}



const PIECE_URLS: Record<string, string> = {
 wP: "/pieces/react-chessboard-default/wp.svg",
 wN: "/pieces/react-chessboard-default/wn.svg",
 wB: "/pieces/react-chessboard-default/wb.svg",
 wR: "/pieces/react-chessboard-default/wr.svg",
 wQ: "/pieces/react-chessboard-default/wq.svg",
 wK: "/pieces/react-chessboard-default/wk.svg",
 bP: "/pieces/react-chessboard-default/bp.svg",
 bN: "/pieces/react-chessboard-default/bn.svg",
 bB: "/pieces/react-chessboard-default/bb.svg",
 bR: "/pieces/react-chessboard-default/br.svg",
 bQ: "/pieces/react-chessboard-default/bq.svg",
 bK: "/pieces/react-chessboard-default/bk.svg",
}

const playComputerPieces = Object.fromEntries(
 Object.entries(PIECE_URLS).map(([code, src]) => [
 code,
 ({ squareWidth }: { squareWidth: number }) => (
 <img
 src={src}
 alt={code}
 style={{ width: squareWidth, height: squareWidth }}
 />
 ),
 ])
)

function sideToMove(fen: string): Side {
 return fen.split(' ')[1] === 'b' ? 'black' : 'white'
}

function makeChessSafe(fen?: string): Chess {
 if (!fen || !fen.trim()) return new Chess()

 try {
 return new Chess(fen)
 } catch {
 try {
 return new (Chess as any)(fen, { skipValidation: true }) as Chess
 } catch {
 console.warn('Invalid FEN, falling back to start position:', fen)
 return new Chess()
 }
 }
}

function getMoveHighlightStyles(moveUci: string | null) {
 if (!moveUci || moveUci.length < 4) return {}

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

function getCheckedKingSquare(chess: Chess): string | null {
 if (!chess.inCheck()) return null

 const board = chess.board()
 for (let rank = 0; rank < 8; rank++) {
 for (let file = 0; file < 8; file++) {
 const piece = board[rank][file]
 if (!piece || piece.type !== 'k') continue

 const kingSide: Side = piece.color === 'w' ? 'white' : 'black'
 if (kingSide !== sideToMove(chess.fen())) continue

 return 'abcdefgh'[file] + String(8 - rank)
 }
 }

 return null
}

function getMaterialData(fen: string) {
 const board = new Chess(fen).board()

 const whiteCount: Record<string, number> = { p: 0, n: 0, b: 0, r: 0, q: 0 }
 const blackCount: Record<string, number> = { p: 0, n: 0, b: 0, r: 0, q: 0 }

 board.forEach((row) => {
 row.forEach((piece) => {
 if (!piece || piece.type === 'k') return
 if (piece.color === 'w') whiteCount[piece.type]++
 else blackCount[piece.type]++
 })
 })

 const startCounts: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 }

 const capturedByWhite: string[] = []
 const capturedByBlack: string[] = []

 ;(['q', 'r', 'b', 'n', 'p'] as const).forEach((type) => {
 const missingBlack = startCounts[type] - blackCount[type]
 const missingWhite = startCounts[type] - whiteCount[type]

 for (let i = 0; i < missingBlack; i++) capturedByWhite.push(type)
 for (let i = 0; i < missingWhite; i++) capturedByBlack.push(type)
 })

 const whiteMaterial =
 whiteCount.p +
 whiteCount.n * 3 +
 whiteCount.b * 3 +
 whiteCount.r * 5 +
 whiteCount.q * 9

 const blackMaterial =
 blackCount.p +
 blackCount.n * 3 +
 blackCount.b * 3 +
 blackCount.r * 5 +
 blackCount.q * 9

 return {
 capturedByWhite,
 capturedByBlack,
 whiteAdvantage: Math.max(whiteMaterial - blackMaterial, 0),
 blackAdvantage: Math.max(blackMaterial - whiteMaterial, 0),
 }
}

function CapturedRow({
 pieces,
 advantage,
}: {
 pieces: string[]
 advantage: number
}) {
 return (
 <div
 className="play-computer-captured-row"
 style={{
 minHeight: 30,
 display: 'flex',
 alignItems: 'center',
 gap: 8,
 color: '#e5e7eb',
 }}
 >
 <div className="play-computer-captured-pieces" style={{ display: 'flex', gap: 2, fontSize: 22, lineHeight: 1 }}>
 {pieces.map((p, i) => (
 <span key={`${p}-${i}`} style={{ opacity: 0.95 }}>
 {pieceSymbols[p]}
 </span>
 ))}
 </div>

 {advantage > 0 ? (
 <span
 style={{
 fontSize: 15,
 fontWeight: 800,
 color: '#d1d5db',
 }}
 >
 +{advantage}
 </span>
 ) : null}
 </div>
 )
}

function EmptyCapturedRow() {
 return <div className="play-computer-captured-row play-computer-captured-row--empty" style={{ minHeight: 30 }} />
}

export default function PlayComputerPage() {
 const location = useLocation()
 const navigate = useNavigate()
 const searchParams = new URLSearchParams(location.search)

 const isWeeklyTest = searchParams.get('weekly') === '1'
 const isEndgameTransfer = searchParams.get('endgameTransfer') === '1'
 const isAssessment = isWeeklyTest || isEndgameTransfer
 const initialEndgameTransfer = isEndgameTransfer
  ? loadEndgameTransferSession()
  : null
 const continueWeeklyGameTwo = searchParams.get('continue') === '2'
 const weeklyWeekKey = getCurrentWeekKey()
 const requestedWeeklyElo = Number(searchParams.get('elo') || 1500)
 const weeklyDefaultElo = Math.max(
 100,
 Math.min(3000, Number.isFinite(requestedWeeklyElo) ? requestedWeeklyElo : 1500),
 )
 const initialWeeklyTest = isWeeklyTest
 ? loadWeeklyTestState(weeklyWeekKey, weeklyDefaultElo)
 : null
 const initialWeeklyGameIndex: 0 | 1 =
 initialWeeklyTest?.currentGame === 1 || initialWeeklyTest?.currentGame === 2 ? 1 : 0
 const initialWeeklyColor: Side = initialWeeklyGameIndex === 0 ? 'white' : 'black'
 const initialWeeklyRecord = initialWeeklyTest?.games[initialWeeklyGameIndex]

 const queryFen = searchParams.get('fen') || undefined
 const queryColor = searchParams.get('color')
 const queryMode = searchParams.get('mode')
 const queryAutoStart = searchParams.get('autostart') === '1' || searchParams.get('start') === '1'
 const stateAutoStart = (location.state as any)?.autostart === true
 const querySource = searchParams.get('source') || undefined

 const stateFen = (location.state as any)?.fen as string | undefined
 const stateSuggestedColor = (location.state as any)?.suggestedColor as Side | undefined
 const stateSource = (location.state as any)?.source as string | undefined
 const stateMode = (location.state as any)?.mode as Mode | undefined

 const initialFen = initialEndgameTransfer?.fen || queryFen || stateFen
 const suggestedColor = initialEndgameTransfer?.studentColor ||
 (queryColor === 'white' || queryColor === 'black'
 ? (queryColor as Side)
 : stateSuggestedColor)
 const source = querySource || stateSource
 const initialMode: Mode =
 queryMode === 'analyze' || stateMode === 'analyze' ? 'analyze' : 'play'

 const containerRef = useRef<HTMLDivElement | null>(null)
 const chessRef = useRef(
 isWeeklyTest
  ? chessFromWeeklyGame(initialWeeklyRecord)
  : isEndgameTransfer
  ? chessFromEndgameTransfer(initialEndgameTransfer)
  : makeChessSafe(initialFen),
 )
 const endgameTransferFinishedRef = useRef(false)
 const engineMovePendingRef = useRef(false)
 const evalPendingRef = useRef(false)
 const weeklyCloudSaveTimerRef = useRef<number | null>(null)
 const weeklyAutoReviewTimerRef = useRef<number | null>(null)
 const weeklyAutoReviewLaunchRef = useRef<string | null>(null)
 const weeklyTransferOpportunitiesRef = useRef<TransferOpportunity[]>(
  initialWeeklyRecord?.transferOpportunities ?? [],
 )

 const initialAutoStart =
 !isWeeklyTest &&
 initialMode === 'play' &&
 (Boolean(initialEndgameTransfer) || queryAutoStart || stateAutoStart || Boolean(initialFen))

 const [weeklyTest, setWeeklyTest] = useState<WeeklyTestState | null>(initialWeeklyTest)
 const [endgameTransfer, setEndgameTransfer] = useState<EndgameTransferSession | null>(
  initialEndgameTransfer,
 )
 const [weeklyCloudUserId, setWeeklyCloudUserId] = useState<string | null>(null)
 const [weeklyCloudReady, setWeeklyCloudReady] = useState(false)
 const [weeklyCloudAvailable, setWeeklyCloudAvailable] = useState(false)
 const [gameStarted, setGameStarted] = useState(
 isWeeklyTest ? Boolean(initialWeeklyRecord?.started) : initialMode === 'analyze' || initialAutoStart,
 )
 const [mode, setMode] = useState<Mode>(initialMode)

 const [playerColor, setPlayerColor] = useState<Side>(
 isWeeklyTest ? initialWeeklyColor : suggestedColor || 'white',
 )
 const [boardOrientation, setBoardOrientation] = useState<Side>(
 isWeeklyTest ? initialWeeklyColor : suggestedColor || 'white',
 )
 const [engineElo, setEngineElo] = useState(
 isWeeklyTest
  ? initialWeeklyTest?.engineElo || weeklyDefaultElo
  : initialEndgameTransfer?.engineElo || (initialFen ? 3000 : 1500),
 )
 const [boardSize, setBoardSize] = useState(getInitialPlayComputerBoardSize)
 const desktopBoardSizeRef = useRef(PLAY_COMPUTER_DEFAULT_BOARD_SIZE)

 const [position, setPosition] = useState(chessRef.current.fen())
 const [engineReady, setEngineReady] = useState(false)
 const [engineThinking, setEngineThinking] = useState(false)
 const [moveList, setMoveList] = useState<string[]>(chessRef.current.history())
 const [selectedHistoryPly, setSelectedHistoryPly] = useState<number | null>(null)
 const [evalText, setEvalText] = useState('-')
 const [hintArrow, setHintArrow] = useState<any[]>([])
 const [showEvalBar, setShowEvalBar] = useState(!isAssessment)
 const [statusText, setStatusText] = useState(
 isWeeklyTest
 ? initialWeeklyRecord?.completed
 ? `Weekly game ${initialWeeklyGameIndex + 1} complete`
 : initialWeeklyRecord?.started
 ? `Weekly game ${initialWeeklyGameIndex + 1} resumed`
 : `Weekly game ${initialWeeklyGameIndex + 1} ready`
 : isEndgameTransfer
 ? initialEndgameTransfer?.status === 'completed'
 ? initialEndgameTransfer.success
 ? 'Endgame transfer passed'
 : 'Endgame transfer needs review'
 : 'Practical endgame challenge started'
 : initialFen
 ? initialMode === 'analyze'
 ? 'Position loaded for analysis.'
 : 'Position loaded. Choose settings and start.'
 : 'Choose settings and start a game',
 )
 const [isDragging, setIsDragging] = useState(false)
 const [lastMoveHighlight, setLastMoveHighlight] = useState<string | null>(null)
 const [selectedSquare, setSelectedSquare] = useState<string | null>(null)
 const [legalTargets, setLegalTargets] = useState<string[]>([])

 const weeklyGameIndex: 0 | 1 =
 weeklyTest?.currentGame === 1 || weeklyTest?.currentGame === 2 ? 1 : 0
 const weeklyGameNumber = weeklyGameIndex + 1
 const weeklySessionComplete = weeklyTest?.currentGame === 2
 const weeklyTransferTarget = weeklyTest?.games[weeklyGameIndex]?.transferTarget
 const weeklyTransferOpportunities =
  weeklyTest?.games[weeklyGameIndex]?.transferOpportunities ?? []
 const weeklyTransferRecognized = weeklyTransferOpportunities.filter(
  (item) => item.status === 'recognized',
 ).length
 const weeklyTransferMissed = weeklyTransferOpportunities.filter(
  (item) => item.status === 'missed',
 ).length

 function queueWeeklyCloudSave(next: WeeklyTestState) {
 if (!isWeeklyTest || !weeklyCloudUserId) return

 if (weeklyCloudSaveTimerRef.current !== null) {
 window.clearTimeout(weeklyCloudSaveTimerRef.current)
 }

 weeklyCloudSaveTimerRef.current = window.setTimeout(() => {
 weeklyCloudSaveTimerRef.current = null
 void saveWeeklyTestToCloud(weeklyCloudUserId, next).then((saved) => {
 setWeeklyCloudAvailable(saved)
 })
 }, 300)
 }

 function persistWeeklyState(nextState: WeeklyTestState) {
 const next: WeeklyTestState = {
 ...nextState,
 updatedAt: new Date().toISOString(),
 }

 saveWeeklyTestState(next)
 setWeeklyTest(next)
 queueWeeklyCloudSave(next)
 }

 function applyWeeklyStateToBoard(next: WeeklyTestState) {
 const gameIndex: 0 | 1 =
 next.currentGame === 1 || next.currentGame === 2 ? 1 : 0
 const color: Side = gameIndex === 0 ? 'white' : 'black'
 const record = next.games[gameIndex]
 const restored = chessFromWeeklyGame(record)

 chessRef.current = restored
 setPlayerColor(color)
 setBoardOrientation(color)
 setPosition(restored.fen())
 setMoveList(restored.history())
 setLastMoveHighlight(null)
 setHintArrow([])
 clearSelection()
 setGameStarted(Boolean(record.started))
 setStatusText(
 record.completed
 ? `Weekly game ${gameIndex + 1} complete`
 : record.started
 ? `Weekly game ${gameIndex + 1} resumed`
 : `Weekly game ${gameIndex + 1} ready`,
 )
 setEvalText('-')
 weeklyTransferOpportunitiesRef.current = record.transferOpportunities ?? []
 }

 function setWeeklyHeaders(chess: Chess, color: Side, result = '*') {
 const date = new Date().toISOString().slice(0, 10).replace(/-/g, '.')
 chess.header(
 'Event',
 'Weekly Adaptive Test',
 'Site',
 'Weiss Chess Trainer',
 'Date',
 date,
 'Round',
 color === 'white' ? '1' : '2',
 'White',
 color === 'white' ? 'Student' : `Computer ${engineElo}`,
 'Black',
 color === 'black' ? 'Student' : `Computer ${engineElo}`,
 'Result',
 result,
 )

 const target = weeklyTest?.games[color === 'white' ? 0 : 1]?.transferTarget
 if (target) {
  chess.header(
   'TransferTarget',
   target.label,
   'TransferTargetKey',
   target.patternKey,
  )
 }

 const opportunities = weeklyTransferOpportunitiesRef.current
 if (opportunities.length > 0) {
  chess.header(
   'TransferOffered',
   String(opportunities.length),
   'TransferRecognized',
   String(opportunities.filter((item) => item.status === 'recognized').length),
   'TransferMissed',
   String(opportunities.filter((item) => item.status === 'missed').length),
  )
 }
 }

 function markWeeklyAutoReviewOpened(gameIndex: 0 | 1) {
 const openedAt = new Date().toISOString()
 const previous = loadWeeklyTestState(weeklyWeekKey, weeklyDefaultElo)
 const games: [WeeklyGameRecord, WeeklyGameRecord] = [
 { ...previous.games[0] },
 { ...previous.games[1] },
 ]

 games[gameIndex] = {
 ...games[gameIndex],
 autoReviewOpenedAt: openedAt,
 updatedAt: openedAt,
 }

 const next: WeeklyTestState = {
 ...previous,
 userId: weeklyCloudUserId || previous.userId,
 games,
 updatedAt: openedAt,
 }

 saveWeeklyTestState(next)
 setWeeklyTest(next)
 queueWeeklyCloudSave(next)
 }

 function scheduleWeeklyAutomaticReview(chess: Chess, gameIndex: 0 | 1) {
 if (!isWeeklyTest || !chess.isGameOver()) return

 const pgn = chess.pgn()
 if (!pgn.trim()) return

 const launchKey = `${weeklyWeekKey}:${gameIndex}:${chess.history().length}:${getGameResult(chess)}`
 if (weeklyAutoReviewLaunchRef.current === launchKey) return

 weeklyAutoReviewLaunchRef.current = launchKey
 setStatusText('Game complete. Automatic review starting...')

 if (weeklyAutoReviewTimerRef.current !== null) {
 window.clearTimeout(weeklyAutoReviewTimerRef.current)
 }

 weeklyAutoReviewTimerRef.current = window.setTimeout(() => {
 weeklyAutoReviewTimerRef.current = null
 markWeeklyAutoReviewOpened(gameIndex)
 window.sessionStorage.setItem('weissAnalyzeReviewPgn', pgn)
 window.sessionStorage.setItem(
 'weissWeeklyReviewContext',
 JSON.stringify({
 weekKey: weeklyWeekKey,
 gameIndex,
 gameNumber: gameIndex + 1,
 transferTarget: weeklyTest?.games[gameIndex]?.transferTarget ?? null,
 transferOpportunities: weeklyTransferOpportunitiesRef.current,
 }),
 )
 navigate(`/analyze/board?review=1&weekly=1&weeklyGame=${gameIndex + 1}`)
 }, 850)
 }

 function saveWeeklySnapshot(chess: Chess, started = true) {
 if (!isWeeklyTest) return

 setWeeklyTest((previous) => {
 if (!previous) return previous

 const gameIndex: 0 | 1 =
 previous.currentGame === 1 || previous.currentGame === 2 ? 1 : 0
 const color: Side = gameIndex === 0 ? 'white' : 'black'
 const completed = chess.isGameOver()
 const result = getGameResult(chess)

 setWeeklyHeaders(chess, color, result)

 const games: [WeeklyGameRecord, WeeklyGameRecord] = [
 { ...previous.games[0] },
 { ...previous.games[1] },
 ]

 games[gameIndex] = {
 ...games[gameIndex],
 color,
 started,
 completed,
 pgn: chess.pgn(),
 fen: chess.fen(),
 result,
 updatedAt: new Date().toISOString(),
 transferTarget: games[gameIndex].transferTarget ?? previous.transferTargets?.[gameIndex] ?? previous.transferTargets?.[0],
 transferOpportunities: [...weeklyTransferOpportunitiesRef.current],
 }

 const nextCurrentGame: 0 | 1 | 2 =
 gameIndex === 1 && completed ? 2 : previous.currentGame

 const completedAt =
 nextCurrentGame === 2
 ? previous.completedAt || new Date().toISOString()
 : previous.completedAt

 const next: WeeklyTestState = {
 ...previous,
 engineElo,
 currentGame: nextCurrentGame,
 games,
 completedAt,
 updatedAt: new Date().toISOString(),
 planSignals:
 nextCurrentGame === 2
 ? buildWeeklyPlanSignals(games)
 : previous.planSignals,
 }

 saveWeeklyTestState(next)
 queueWeeklyCloudSave(next)
 return next
 })
 }

 function openWeeklyReview(gameIndex: 0 | 1) {
 const record = weeklyTest?.games[gameIndex]
 if (!record?.completed || !record.pgn) return

 window.sessionStorage.setItem('weissAnalyzeReviewPgn', record.pgn)
 window.sessionStorage.setItem(
 'weissWeeklyReviewContext',
 JSON.stringify({
 weekKey: weeklyWeekKey,
 gameIndex,
 gameNumber: gameIndex + 1,
 transferTarget: record.transferTarget ?? null,
 transferOpportunities: record.transferOpportunities ?? [],
 }),
 )
 navigate(`/analyze/board?review=1&weekly=1&weeklyGame=${gameIndex + 1}`)
 }

 function continueToSecondWeeklyGame() {
 if (!weeklyTest?.games[0].completed) return

 const next: WeeklyTestState = {
 ...weeklyTest,
 currentGame: 1,
 }
 persistWeeklyState(next)

 const fresh = chessFromWeeklyGame(next.games[1])
 chessRef.current = fresh
 setPlayerColor('black')
 setBoardOrientation('black')
 setPosition(fresh.fen())
 setMoveList(fresh.history())
 setLastMoveHighlight(null)
 setHintArrow([])
 clearSelection()
 setGameStarted(Boolean(next.games[1].started))
 setStatusText(next.games[1].started ? 'Weekly game 2 resumed' : 'Weekly game 2 ready')
 setEvalText('-')
 weeklyTransferOpportunitiesRef.current = next.games[1].transferOpportunities ?? []
 }

 useEffect(() => {
 if (!isWeeklyTest) return

 let cancelled = false

 async function hydrateWeeklyCloudState() {
 const {
 data: { user },
 } = await supabase.auth.getUser()

 if (cancelled) return

 if (!user) {
 setWeeklyCloudAvailable(false)
 setWeeklyCloudReady(true)
 return
 }

 setWeeklyCloudUserId(user.id)

 const cloudLoad = await loadWeeklyTestFromCloud(
 user.id,
 weeklyWeekKey,
 )
 const cloudState = cloudLoad.state as WeeklyTestState | null

 if (cancelled) return

 const latestLocal = loadWeeklyTestState(weeklyWeekKey, weeklyDefaultElo)
 const newest = chooseNewestWeeklyTestState(latestLocal, cloudState)
 const recentTargets = await loadRecentTransferTargets(user.id, 2)
 const mergedTargets = newest.transferTargets?.length
  ? newest.transferTargets
  : recentTargets
 const mergedGames: [WeeklyGameRecord, WeeklyGameRecord] = [
  {
   ...newest.games[0],
   transferTarget:
    newest.games[0].transferTarget ??
    (!newest.games[0].started ? mergedTargets[0] : undefined),
   transferOpportunities: newest.games[0].transferOpportunities ?? [],
  },
  {
   ...newest.games[1],
   transferTarget:
    newest.games[1].transferTarget ??
    (!newest.games[1].started ? mergedTargets[1] ?? mergedTargets[0] : undefined),
   transferOpportunities: newest.games[1].transferOpportunities ?? [],
  },
 ]
 let merged: WeeklyTestState = {
 ...newest,
 userId: user.id,
 games: mergedGames,
 transferTargets: mergedTargets,
 updatedAt: newest.updatedAt || new Date().toISOString(),
 }

 if (
 continueWeeklyGameTwo &&
 merged.currentGame === 0 &&
 merged.games[0]?.completed
 ) {
 merged = {
 ...merged,
 currentGame: 1,
 updatedAt: new Date().toISOString(),
 }
 }

 saveWeeklyTestState(merged)
 setWeeklyTest(merged)
 applyWeeklyStateToBoard(merged)
 setWeeklyCloudReady(true)

 if (cloudLoad.available) {
 const saved = await saveWeeklyTestToCloud(user.id, merged)
 if (!cancelled) setWeeklyCloudAvailable(saved)
 } else {
 setWeeklyCloudAvailable(false)
 }
 }

 void hydrateWeeklyCloudState()

 return () => {
 cancelled = true
 if (weeklyCloudSaveTimerRef.current !== null) {
 window.clearTimeout(weeklyCloudSaveTimerRef.current)
 weeklyCloudSaveTimerRef.current = null
 }
 if (weeklyAutoReviewTimerRef.current !== null) {
 window.clearTimeout(weeklyAutoReviewTimerRef.current)
 weeklyAutoReviewTimerRef.current = null
 }
 }
 }, [isWeeklyTest, weeklyWeekKey, weeklyDefaultElo, continueWeeklyGameTwo])

 useEffect(() => {
 if (!isWeeklyTest || !weeklyCloudReady || !weeklyTest) return

 let gameIndex: 0 | 1 | null = null

 if (weeklyTest.currentGame === 2 && weeklyTest.games[1]?.completed) {
 gameIndex = 1
 } else if (weeklyTest.currentGame === 0 && weeklyTest.games[0]?.completed) {
 gameIndex = 0
 } else if (weeklyTest.currentGame === 1 && weeklyTest.games[1]?.completed) {
 gameIndex = 1
 }

 if (gameIndex === null) return

 const record = weeklyTest.games[gameIndex]
 if (!record?.pgn || record.autoReviewOpenedAt) return

 const restored = chessFromWeeklyGame(record)
 if (!restored.isGameOver()) return

 scheduleWeeklyAutomaticReview(restored, gameIndex)
 }, [
 isWeeklyTest,
 weeklyCloudReady,
 weeklyTest?.weekKey,
 weeklyTest?.currentGame,
 weeklyTest?.games[0]?.completed,
 weeklyTest?.games[0]?.autoReviewOpenedAt,
 weeklyTest?.games[1]?.completed,
 weeklyTest?.games[1]?.autoReviewOpenedAt,
 ])

 useEffect(() => {
 if (!isWeeklyTest && suggestedColor) {
 setPlayerColor(suggestedColor)
 setBoardOrientation(suggestedColor)
 }
 }, [isWeeklyTest, suggestedColor])

 useEffect(() => {
 if (isWeeklyTest) return

 const params = new URLSearchParams(location.search)

 const nextFen = params.get('fen') || ((location.state as any)?.fen as string | undefined)
 const nextColorRaw =
 params.get('color') || ((location.state as any)?.suggestedColor as string | undefined)
 const nextModeRaw =
 params.get('mode') || ((location.state as any)?.mode as string | undefined)

 const nextColor: Side | undefined =
 nextColorRaw === 'white' || nextColorRaw === 'black'
 ? (nextColorRaw as Side)
 : undefined

 const nextMode: Mode = nextModeRaw === 'analyze' ? 'analyze' : 'play'

 setMode(nextMode)

 if (!nextFen) return

 chessRef.current = makeChessSafe(nextFen)
 setPosition(chessRef.current.fen())
 setMoveList([])
 setLastMoveHighlight(null)
 clearSelection()
 setGameStarted(
 nextMode === 'analyze' ||
 (nextMode === 'play' &&
 (params.get('autostart') === '1' || params.get('start') === '1' || Boolean(nextFen)))
 )
 setStatusText(
 nextMode === 'analyze'
 ? 'Position loaded for analysis.'
 : 'Position loaded. Choose settings and start.'
 )

 if (nextColor) {
 setPlayerColor(nextColor)
 setBoardOrientation(nextColor)
 }
 }, [isWeeklyTest, location.search, location.state])

 useEffect(() => {
 stockfishService
 .init()
 .then(() => {
 setEngineReady(true)
 })
 .catch((err) => {
 console.error('Engine init failed:', err)
 setStatusText('Engine failed to load')
 })
 }, [])

 useEffect(() => {
  if (!isEndgameTransfer || !endgameTransfer || !gameStarted) return
  if (endgameTransfer.status !== 'ready') return

  const started = markEndgameTransferStarted(endgameTransfer)
  setEndgameTransfer(started)
 }, [isEndgameTransfer, gameStarted, endgameTransfer?.sessionId, endgameTransfer?.status])

 useEffect(() => {
  if (!isEndgameTransfer || !endgameTransfer || !chessRef.current.isGameOver()) return
  void finishEndgameTransferIfNeeded(chessRef.current)
 }, [isEndgameTransfer, endgameTransfer?.sessionId, endgameTransfer?.status])
 useEffect(() => {
 const strongMode = engineElo >= 2800

 ;(stockfishService as any).send?.(
 'setoption name UCI_LimitStrength value ' + (strongMode ? 'false' : 'true'),
 )

 if (!strongMode) {
 ;(stockfishService as any).send?.('setoption name UCI_Elo value ' + engineElo)
 }

 stockfishService.setSkill({
 skillLevel: strongMode ? 20 : Math.max(0, Math.min(20, Math.round(engineElo / 150))),
 depth: strongMode ? 22 : 12,
 moveTime: strongMode ? 2200 : 350,
 })
 }, [engineElo])

 useEffect(() => {
  function syncBoardSizeToViewport() {
   if (window.innerWidth <= PLAY_COMPUTER_MOBILE_BREAKPOINT) {
    setBoardSize(
     Math.min(PLAY_COMPUTER_MAX_BOARD_SIZE, Math.max(0, window.innerWidth - 16)),
    )
    return
   }

   setBoardSize(desktopBoardSizeRef.current)
  }

  syncBoardSizeToViewport()
  window.addEventListener('resize', syncBoardSizeToViewport)

  return () => window.removeEventListener('resize', syncBoardSizeToViewport)
 }, [])

 useEffect(() => {
 function onMouseMove(e: MouseEvent) {
 if (!isDragging || !containerRef.current) return
 if (window.innerWidth <= PLAY_COMPUTER_MOBILE_BREAKPOINT) return

 const rect = containerRef.current.getBoundingClientRect()
 const rightPanelWidth = 390
 const dividerWidth = 18
 const minBoard = 520
 const maxBoard = Math.min(920, rect.width - rightPanelWidth - dividerWidth)

 const nextSize = e.clientX - rect.left
 const clamped = Math.max(minBoard, Math.min(maxBoard, nextSize))
 desktopBoardSizeRef.current = clamped
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

 useEffect(() => {
 if (mode === 'analyze' && engineReady) {
 refreshEval()
 setStatusText('Analysis mode')
 }
 }, [mode, engineReady, position])

 const material = useMemo(() => getMaterialData(position), [position])

 const displayedGame = useMemo(() => makeChessSafe(position), [position])
 const checkedKingSquare = getCheckedKingSquare(displayedGame)
 const isMate = displayedGame.isCheckmate()
 const isDraw = displayedGame.isDraw()


 // automatic computer-turn effect
 useEffect(() => {
 if (mode !== 'play') return
 if (!gameStarted || !engineReady || engineThinking) return
 if (chessRef.current.isGameOver()) return

 const turnSide = sideToMove(chessRef.current.fen())

 // A loaded autoplay FEN can already be the student's turn. Evaluate it
 // immediately instead of leaving the bar at its neutral placeholder.
 if (turnSide === playerColor) {
  const timer = window.setTimeout(() => {
   refreshEval()
  }, 80)

  return () => window.clearTimeout(timer)
 }

 const timer = window.setTimeout(() => {
 if (
 mode === 'play' &&
 gameStarted &&
 engineReady &&
 !engineThinking &&
 !engineMovePendingRef.current &&
 !chessRef.current.isGameOver() &&
 sideToMove(chessRef.current.fen()) !== playerColor
 ) {
 makeEngineMove()
 }
 }, 160)

 return () => window.clearTimeout(timer)
 }, [mode, gameStarted, engineReady, engineThinking, position, playerColor])
 function clearSelection() {
 setSelectedSquare(null)
 setLegalTargets([])
 }

 function refreshEval() {
 if (isAssessment) return
 if (!engineReady) return
 if (engineThinking || engineMovePendingRef.current) return
 if (evalPendingRef.current) return
 if (!gameStarted && mode !== 'analyze') return

 const currentGame = chessRef.current

 // Do not ask Stockfish to evaluate a finished game. Display the actual
 // chess result and force the evaluation bar to the winning color.
 if (currentGame.isCheckmate()) {
  setEvalText(currentGame.turn() === 'w' ? '0-1' : '1-0')
  return
 }

 if (currentGame.isDraw()) {
  setEvalText('1/2-1/2')
  return
 }

 evalPendingRef.current = true

 stockfishService
 .getEvaluation(currentGame.fen(), { moveTime: 250 })
 .then((info) => {
 if (typeof info.mate === 'number') {
 setEvalText(info.mate === 0 ? 'Mate' : `M${info.mate}`)
 return
 }

 if (typeof info.scoreCp === 'number') {
 const score = info.scoreCp / 100
 setEvalText(score > 0 ? `+${score.toFixed(1)}` : score.toFixed(1))
 return
 }

 setEvalText('-')
 })
 .catch((err) => {
  if (!(err instanceof Error) || err.message !== 'Stockfish search replaced') {
   console.error(err)
  }
 })
 .finally(() => {
  evalPendingRef.current = false
 })
 }

 function syncFromGame() {
 setHintArrow([])
 setPosition(chessRef.current.fen())
 setMoveList(chessRef.current.history())
 setSelectedHistoryPly(null)
 }

 function updateGameStateLabels() {
 if (chessRef.current.isCheckmate()) {
 if (!isAssessment) setEvalText(getGameResult(chessRef.current))
 setStatusText(
 chessRef.current.turn() === 'w'
 ? 'Checkmate - Black wins'
 : 'Checkmate - White wins'
 )
 return
 }

 if (chessRef.current.isDraw()) {
 if (!isAssessment) setEvalText(getGameResult(chessRef.current))
 setStatusText('Draw')
 return
 }

 if (chessRef.current.isCheck()) {
 setStatusText(`${chessRef.current.turn() === 'w' ? 'White' : 'Black'} is in check`)
 return
 }

 setStatusText(`${chessRef.current.turn() === 'w' ? 'White' : 'Black'} to move`)
 }

 function persistEndgameTransferSnapshot(chess: Chess) {
  if (!isEndgameTransfer || !endgameTransfer || endgameTransfer.status === 'completed') return
  const updated = saveEndgameTransferProgress(
   endgameTransfer,
   chess.fen(),
   chess.pgn(),
  )
  setEndgameTransfer(updated)
 }

 async function finishEndgameTransferIfNeeded(chess: Chess) {
  if (!isEndgameTransfer || !endgameTransfer || !chess.isGameOver()) return
  if (endgameTransferFinishedRef.current || endgameTransfer.status === 'completed') return

  endgameTransferFinishedRef.current = true
  const gameResult = getGameResult(chess)
  const success = gradeEndgameTransfer(
   endgameTransfer,
   gameResult,
   chess.isCheckmate(),
  )

  setEndgameTransferHeaders(chess, endgameTransfer, gameResult)

  const completed = await completeEndgameTransferSession({
   session: endgameTransfer,
   gameResult,
   success,
   finalFen: chess.fen(),
   pgn: chess.pgn(),
  })
  setEndgameTransfer(completed)
  setStatusText(
   success
    ? `Passed - ${completed.trainerTitle}`
    : `Needs review - ${completed.trainerTitle}`,
  )
 }

 function resetToInitialPlayPosition() {
 if (isAssessment) return

 try {
 const resetFen = initialFen?.trim() || new Chess().fen()

 const next = makeChessSafe(resetFen)
 chessRef.current = next

 setPosition(next.fen())
 setMoveList([])
 setSelectedHistoryPly(null)
 setEngineThinking(false)
 setEvalText('-')
 setLastMoveHighlight(null)
 setHintArrow([])
 clearSelection()
 setGameStarted(true)

 const turn = next.fen().split(" ")[1] === "b" ? "Black" : "White"
 setStatusText(
  `${initialFen ? 'Supplied position reset. ' : 'Starting position reset. '}${turn} to move`,
 )
 } catch {
 setStatusText("Could not reset position.")
 }
 }
 
async function getBestMoveHint() {
 if (isAssessment) return null
 if (engineThinking || engineMovePendingRef.current) return null

 const fen = chessRef.current.fen()

 try {
 setHintArrow([])
 setStatusText('Engine hint thinking - ')

 await stockfishService.init()

 // Stop any eval search first, then ask for the real best move.
 stockfishService.stop()

 // Hint should be full-strength, not limited by current play Elo.
 ;(stockfishService as any).send?.('setoption name UCI_LimitStrength value false')
 ;(stockfishService as any).send?.('setoption name Skill Level value 20')

 stockfishService.setSkill({
 skillLevel: 20,
 moveTime: 1800,
 })

 const result = await stockfishService.getBestMove(fen)
 const bestMove = result.bestMove || ''

 if (!bestMove || bestMove.length < 4) {
 setStatusText('No engine hint found.')
 return null
 }

 const from = bestMove.slice(0, 2)
 const to = bestMove.slice(2, 4)
 const promotion = bestMove.length > 4 ? bestMove.slice(4, 5) : undefined

 const temp = new Chess(fen)
 const move = temp.move({
 from,
 to,
 promotion,
 })

 if (!move) {
 setStatusText('Engine returned illegal hint.')
 setHintArrow([])
 return null
 }

 return { from, to }
 } catch {
 setStatusText('Could not calculate engine hint.')
 return null
 } finally {
 // Restore normal play strength after hint.
 ;(stockfishService as any).send?.('setoption name UCI_LimitStrength value true')
 ;(stockfishService as any).send?.(`setoption name UCI_Elo value ${engineElo}`)

 stockfishService.setSkill({
 skillLevel: 20,
 moveTime: engineElo >= 2500 ? 450 : 250,
 })
 }
}

const { triggerHint: triggerBestMoveHint } = useHintAction(
 !isAssessment && gameStarted
 ? {
 getHintMove: getBestMoveHint,
 onHintStage: (move, stage) => {
 setHintArrow(
 stage === 'square'
 ? [[move.from, move.to, 'rgba(255, 215, 0, 0.95)']]
 : [],
 )
 setStatusText(
 stage === 'piece'
 ? 'The engine-recommended piece is highlighted.'
 : 'The engine-recommended destination is highlighted.',
 )
 },
 onHintReset: () => setHintArrow([]),
 disabled: !engineReady || engineThinking,
 resetKey: `${position}:${initialFen ?? ''}:${mode}:${gameStarted}`,
 }
 : null,
)


type ComputerMoveChoice = {
 move: string
 targetedCandidate?: TargetedComputerCandidate
}

function applyUciMove(fen: string, uci: string) {
 const chess = new Chess(fen)
 const applied = chess.move({
  from: uci.slice(0, 2),
  to: uci.slice(2, 4),
  promotion: uci.length > 4 ? uci.slice(4, 5) : undefined,
 })
 return applied ? chess : null
}

function studentEvalScore(info: { scoreCp?: number; mate?: number }) {
 if (typeof info.mate === 'number') {
  if (info.mate > 0) return 100000 - Math.min(999, info.mate)
  if (info.mate < 0) return -100000 + Math.min(999, Math.abs(info.mate))
  return 0
 }
 return info.scoreCp ?? 0
}

function targetedMoveToleranceCp() {
 if (engineElo <= 1100) return 380
 if (engineElo <= 1500) return 300
 if (engineElo <= 1900) return 220
 if (engineElo <= 2300) return 160
 return 110
}

function transferSearchIsActive(target: TransferTarget | undefined) {
 if (!isWeeklyTest || !target) return false

 const plies = chessRef.current.history().length
 const minPlies = target.category === 'mates' ? 12 : 8
 if (plies < minPlies || plies > 90) return false

 const opportunities = weeklyTransferOpportunitiesRef.current
 if (opportunities.some((item) => item.status === 'offered')) return false
 if (opportunities.length >= 2) return false

 return true
}

async function chooseComputerMoveWithTransfer(fen: string): Promise<ComputerMoveChoice> {
 const normalResult = await stockfishService.getBestMove(fen)
 const normalMove = normalResult.bestMove || ''

 if (!normalMove || normalMove.length < 4) return { move: normalMove }

 const target = weeklyTransferTarget
 if (!transferSearchIsActive(target)) return { move: normalMove }

 const normalAfter = applyUciMove(fen, normalMove)
 if (!normalAfter || !target) return { move: normalMove }

 const normalOpportunity = findImmediateTransferOpportunity(
  normalAfter,
  target,
  playerColor,
 )

 if (normalOpportunity) {
  return {
   move: normalMove,
   targetedCandidate: {
    computerMove: normalMove,
    opportunity: normalOpportunity,
    afterFen: normalAfter.fen(),
   },
  }
 }

 const position = new Chess(fen)
 const candidates = findTargetedComputerCandidates(position, target, playerColor, 5)
  .filter((candidate) => candidate.computerMove !== normalMove)

 if (candidates.length === 0) {
  const steeringCandidates = findTransferSteeringCandidates(
   position,
   target,
   playerColor,
   4,
  ).filter((candidate) => candidate.computerMove !== normalMove)

  if (steeringCandidates.length === 0) return { move: normalMove }

  try {
   const normalEval = await stockfishService.getEvaluation(normalAfter.fen(), {
    moveTime: 90,
   })
   const normalScore = studentEvalScore(normalEval)
   const steeringTolerance = Math.max(60, Math.round(targetedMoveToleranceCp() * 0.55))

   for (const candidate of steeringCandidates) {
    const candidateEval = await stockfishService.getEvaluation(candidate.afterFen, {
     moveTime: 90,
    })
    const candidateScore = studentEvalScore(candidateEval)

    if (candidateScore - normalScore <= steeringTolerance) {
     return { move: candidate.computerMove }
    }
   }
  } catch {
   // Normal engine play is the safe fallback.
  }

  return { move: normalMove }
 }

 // Exact mating-pattern transfer is deliberately allowed once. The point of this
 // weekly game is to test whether a recently drilled pattern transfers to play.
 if (target.category === 'mates') {
  return {
   move: candidates[0].computerMove,
   targetedCandidate: candidates[0],
  }
 }

 let normalScore = 0
 try {
  const normalEval = await stockfishService.getEvaluation(normalAfter.fen(), {
   moveTime: 110,
  })
  normalScore = studentEvalScore(normalEval)
 } catch {
  return { move: normalMove }
 }

 const tolerance = targetedMoveToleranceCp()
 let selected: { candidate: TargetedComputerCandidate; cost: number } | null = null

 for (const candidate of candidates) {
  try {
   const candidateEval = await stockfishService.getEvaluation(candidate.afterFen, {
    moveTime: 110,
   })
   const candidateScore = studentEvalScore(candidateEval)
   const cost = candidateScore - normalScore

   if (cost > tolerance) continue

   if (
    !selected ||
    candidate.opportunity.score > selected.candidate.opportunity.score ||
    (candidate.opportunity.score === selected.candidate.opportunity.score &&
     cost < selected.cost)
   ) {
    selected = { candidate, cost }
   }
  } catch {
   // A slow candidate is skipped; normal engine play remains available.
  }
 }

 return selected
  ? {
    move: selected.candidate.computerMove,
    targetedCandidate: selected.candidate,
   }
  : { move: normalMove }
}

async function makeEngineMove() {
 if (!engineReady || chessRef.current.isGameOver() || mode === 'analyze') {
 setEngineThinking(false)
 return
 }

 const turnSide = sideToMove(chessRef.current.fen())

 if (mode === 'play' && turnSide === playerColor) {
 setEngineThinking(false)
 updateGameStateLabels()
 refreshEval()
 return
 }

 if (engineMovePendingRef.current) return

 engineMovePendingRef.current = true
 setEngineThinking(true)
 setStatusText('Computer thinking - ')

 try {
 // Fast play move. Strength is still controlled by UCI_Elo.
 stockfishService.setSkill({
 skillLevel: 20,
 moveTime: isEndgameTransfer ? 700 : engineElo >= 2500 ? 350 : 220,
 })

 const choice = await chooseComputerMoveWithTransfer(chessRef.current.fen())
 const bestMove = choice.move

 if (!bestMove || bestMove.length < 4) {
 setStatusText('Computer could not find a move.')
 return
 }

 const applied = chessRef.current.move({
 from: bestMove.slice(0, 2),
 to: bestMove.slice(2, 4),
 promotion: bestMove.length > 4 ? bestMove.slice(4, 5) : undefined,
 })

 if (!applied) {
 setStatusText('Computer returned illegal move.')
 return
 }

 if (isWeeklyTest && choice.targetedCandidate && weeklyTransferTarget) {
  const opportunity = createTransferOpportunity(
   weeklyTransferTarget,
   choice.targetedCandidate,
   chessRef.current.history().length,
  )
  weeklyTransferOpportunitiesRef.current = [
   ...weeklyTransferOpportunitiesRef.current,
   opportunity,
  ]
 }

 setLastMoveHighlight(applied.from + applied.to + (applied.promotion ?? ''))
 syncFromGame()
 updateGameStateLabels()
 saveWeeklySnapshot(chessRef.current)
 persistEndgameTransferSnapshot(chessRef.current)

 if (chessRef.current.isGameOver()) {
  if (isWeeklyTest) {
   scheduleWeeklyAutomaticReview(chessRef.current, weeklyGameIndex)
  } else if (isEndgameTransfer) {
   void finishEndgameTransferIfNeeded(chessRef.current)
  }
 }
 } catch {
 setStatusText('Computer move failed.')
 } finally {
 engineMovePendingRef.current = false
 setEngineThinking(false)

 }
}

 function startGame() {
 if (isWeeklyTest && weeklySessionComplete) return

 const weeklyColor: Side = weeklyGameIndex === 0 ? 'white' : 'black'
 const normalStartFen =
  initialFen && initialFen.trim()
   ? initialFen.trim()
   : new Chess().fen()

 chessRef.current = isWeeklyTest
  ? new Chess()
  : makeChessSafe(normalStartFen)

 if (isWeeklyTest) {
 setPlayerColor(weeklyColor)
 setWeeklyHeaders(chessRef.current, weeklyColor)
 } else if (isEndgameTransfer && endgameTransfer) {
  setPlayerColor(endgameTransfer.studentColor)
  setEndgameTransferHeaders(chessRef.current, endgameTransfer)
 }

 setGameStarted(true)
 setBoardOrientation(
  isWeeklyTest
   ? weeklyColor
   : isEndgameTransfer && endgameTransfer
   ? endgameTransfer.studentColor
   : playerColor,
 )
 setEvalText('-')
 setLastMoveHighlight(null)
 setHintArrow([])
 clearSelection()
 if (isWeeklyTest) {
  weeklyTransferOpportunitiesRef.current =
   weeklyTest?.games[weeklyGameIndex]?.transferOpportunities ?? []
 }
 syncFromGame()
 updateGameStateLabels()
 saveWeeklySnapshot(chessRef.current, true)

 const activePlayerColor =
  isWeeklyTest
   ? weeklyColor
   : isEndgameTransfer && endgameTransfer
   ? endgameTransfer.studentColor
   : playerColor
 const turnSide = sideToMove(chessRef.current.fen())
 if (mode === 'play' && turnSide !== activePlayerColor) {
 if (!isWeeklyTest) setTimeout(makeEngineMove, 180)
 } else {
 refreshEval()
 }
 }

 function handleFlipBoard() {
 setBoardOrientation((prev) => (prev === 'white' ? 'black' : 'white'))
 }

 function handlePlayerColorSelect(color: Side) {
 setPlayerColor(color)
 setBoardOrientation(color)
 }

 useGlobalBoard({
 isAvailable: true,
 fen: position,
 suggestedColor: sideToMove(position),
 canFlip: true,
 onFlip: handleFlipBoard,
 })

 function handleSetup() {
 if (isAssessment) return

 if (mode === 'play') {
  const setupGame = new Chess()

  chessRef.current = setupGame
  setGameStarted(false)
  setPosition(setupGame.fen())
  setMoveList([])
  setSelectedHistoryPly(null)
  setEvalText('-')
  setLastMoveHighlight(null)
  setHintArrow([])
  clearSelection()
  setStatusText('Choose settings and start a game')

  navigate(location.pathname, { replace: true, state: null })
  return
 }

 setGameStarted(true)
 setStatusText('Analysis mode')
 refreshEval()
 }

 function openNormalGameReview() {
 if (isAssessment || isWeeklyTest || isEndgameTransfer) return

 const game = chessRef.current
 const pgnBeforeHeaders = game.pgn()

 if (!pgnBeforeHeaders.trim() || game.history().length === 0) {
  setStatusText('There are no moves to review yet.')
  return
 }

 const result = game.isGameOver()
  ? getGameResult(game)
  : playerColor === 'white'
  ? '0-1'
  : '1-0'

 game.header(
  'Event',
  'Play vs Computer',
  'White',
  playerColor === 'white' ? 'Student' : `Computer ${engineElo}`,
  'Black',
  playerColor === 'black' ? 'Student' : `Computer ${engineElo}`,
  'Result',
  result,
 )

 const pgn = game.pgn()

 window.sessionStorage.setItem('weissAnalyzeReviewPgn', pgn)
 window.sessionStorage.removeItem('weissWeeklyReviewContext')
 window.sessionStorage.setItem(
  'weissPlayComputerReviewContext',
  JSON.stringify({
   playerColor,
   engineElo,
   result,
   source: source || 'play-computer',
  }),
 )

 navigate('/analyze/board?review=1&playComputer=1')
 }

 function handleResign() {
 if (isAssessment) return

 const result = playerColor === 'white' ? '0-1' : '1-0'

 chessRef.current.header(
  'Event',
  'Play vs Computer',
  'White',
  playerColor === 'white' ? 'Student' : `Computer ${engineElo}`,
  'Black',
  playerColor === 'black' ? 'Student' : `Computer ${engineElo}`,
  'Result',
  result,
 )

 setStatusText(
 playerColor === 'white'
 ? 'White resigned Black wins'
 : 'Black resigned White wins'
 )
 setEvalText(result)
 setGameStarted(false)
 }

 function selectSquare(square: string) {
 const piece = chessRef.current.get(square as Square)
 if (!piece) {
 clearSelection()
 return
 }

 const turn = chessRef.current.turn()
 const pieceSide: Side = piece.color === 'w' ? 'white' : 'black'
 const turnSide: Side = turn === 'w' ? 'white' : 'black'

 if (mode === 'play') {
 if (pieceSide !== turnSide || pieceSide !== playerColor) {
 clearSelection()
 return
 }
 } else {
 if (pieceSide !== turnSide) {
 clearSelection()
 return
 }
 }

 const legalMoves = chessRef.current.moves({
 square: square as Square,
 verbose: true,
 })

 setSelectedSquare(square)
 setLegalTargets(legalMoves.map((m) => m.to))
 }

 function isPromotionAttempt(from: string, to: string) {
 const piece = chessRef.current.get(from as Square)
 if (!piece || piece.type !== 'p') return false

 return (
 (piece.color === 'w' && to.endsWith('8')) ||
 (piece.color === 'b' && to.endsWith('1'))
 )
 }

 function promotionCodeFromPiece(piece?: string | null) {
 if (!piece) return 'q'

 const code = piece.toLowerCase()

 if (code.includes('n')) return 'n'
 if (code.includes('b')) return 'b'
 if (code.includes('r')) return 'r'
 if (code.includes('q')) return 'q'

 return 'q'
 }

 function tryUserMove(from: string, to: string, promotionPiece?: string | null) {
 const promotion = isPromotionAttempt(from, to)
 ? promotionCodeFromPiece(promotionPiece)
 : undefined
 const beforeFen = chessRef.current.fen()
 const playedUci = `${from}${to}${promotion || ''}`

 let move
 try {
  move = chessRef.current.move({
   from,
   to,
   ...(promotion ? { promotion } : {}),
  })
 } catch {
  return false
 }

 if (!move) return false

 if (isWeeklyTest && weeklyTransferTarget) {
  const opportunities = [...weeklyTransferOpportunitiesRef.current]
  let unresolvedIndex = -1
  for (let index = opportunities.length - 1; index >= 0; index--) {
   if (opportunities[index].status === 'offered') {
    unresolvedIndex = index
    break
   }
  }

  if (unresolvedIndex >= 0) {
   const current = opportunities[unresolvedIndex]
   const recognized =
    current.expectedStudentMove === playedUci ||
    studentMoveMatchesTransferTarget(beforeFen, playedUci, weeklyTransferTarget)

   opportunities[unresolvedIndex] = {
    ...current,
    status: recognized ? 'recognized' : 'missed',
    playedMove: playedUci,
    resolvedAtPly: chessRef.current.history().length,
    resolvedAt: new Date().toISOString(),
   }
   weeklyTransferOpportunitiesRef.current = opportunities
  }
 }

 setLastMoveHighlight(`${move.from}${move.to}${move.promotion ?? ''}`)
 clearSelection()
 syncFromGame()
 updateGameStateLabels()
 saveWeeklySnapshot(chessRef.current)
 persistEndgameTransferSnapshot(chessRef.current)

 if (chessRef.current.isGameOver()) {
  if (isWeeklyTest) {
   scheduleWeeklyAutomaticReview(chessRef.current, weeklyGameIndex)
  } else if (isEndgameTransfer) {
   void finishEndgameTransferIfNeeded(chessRef.current)
  }
 }

 if (
 mode === 'play' &&
 !chessRef.current.isGameOver() &&
 sideToMove(chessRef.current.fen()) !== playerColor
 ) {
 setTimeout(makeEngineMove, 60)
 } else {
 refreshEval()
 }

 return true
 }

 const topCaptured =
 boardOrientation === 'white'
 ? {
 pieces: material.capturedByBlack,
 advantage: material.blackAdvantage,
 }
 : {
 pieces: material.capturedByWhite,
 advantage: material.whiteAdvantage,
 }

 const bottomCaptured =
 boardOrientation === 'white'
 ? {
 pieces: material.capturedByWhite,
 advantage: material.whiteAdvantage,
 }
 : {
 pieces: material.capturedByBlack,
 advantage: material.blackAdvantage,
 }

 const canBrowseFinishedGame =
 !isAssessment && gameStarted && chessRef.current.isGameOver() && moveList.length > 0

 function jumpToFinishedGamePly(ply: number) {
 if (!canBrowseFinishedGame) return

 const finalGame = chessRef.current
 const history = finalGame.history({ verbose: true }) as Array<{
  san: string
  color: 'w' | 'b'
  from: string
  to: string
  promotion?: string
  before?: string
  after?: string
 }>

 const selectedMove = history[ply - 1]
 if (!selectedMove) return

 let selectedFen = selectedMove.after

 if (!selectedFen) {
  const replay = makeChessSafe(history[0]?.before || initialFen)

  for (let index = 0; index < ply; index++) {
   const move = history[index]
   if (!move) break

   replay.move({
    from: move.from,
    to: move.to,
    promotion: move.promotion,
   })
  }

  selectedFen = replay.fen()
 }

 setPosition(selectedFen)
 setSelectedHistoryPly(ply)
 setLastMoveHighlight(
  selectedMove.from + selectedMove.to + (selectedMove.promotion ?? ''),
 )
 setHintArrow([])
 clearSelection()

 if (!isAssessment) {
  setEvalText(ply === history.length ? getGameResult(finalGame) : '-')
 }

 const moveNumber = Math.floor((ply - 1) / 2) + 1
 const movePrefix = selectedMove.color === 'w' ? `${moveNumber}.` : `${moveNumber}...`
 setStatusText(`Reviewing position after ${movePrefix} ${selectedMove.san}`)
 }

 const groupedMoves = []
 for (let i = 0; i < moveList.length; i += 2) {
 groupedMoves.push({
 number: Math.floor(i / 2) + 1,
 white: moveList[i] || '',
 black: moveList[i + 1] || '',
 whitePly: i + 1,
 blackPly: moveList[i + 1] ? i + 2 : null,
 })
 }

 const customSquareStyles: Record<string, React.CSSProperties> = {
 ...getMoveHighlightStyles(lastMoveHighlight),
 }

 if (selectedSquare) {
 customSquareStyles[selectedSquare] = {
 ...(customSquareStyles[selectedSquare] || {}),
 background:
 'radial-gradient(circle, rgba(80,160,255,0.28) 38%, rgba(80,160,255,0.55) 39%)',
 boxShadow: 'inset 0 0 10px rgba(80,160,255,0.85)',
 }
 }

 for (const square of legalTargets) {
 customSquareStyles[square] = {
 ...(customSquareStyles[square] || {}),
 background:
 'radial-gradient(circle, rgba(242,193,78,0.34) 26%, rgba(242,193,78,0.62) 27%, rgba(242,193,78,0.18) 43%, rgba(242,193,78,0.06) 44%)',
 }
 }

 if (checkedKingSquare) {
 customSquareStyles[checkedKingSquare] = {
 ...(customSquareStyles[checkedKingSquare] || {}),
 background:
 'radial-gradient(circle, rgba(255,80,80,0.85) 0%, rgba(180,0,0,0.65) 70%)',
 boxShadow: 'inset 0 0 0 3px rgba(255,255,255,0.15)',
 }
 }

 const topBoardOrientation =
 !gameStarted && mode === 'play' && !isAssessment
  ? playerColor
  : boardOrientation

 return (
 <div
 className="play-computer-page site-mobile-dock-scroll"
 style={{
 minHeight: '100vh',
 background: '#11110f',
 color: 'white',
 padding: '18px 20px 40px',
 cursor: isDragging ? 'col-resize' : 'default',
 }}
 >
 <div className="play-computer-title-row" style={{ maxWidth: 1440, margin: '0 auto 10px' }}>
 <div className="play-computer-title" style={pageTitleStyle}>
 {isWeeklyTest ? 'Weekly Adaptive Test' : isEndgameTransfer ? 'Endgame Transfer Test' : 'Play Computer'}
 </div>
 <div className="play-computer-mobile-status" aria-live="polite">
 {statusText}
 </div>
 </div>

 <div
 className="play-computer-layout"
 ref={containerRef}
 style={{
 maxWidth: 1440,
 margin: '0 auto',
 display: 'flex',
 gap: 0,
 alignItems: 'flex-start',
 userSelect: isDragging ? 'none' : 'auto',
 }}
 >
 <div className="play-computer-board-column" style={{ width: boardSize }}>
 <div
 className="play-computer-board-meta"
 style={{
 display: 'flex',
 justifyContent: 'space-between',
 alignItems: 'center',
 marginBottom: 8,
 }}
 >
 {gameStarted ? (
 <CapturedRow
 pieces={topCaptured.pieces}
 advantage={topCaptured.advantage}
 />
 ) : (
 <EmptyCapturedRow />
 )}

 <div
 className="play-computer-size-label"
 style={{
 display: 'flex',
 alignItems: 'center',
 gap: 10,
 background: 'rgba(255,255,255,0.04)',
 border: '1px solid rgba(255,255,255,0.08)',
 borderRadius: 10,
 padding: '8px 10px',
 fontSize: 13,
 opacity: 0.85,
 }}
 >
 Size {boardSize}px
 </div>
 </div>

 <div className="play-computer-board-shell" style={{ position: 'relative', width: boardSize, height: boardSize }}>
 {!isAssessment ? (
 <>
 <button
 className="play-computer-eval-toggle"
 data-name="play-eval-bar-toggle"
 type="button"
 onClick={(event) => {
 event.stopPropagation()
 setShowEvalBar((prev) => !prev)
 }}
 style={{
 position: 'absolute',
 left: -66,
 top: boardSize / 2 - 15,
 width: 56,
 height: 30,
 borderRadius: 999,
 border: showEvalBar
 ? '1px solid rgba(172,255,105,0.75)'
 : '1px solid rgba(255,255,255,0.28)',
 background: showEvalBar
 ? 'linear-gradient(180deg,#6fbf3d,#3d7f23)'
 : 'linear-gradient(180deg,#6b6b6b,#3b3b3b)',
 color: '#fff',
 fontSize: 11,
 fontWeight: 950,
 letterSpacing: 0.4,
 boxShadow: '0 6px 14px rgba(0,0,0,0.4)',
 cursor: 'pointer',
 zIndex: 120,
 }}
 >
 {showEvalBar ? 'EVAL' : 'OFF'}
 </button>

 <div
 className="play-computer-eval-bar"
 data-name="play-eval-bar"
 title={'Evaluation: ' + evalText}
 style={{
 position: 'absolute',
 left: -30,
 top: 0,
 width: 18,
 height: boardSize,
 borderRadius: 999,
 overflow: 'hidden',
 background: '#2e2b28',
 border: '1px solid rgba(255,255,255,0.12)',
 boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.25)',
 display: 'flex',
 flexDirection: 'column',
 opacity: showEvalBar ? 1 : 0.38,
 zIndex: 80,
 }}
 >
 <div
 style={{
 height: showEvalBar ? (100 - getPlayEvalBarPercent(evalText, position)) + '%' : '50%',
 background: showEvalBar ? '#302d2a' : '#555',
 transition: 'height 0.25s ease',
 }}
 />
 <div
 style={{
 height: showEvalBar ? getPlayEvalBarPercent(evalText, position) + '%' : '50%',
 background: showEvalBar ? '#f1f1e8' : '#777',
 transition: 'height 0.25s ease',
 }}
 />
 <div
 style={{
 position: 'absolute',
 left: -4,
 right: -4,
 bottom: 4,
 fontSize: 9,
 fontWeight: 900,
 textAlign: 'center',
 color: getPlayEvalBarPercent(evalText, position) > 58 ? '#111' : '#f3f3f3',
 textShadow: getPlayEvalBarPercent(evalText, position) > 58 ? 'none' : '0 1px 2px rgba(0,0,0,0.85)',
 pointerEvents: 'none',
 }}
 >
 {showEvalBar ? evalText : 'OFF'}
 </div>
 </div>
 </>
 ) : null}

 <ThemedChessboard
 position={position}
 boardOrientation={topBoardOrientation}
 boardWidth={boardSize}
 arePiecesDraggable={gameStarted || mode === 'analyze'}

 customSquareStyles={gameStarted || mode === 'analyze' ? customSquareStyles : {}}
 customArrows={(isAssessment ? [] : hintArrow) as any}
 animationDuration={350}
 customDarkSquareStyle={{ backgroundColor: '#769656' }}
 customLightSquareStyle={{ backgroundColor: '#eeeed2' }}
 customBoardStyle={{
 boxShadow: '0 0 0 1px rgba(255,255,255,0.04)',
 }}
 onSquareClick={(square) => {
 if (!gameStarted && mode !== 'analyze') return
 if (engineThinking) return
 if (chessRef.current.isGameOver()) return
 if (mode === 'play' && sideToMove(chessRef.current.fen()) !== playerColor) return

 if (selectedSquare) {
 if (selectedSquare === square) {
 clearSelection()
 return
 }

 const moveWorked = tryUserMove(selectedSquare, square)
 if (moveWorked) return
 }

 selectSquare(square)
 }}
 onPieceDrop={(sourceSquare, targetSquare) => {
 if (!gameStarted && mode !== 'analyze') return false
 if (engineThinking) return false
 if (chessRef.current.isGameOver()) return false
 if (mode === 'play' && sideToMove(chessRef.current.fen()) !== playerColor) return false

 if (isPromotionAttempt(sourceSquare, targetSquare)) return false

 return tryUserMove(sourceSquare, targetSquare)
 }}
 onPromotionCheck={(sourceSquare, targetSquare) => isPromotionAttempt(sourceSquare, targetSquare)}
 onPromotionPieceSelect={(piece, sourceSquare, targetSquare) => {
 if (!sourceSquare || !targetSquare) return false
 return tryUserMove(sourceSquare, targetSquare, piece)
 }}
 promotionDialogVariant="vertical"
/>

 {checkedKingSquare && !isMate ? (
 <div
 style={{
 pointerEvents: 'none',
 position: 'absolute',
 top: 12,
 left: 12,
 display: 'flex',
 gap: 8,
 flexWrap: 'wrap',
 }}
 >
 <div style={boardBadgeStyle}>Check</div>
 </div>
 ) : null}

 {isEndgameTransfer && endgameTransfer?.status === 'completed' ? (
 <div
 style={{
 pointerEvents: 'none',
 position: 'absolute',
 inset: 0,
 display: 'flex',
 alignItems: 'center',
 justifyContent: 'center',
 zIndex: 31,
 }}
 >
 <div style={endgameTransfer.success ? centeredSuccessBadgeStyle : centeredFailureBadgeStyle}>
 {endgameTransfer.success ? 'TRANSFER PASSED' : 'NEEDS REVIEW'}
 </div>
 </div>
 ) : (isMate || isDraw) ? (
 <div
 style={{
 pointerEvents: 'none',
 position: 'absolute',
 inset: 0,
 display: 'flex',
 alignItems: 'center',
 justifyContent: 'center',
 zIndex: 30,
 }}
 >
 <div style={isMate ? centeredMateBadgeStyle : centeredBoardBadgeStyle}>
 {isMate ? 'Checkmate' : 'Draw'}
 </div>
 </div>
 ) : null}
 </div>

 <div className="play-computer-bottom-captured" style={{ marginTop: 8 }}>
 {gameStarted ? (
 <CapturedRow
 pieces={bottomCaptured.pieces}
 advantage={bottomCaptured.advantage}
 />
 ) : (
 <EmptyCapturedRow />
 )}
 </div>
 </div>

 <div
 className="play-computer-resize-divider"
 onMouseDown={() => setIsDragging(true)}
 title="Drag to resize"
 style={{
 width: 20,
 height: boardSize - 16,
 display: 'flex',
 alignItems: 'center',
 justifyContent: 'center',
 cursor: 'col-resize',
 background: isDragging ? 'rgba(255,255,255,0.05)' : 'transparent',
 transition: 'background 0.15s ease',
 }}
 >
 <div
 style={{
 width: 14,
 height: 64,
 borderRadius: 999,
 background: '#3f3a37',
 boxShadow: '0 0 0 1px rgba(255,255,255,0.05)',
 }}
 />
 </div>

 <div
 className="play-computer-side-panel"
 style={{
 width: 390,
 minHeight: boardSize + 46,
 background: '#241f1d',
 borderRadius: 12,
 overflow: 'hidden',
 boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
 border: '1px solid rgba(255,255,255,0.07)',
 }}
 >
 <div
 className="play-computer-side-header"
 style={{
 padding: '14px 16px',
 borderBottom: '1px solid rgba(255,255,255,0.08)',
 display: 'flex',
 justifyContent: 'space-between',
 alignItems: 'center',
 fontWeight: 800,
 fontSize: 24,
 }}
 >
 <span>
 {isWeeklyTest
 ? 'Weekly Adaptive Test'
 : isEndgameTransfer
 ? 'Endgame Transfer Test'
 : mode === 'analyze'
 ? 'Analyze Position'
 : 'Play Computer'}
 </span>
 <span style={{ fontSize: 14, opacity: 0.82 }}>
 {engineReady ? 'Ready' : 'Loading'}
 {gameStarted && engineThinking ? ' Thinking' : ''}
 </span>
 </div>

 {!gameStarted && mode !== 'analyze' ? (
 <div className="play-computer-setup-panel" style={{ padding: 18 }}>
 <div className="play-computer-setup-intro" style={{ opacity: 0.82, marginBottom: 12, lineHeight: 1.5 }}>
 {isWeeklyTest
 ? `Game ${weeklyGameNumber} of 2. You play ${
 weeklyGameIndex === 0 ? 'White' : 'Black'
 }. Untimed, no hints, and no resignation.`
 : isEndgameTransfer && endgameTransfer
 ? `${endgameTransfer.objective} The exact trainer stays hidden until the test ends.`
 : initialFen
 ? 'This page was opened from an existing board position.'
 : 'Pick your side and engine strength before starting.'}
 </div>

 {!isWeeklyTest && source ? (
 <div
 className="play-computer-source"
 style={{
 marginBottom: 18,
 fontSize: 13,
 opacity: 0.72,
 }}
 >
 Source: {source}
 </div>
 ) : null}

 {!isAssessment ? (
 <>
 <div className="play-computer-settings play-computer-side-setting" style={{ marginBottom: 16 }}>
 <div style={labelStyle}>Your Side</div>
 <div className="play-computer-button-row" style={{ display: 'flex', gap: 10 }}>
 <button
 onClick={() => handlePlayerColorSelect('white')}
 style={{
 ...segButtonStyle,
 ...(playerColor === 'white' ? segButtonActiveStyle : {}),
 }}
 >
 White
 </button>
 <button
 onClick={() => handlePlayerColorSelect('black')}
 style={{
 ...segButtonStyle,
 ...(playerColor === 'black' ? segButtonActiveStyle : {}),
 }}
 >
 Black
 </button>
 </div>
 </div>

 <div className="play-computer-settings play-computer-difficulty-setting" style={{ marginBottom: 16 }}>
 <div style={labelStyle}>Computer Strength</div>
 <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>
 {engineElo}
 </div>
 <input
 type="range"
 min={100}
 max={3000}
 step={100}
 value={engineElo}
 onChange={(e) => setEngineElo(Number(e.target.value))}
 style={{ width: '100%' }}
 />
 <div
 style={{
 display: 'flex',
 justifyContent: 'space-between',
 fontSize: 12,
 opacity: 0.7,
 marginTop: 4,
 }}
 >
 <span>100</span>
 <span>1500</span>
 <span>3000</span>
 </div>
 </div>
 </>
 ) : (
 <div
 style={{
 marginBottom: 18,
 borderRadius: 12,
 padding: 14,
 background: 'rgba(127,166,80,0.12)',
 border: '1px solid rgba(127,166,80,0.32)',
 lineHeight: 1.55,
 }}
 >
 <div style={{ fontWeight: 800, marginBottom: 6 }}>
 {isWeeklyTest ? 'Weekly rules' : 'Endgame transfer rules'}
 </div>
 <div>No clock or time limit.</div>
 <div>No evaluation, hints, analysis, reset, or resignation.</div>
 <div>
 {isWeeklyTest
  ? 'The game is saved automatically after every move.'
  : endgameTransfer?.objective || 'Reach the required practical result.'}
 </div>
 <div style={{ marginTop: 6, opacity: 0.78 }}>Computer strength: {engineElo}</div>
 </div>
 )}

 <button
 className="play-computer-primary-control"
 onClick={startGame}
 disabled={!engineReady || (isWeeklyTest && weeklySessionComplete)}
 style={{
 ...primaryButtonStyle,
 width: '100%',
 opacity: engineReady && !(isWeeklyTest && weeklySessionComplete) ? 1 : 0.6,
 cursor:
 engineReady && !(isWeeklyTest && weeklySessionComplete)
 ? 'pointer'
 : 'not-allowed',
 }}
 >
 {!engineReady
 ? 'Loading Engine...'
 : isWeeklyTest
 ? `Start Weekly Game ${weeklyGameNumber}`
 : isEndgameTransfer
 ? 'Start Endgame Test'
 : 'Start Game'}
 </button>

 {!isAssessment && !initialFen ? (
 <button
 className="play-computer-weekly-control"
 onClick={() => {
 window.location.href = '/play-computer?weekly=1'
 }}
 style={{
 ...bigBtnStyle,
 width: '100%',
 marginTop: 10,
 border: '1px solid rgba(127,166,80,0.45)',
 }}
 >
 Weekly Adaptive Test
 </button>
 ) : null}

 <div className="play-computer-setup-status" style={{ marginTop: 14, fontSize: 14, opacity: 0.8 }}>
 Status: {statusText}
 </div>
 </div>
 ) : (
 <>
 <div
 className="play-computer-game-controls"
 style={{
 padding: 16,
 borderBottom: '1px solid rgba(255,255,255,0.08)',
 }}
 >
 <div className="play-computer-engine-label" style={{ marginBottom: 8, fontSize: 16, fontWeight: 700 }}>
 {isWeeklyTest
 ? `Weekly game ${weeklyGameNumber} of 2`
 : isEndgameTransfer
 ? 'Practical endgame challenge'
 : mode === 'analyze'
 ? 'Analysis'
 : 'Computer Strength'}
 </div>
 <div className="play-computer-engine-value" style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>
 {isWeeklyTest
 ? `You play ${playerColor === 'white' ? 'White' : 'Black'}`
 : isEndgameTransfer
 ? `You play ${playerColor === 'white' ? 'White' : 'Black'}`
 : mode === 'analyze'
 ? ''
 : engineElo}
 </div>

 <div className="play-computer-button-row play-computer-primary-controls" style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
 <button onClick={handleFlipBoard} style={btnStyle}>
 Flip Board
 </button>
 {!isAssessment ? (
 <>
 <button onClick={handleSetup} style={btnStyle}>
 Back to Setup
 </button>
 <button onClick={resetToInitialPlayPosition} style={btnStyle}>
 Reset Position
 </button>
 <button className="site-inline-hint" onClick={() => void triggerBestMoveHint()} style={btnStyle} disabled={!engineReady || engineThinking}>
 Hint
 </button>
 </>
 ) : null}
 </div>

 <div className="play-computer-status-text" style={{ fontSize: 14, opacity: 0.82 }}>{statusText}</div>
 {isWeeklyTest ? (
 <>
 <div style={{ marginTop: 6, fontSize: 13, opacity: 0.7 }}>
 Untimed - saved automatically - resignation disabled
 </div>
 <div style={{ marginTop: 4, fontSize: 12, opacity: 0.58 }}>
 {!weeklyCloudReady
 ? 'Checking account sync...'
 : weeklyCloudAvailable
 ? 'Account sync active'
 : weeklyCloudUserId
 ? 'Saved on this device - run the supplied Supabase SQL for cloud sync'
 : 'Saved on this device'}
 </div>
 <div style={{ marginTop: 7, fontSize: 12, color: '#cbd5a7', lineHeight: 1.45 }}>
 {weeklyTest?.games[weeklyGameIndex]?.completed && weeklyTransferTarget
  ? `Transfer target: ${weeklyTransferTarget.label} - recognized ${weeklyTransferRecognized}, missed ${weeklyTransferMissed}`
  : weeklyTransferTarget
  ? 'A recently trained pattern is being tested naturally. The target stays hidden during play.'
  : 'No recent supported mate or tactic pattern is recorded yet.'}
 </div>
 </>
 ) : null}
 {isEndgameTransfer && endgameTransfer ? (
 <div
 className="play-computer-assessment-status"
 style={{
 marginTop: 10,
 padding: 12,
 borderRadius: 10,
 background: endgameTransfer.status === 'completed'
  ? endgameTransfer.success
   ? 'rgba(127,166,80,0.16)'
   : 'rgba(239,68,68,0.13)'
  : 'rgba(255,255,255,0.045)',
 border: '1px solid rgba(255,255,255,0.09)',
 fontSize: 13,
 lineHeight: 1.5,
 }}
 >
 <div style={{ fontWeight: 850, marginBottom: 4 }}>
 {endgameTransfer.status === 'completed'
  ? endgameTransfer.success
   ? 'Practical transfer passed'
   : 'This endgame returns to Auto review'
  : endgameTransfer.objective}
 </div>
 <div style={{ opacity: 0.72 }}>
 {endgameTransfer.status === 'completed'
  ? `${endgameTransfer.trainerTitle}: ${endgameTransfer.label}`
  : 'The exact trainer and source position stay hidden until the game ends.'}
 </div>
 </div>
 ) : null}
 </div>

 <div
 className="play-computer-status-grid"
 style={{
 padding: 16,
 borderBottom: '1px solid rgba(255,255,255,0.08)',
 display: 'grid',
 gridTemplateColumns: '1fr 1fr',
 gap: 14,
 }}
 >
 <div>
 <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 6 }}>
 Evaluation
 </div>
 <div style={{ fontSize: 28, fontWeight: 800 }}>
 {isAssessment ? 'Hidden' : evalText}
 </div>
 </div>

 <div>
 <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 6 }}>
 {isAssessment ? 'Timing' : 'Mode'}
 </div>
 <div style={{ fontSize: 22, fontWeight: 800 }}>
 {isAssessment
 ? 'Untimed'
 : mode === 'analyze'
 ? 'Analyze'
 : playerColor === 'white'
 ? 'White'
 : 'Black'}
 </div>
 </div>
 </div>

 <div
 className="play-computer-move-list"
 style={{
 padding: 12,
 height: 430,
 overflowY: 'auto',
 borderBottom: '1px solid rgba(255,255,255,0.08)',
 }}
 >
 {groupedMoves.length === 0 ? (
 <div style={{ opacity: 0.65, padding: 8 }}>No moves yet</div>
 ) : (
 groupedMoves.map((row) => (
 <div
 key={row.number}
 style={{
 display: 'grid',
 gridTemplateColumns: '44px 1fr 1fr',
 gap: 8,
 padding: '6px 8px',
 borderRadius: 6,
 marginBottom: 4,
 background: 'rgba(255,255,255,0.03)',
 fontSize: 15,
 }}
 >
 <div style={{ opacity: 0.7, padding: '4px 0' }}>{row.number}.</div>
 <button
 type="button"
 onClick={() => jumpToFinishedGamePly(row.whitePly)}
 disabled={!canBrowseFinishedGame || !row.white}
 title={
  canBrowseFinishedGame && row.white
   ? `Show position after ${row.number}. ${row.white}`
   : undefined
 }
 style={{
 border:
  selectedHistoryPly === row.whitePly
   ? '1px solid rgba(185,229,138,0.9)'
   : '1px solid transparent',
 borderRadius: 5,
 padding: '3px 5px',
 background:
  selectedHistoryPly === row.whitePly
   ? 'rgba(127,166,80,0.72)'
   : 'transparent',
 color: '#f3f3f3',
 textAlign: 'left',
 font: 'inherit',
 fontWeight: selectedHistoryPly === row.whitePly ? 800 : 500,
 opacity: 1,
 cursor: canBrowseFinishedGame && row.white ? 'pointer' : 'default',
 }}
 >
 {row.white}
 </button>
 <button
 type="button"
 onClick={() => {
  if (row.blackPly) jumpToFinishedGamePly(row.blackPly)
 }}
 disabled={!canBrowseFinishedGame || !row.blackPly}
 title={
  canBrowseFinishedGame && row.blackPly
   ? `Show position after ${row.number}... ${row.black}`
   : undefined
 }
 style={{
 border:
  selectedHistoryPly === row.blackPly
   ? '1px solid rgba(185,229,138,0.9)'
   : '1px solid transparent',
 borderRadius: 5,
 padding: '3px 5px',
 background:
  selectedHistoryPly === row.blackPly
   ? 'rgba(127,166,80,0.72)'
   : 'transparent',
 color: '#f3f3f3',
 textAlign: 'left',
 font: 'inherit',
 fontWeight: selectedHistoryPly === row.blackPly ? 800 : 500,
 opacity: 1,
 cursor: canBrowseFinishedGame && row.blackPly ? 'pointer' : 'default',
 }}
 >
 {row.black}
 </button>
 </div>
 ))
 )}
 </div>

 <div
 className="play-computer-review-controls"
 style={{
 padding: 16,
 display: 'grid',
 gridTemplateColumns: isAssessment ? '1fr 1fr' : '1fr 1fr 1fr',
 gap: 10,
 }}
 >
 {isWeeklyTest ? (
 weeklyGameIndex === 0 ? (
 <>
 <button
 onClick={() => openWeeklyReview(0)}
 disabled={!weeklyTest?.games[0].completed}
 style={{
 ...bigBtnStyle,
 opacity: weeklyTest?.games[0].completed ? 1 : 0.5,
 cursor: weeklyTest?.games[0].completed ? 'pointer' : 'not-allowed',
 }}
 >
 Analyze Game 1
 </button>
 <button
 onClick={continueToSecondWeeklyGame}
 disabled={!weeklyTest?.games[0].completed}
 style={{
 ...primaryButtonStyle,
 padding: '12px 10px',
 opacity: weeklyTest?.games[0].completed ? 1 : 0.5,
 cursor: weeklyTest?.games[0].completed ? 'pointer' : 'not-allowed',
 }}
 >
 Continue to Game 2
 </button>
 </>
 ) : (
 <>
 <button
 onClick={() => openWeeklyReview(0)}
 disabled={!weeklyTest?.games[0].completed}
 style={{
 ...bigBtnStyle,
 opacity: weeklyTest?.games[0].completed ? 1 : 0.5,
 cursor: weeklyTest?.games[0].completed ? 'pointer' : 'not-allowed',
 }}
 >
 Review White Game
 </button>
 <button
 onClick={() => openWeeklyReview(1)}
 disabled={!weeklyTest?.games[1].completed}
 style={{
 ...bigBtnStyle,
 opacity: weeklyTest?.games[1].completed ? 1 : 0.5,
 cursor: weeklyTest?.games[1].completed ? 'pointer' : 'not-allowed',
 }}
 >
 Review Black Game
 </button>
 </>
 )
 ) : isEndgameTransfer ? (
 <>
 <button
 onClick={() => navigate('/auto')}
 disabled={endgameTransfer?.status !== 'completed'}
 style={{
  ...bigBtnStyle,
  opacity: endgameTransfer?.status === 'completed' ? 1 : 0.5,
  cursor: endgameTransfer?.status === 'completed' ? 'pointer' : 'not-allowed',
 }}
 >
 Return to Course
 </button>
 <button
 onClick={() => {
  if (endgameTransfer?.sourceRoute) navigate(endgameTransfer.sourceRoute)
 }}
 disabled={endgameTransfer?.status !== 'completed'}
 style={{
  ...primaryButtonStyle,
  padding: '12px 10px',
  opacity: endgameTransfer?.status === 'completed' ? 1 : 0.5,
  cursor: endgameTransfer?.status === 'completed' ? 'pointer' : 'not-allowed',
 }}
 >
 Train This Endgame
 </button>
 </>
 ) : (
 <>
 <button onClick={handleSetup} style={bigBtnStyle}>
 Back to Setup
 </button>
 <button onClick={handleResign} style={bigBtnStyle}>
 Resign
 </button>
 <button
 onClick={openNormalGameReview}
 disabled={
  chessRef.current.history().length === 0 ||
  (gameStarted && !chessRef.current.isGameOver())
 }
 style={{
  ...bigBtnStyle,
  opacity:
   chessRef.current.history().length > 0 &&
   (!gameStarted || chessRef.current.isGameOver())
    ? 1
    : 0.55,
  cursor:
   chessRef.current.history().length > 0 &&
   (!gameStarted || chessRef.current.isGameOver())
    ? 'pointer'
    : 'not-allowed',
 }}
 >
 Analyze Game
 </button>
 </>
 )}
 </div>
 </>
 )}
 </div>
 </div>
 </div>
 )
}

const labelStyle: React.CSSProperties = {
 fontSize: 14,
 opacity: 0.82,
 marginBottom: 8,
}

const segButtonStyle: React.CSSProperties = {
 background: '#312c29',
 color: 'white',
 border: '1px solid rgba(255,255,255,0.08)',
 borderRadius: 10,
 padding: '10px 16px',
 cursor: 'pointer',
 fontWeight: 700,
 minWidth: 100,
}

const segButtonActiveStyle: React.CSSProperties = {
 background: '#4f7d39',
 border: '1px solid rgba(170,220,120,0.35)',
}

const primaryButtonStyle: React.CSSProperties = {
 background: '#7fa650',
 color: 'white',
 border: '1px solid rgba(255,255,255,0.08)',
 borderRadius: 12,
 padding: '12px 18px',
 fontWeight: 800,
 fontSize: 16,
}

const btnStyle: React.CSSProperties = {
 background: '#312c29',
 color: 'white',
 border: '1px solid rgba(255,255,255,0.08)',
 borderRadius: 8,
 padding: '9px 12px',
 cursor: 'pointer',
 fontWeight: 700,
}

const bigBtnStyle: React.CSSProperties = {
 background: '#2f2e2b',
 color: 'white',
 border: '1px solid rgba(255,255,255,0.08)',
 borderRadius: 10,
 padding: '12px 10px',
 cursor: 'pointer',
 fontWeight: 800,
}

const boardBadgeStyle: React.CSSProperties = {
 background: 'rgba(0,0,0,0.72)',
 color: 'white',
 border: '1px solid rgba(255,255,255,0.12)',
 borderRadius: 999,
 padding: '6px 10px',
 fontSize: 13,
 fontWeight: 800,
 boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
}

const centeredBoardBadgeStyle: React.CSSProperties = {
 background: 'rgba(0,0,0,0.78)',
 color: 'white',
 border: '1px solid rgba(255,255,255,0.14)',
 borderRadius: 16,
 padding: '16px 28px',
 fontSize: 30,
 fontWeight: 900,
 boxShadow: '0 10px 28px rgba(0,0,0,0.35)',
}

const centeredMateBadgeStyle: React.CSSProperties = {
 ...centeredBoardBadgeStyle,
 background: 'rgba(140, 15, 15, 0.94)',
}


const pageTitleStyle: React.CSSProperties = {
 display: 'inline-block',
 background: '#2f2a27',
 color: 'white',
 borderRadius: 12,
 padding: '10px 18px',
 fontSize: 26,
 fontWeight: 900,
 boxShadow: '0 8px 22px rgba(0,0,0,0.35)',
}

const centeredSuccessBadgeStyle: React.CSSProperties = {
 ...centeredBoardBadgeStyle,
 background: 'rgba(55,105,42,0.94)',
 border: '1px solid rgba(190,255,150,0.45)',
 color: '#f4ffe8',
}

const centeredFailureBadgeStyle: React.CSSProperties = {
 ...centeredBoardBadgeStyle,
 background: 'rgba(125,35,35,0.94)',
 border: '1px solid rgba(255,170,170,0.42)',
 color: '#fff1f1',
}
