import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import type { PieceSymbol, Square } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { useRegisterPlayableBoard } from './hooks/useRegisterPlayableBoard'

type ManifestFile = {
  category?: string
  theme?: string
  subtheme?: string
  totalPuzzles?: number
  chunkSize?: number
  totalChunks?: number
  files?: string[]
  note?: string
}

type LichessChunkPuzzle = {
  lichessId?: string
  localId?: string
  fen?: string
  moves?: string[]
  preMove?: string
  solution?: string
  theme?: string
  subtheme?: string
  rating?: number
  themes?: string[]
  gameUrl?: string
  openingTags?: string[]
  source?: string
  chunk?: number
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
}

type DemoPuzzle = {
  id: string
  fen: string
  preMove?: string
  solutionMove: string
  fullSolution: string[]
  label: string
  theme: string
  chunkNumber: number
  chunkIndex: number
  userMoveCount: number
}

type PuzzleMastery = {
  fastSolves: number
}

type Phase = 'loading' | 'solving' | 'correct' | 'wrong' | 'finished'

const FAST_SOLVES_TO_MASTER = 5
const FAST_SOLVE_SECONDS_PER_MOVE = 3

const PREMOVE_START_DELAY_MS = 500
const PREMOVE_AFTER_PLAY_DELAY_MS = 300
const AUTO_REPLY_DELAY_MS = 550
const AUTO_NEXT_DELAY_MS = 2000

const DATA_BASE_PATH = '/data/lichess/mate_in_1/back_rank'
const MANIFEST_FETCH_PATH = `${DATA_BASE_PATH}/manifest.json`
const STORAGE_KEY = 'mate_trainer_back_rank_progress_v1'

type SavedState = {
  currentChunkIndex: number
  currentPuzzleIndex: number
  chunkProgressByFile: Record<string, number[]>
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
  if (!input) return 'mate_in_1'
  return input.replace(/_/g, ' ')
}

function countUserMovesFromFullSolution(rawMoves: string[]) {
  if (rawMoves.length <= 1) return 1

  let count = 0
  for (let i = 1; i < rawMoves.length; i += 2) {
    if (rawMoves[i]) count++
  }

  return Math.max(1, count)
}

function normalizePuzzle(raw: LichessChunkPuzzle, index: number): DemoPuzzle | null {
  const fen = raw.fen || raw.FEN || ''
  const fullSolutionFromArray = parseMovesArray(raw.moves)
  const fullSolutionFromString = parseMovesString(raw.full_solution || raw.Moves)
  const rawMoves =
    fullSolutionFromArray.length > 0 ? fullSolutionFromArray : fullSolutionFromString

  const preMove = raw.preMove || rawMoves[0]
  const solutionMove = normalizeUci(
    raw.solution || raw.solution_move || rawMoves[1] || rawMoves[0] || ''
  )

  if (!fen || !solutionMove) return null

  const chunkNumber = raw.chunk ?? raw.chunk_number ?? 1
  const chunkIndex =
    raw.chunkIndex ?? (raw.positionInChunk != null ? raw.positionInChunk - 1 : index)

  return {
    id: String(raw.localId || raw.lichessId || raw.lichess_id || raw.PuzzleId || index + 1),
    label: `Puzzle ${index + 1}`,
    theme: normalizeThemeName(raw.subtheme || raw.theme || raw.Themes || 'mate_in_1'),
    fen,
    preMove,
    solutionMove,
    fullSolution: rawMoves,
    chunkNumber,
    chunkIndex,
    userMoveCount: countUserMovesFromFullSolution(rawMoves),
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

function squareToCoords(square: string, boardSize: number) {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0)
  const rank = Number(square[1])
  const squareSize = boardSize / 8
  const left = file * squareSize
  const top = (8 - rank) * squareSize
  return { left, top, squareSize }
}

function formatSeconds(value: number) {
  return value.toFixed(1)
}

function pieceToUnicode(color: 'w' | 'b', type: PieceSymbol) {
  const map: Record<string, string> = {
    wp: '♙',
    wn: '♘',
    wb: '♗',
    wr: '♖',
    wq: '♕',
    wk: '♔',
    bp: '♟',
    bn: '♞',
    bb: '♝',
    br: '♜',
    bq: '♛',
    bk: '♚',
  }

  return map[`${color}${type}`]
}

function getSavedState(): SavedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
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

function saveState(state: SavedState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
}

export default function BackRankPage() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const autoReplyTimerRef = useRef<number | null>(null)
  const autoNextTimerRef = useRef<number | null>(null)
  const preMoveStartTimerRef = useRef<number | null>(null)
  const preMoveFinishTimerRef = useRef<number | null>(null)
  const wrongMoveTimerRef = useRef<number | null>(null)
  const solveStartedAtRef = useRef<number | null>(null)

  const [chunkFiles, setChunkFiles] = useState<string[]>([])
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0)

  const [puzzles, setPuzzles] = useState<DemoPuzzle[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)

  const [game, setGame] = useState(new Chess())
  const [boardFen, setBoardFen] = useState('start')
  const [boardOrientation, setBoardOrientation] = useState<'white' | 'black'>('white')
  const [message, setMessage] = useState('Loading puzzles...')
  const [phase, setPhase] = useState<Phase>('loading')
  const [solved, setSolved] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [boardLocked, setBoardLocked] = useState(true)
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null)
  const [displayTurn, setDisplayTurn] = useState<'w' | 'b'>('w')

  const [boardSize, setBoardSize] = useState(720)
  const [isDragging, setIsDragging] = useState(false)
  const [isHandleHovered, setIsHandleHovered] = useState(false)

  const [lastMoveHighlight, setLastMoveHighlight] = useState<string | null>(null)
  const [correctSquare, setCorrectSquare] = useState<string | null>(null)
  const [replySquare, setReplySquare] = useState<string | null>(null)
  const [replyMark, setReplyMark] = useState<{ square: string; piece: string } | null>(null)

  const [chunkProgress, setChunkProgress] = useState<PuzzleMastery[]>([])

  const currentChunkFileName = chunkFiles[currentChunkIndex] || ''

  function persistProgress(
    nextChunkIndex: number,
    nextPuzzleIndex: number,
    nextChunkProgress: PuzzleMastery[],
    fileNameOverride?: string
  ) {
    const saved = getSavedState()
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
    saveState(next)
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
      const res = await fetch(`${DATA_BASE_PATH}/${fileName}`)
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const data = (await res.json()) as LichessChunkPuzzle[]
      const normalized = data
        .map((item, index) => normalizePuzzle(item, index))
        .filter(Boolean) as DemoPuzzle[]

      if (normalized.length === 0) {
        throw new Error(`No valid puzzles found in ${fileName}`)
      }

      const saved = getSavedState()
      const savedProgress = saved.chunkProgressByFile[fileName] || []
      const restoredChunkProgress = normalized.map((_, i) => ({
        fastSolves: Math.max(0, Math.min(FAST_SOLVES_TO_MASTER, savedProgress[i] ?? 0)),
      }))

      let desiredPuzzleIndex =
        puzzleIndexOverride ??
        (saved.currentChunkIndex === chunkIndex ? saved.currentPuzzleIndex : 0)

      if (
        restoredChunkProgress.length > 0 &&
        restoredChunkProgress.every((x) => x.fastSolves >= FAST_SOLVES_TO_MASTER)
      ) {
        desiredPuzzleIndex = 0
      } else {
        const clamped = Math.max(0, Math.min(normalized.length - 1, desiredPuzzleIndex))
        if ((restoredChunkProgress[clamped]?.fastSolves ?? 0) >= FAST_SOLVES_TO_MASTER) {
          const firstUnmastered = restoredChunkProgress.findIndex(
            (x) => x.fastSolves < FAST_SOLVES_TO_MASTER
          )
          desiredPuzzleIndex = firstUnmastered >= 0 ? firstUnmastered : clamped
        } else {
          desiredPuzzleIndex = clamped
        }
      }

      clearTimers()
      setCurrentChunkIndex(chunkIndex)
      setPuzzles(normalized)
      setChunkProgress(restoredChunkProgress)
      setCurrentIndex(desiredPuzzleIndex)
      setSelectedSquare(null)
      setSolved(false)
      setBoardLocked(true)
      setPhase('solving')
      setMessage('Loading chunk...')

      persistProgress(chunkIndex, desiredPuzzleIndex, restoredChunkProgress, fileName)
    } catch (err) {
      console.error(err)
      setLoadError(`Could not load ${fileName}`)
      setBoardLocked(true)
      setPhase('finished')
      setMessage('Could not load chunk')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    async function bootstrap() {
      try {
        setLoading(true)
        setLoadError('')

        const manifestRes = await fetch(MANIFEST_FETCH_PATH)
        if (!manifestRes.ok) {
          throw new Error(`HTTP ${manifestRes.status}`)
        }

        const manifest = (await manifestRes.json()) as ManifestFile
        const files = manifest.files && manifest.files.length > 0 ? manifest.files : []

        if (files.length === 0) {
          throw new Error('No chunk files in manifest')
        }

        setChunkFiles(files)

        const saved = getSavedState()
        const startChunkIndex = Math.max(0, Math.min(files.length - 1, saved.currentChunkIndex ?? 0))

        await loadChunkByIndex(startChunkIndex, files, saved.currentPuzzleIndex ?? 0)
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
  }, [])

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

  useRegisterPlayableBoard({
    fen: boardFen,
    orientation: boardOrientation,
    setOrientation: setBoardOrientation,
    suggestedColor: boardOrientation,
  })

  useEffect(() => {
    if (loading || !currentPuzzle) return
    loadPuzzle(currentIndex)
    return () => clearTimers()
  }, [loading, currentIndex, currentPuzzle])

  useEffect(() => {
    if (!currentChunkFileName || puzzles.length === 0 || chunkProgress.length === 0) return
    persistProgress(currentChunkIndex, currentIndex, chunkProgress)
  }, [currentChunkIndex, currentIndex, chunkProgress, currentChunkFileName, puzzles.length])

  function clearTimers() {
    if (preMoveStartTimerRef.current) {
      window.clearTimeout(preMoveStartTimerRef.current)
      preMoveStartTimerRef.current = null
    }
    if (preMoveFinishTimerRef.current) {
      window.clearTimeout(preMoveFinishTimerRef.current)
      preMoveFinishTimerRef.current = null
    }
    if (wrongMoveTimerRef.current) {
      window.clearTimeout(wrongMoveTimerRef.current)
      wrongMoveTimerRef.current = null
    }
    if (autoReplyTimerRef.current) {
      window.clearTimeout(autoReplyTimerRef.current)
      autoReplyTimerRef.current = null
    }
    if (autoNextTimerRef.current) {
      window.clearTimeout(autoNextTimerRef.current)
      autoNextTimerRef.current = null
    }
  }

  function incrementFastSolve(puzzleIndex: number) {
    setChunkProgress((prev) =>
      prev.map((item, i) =>
        i === puzzleIndex
          ? {
              ...item,
              fastSolves: Math.min(item.fastSolves + 1, FAST_SOLVES_TO_MASTER),
            }
          : item
      )
    )
  }

  function loadPuzzle(index: number) {
    clearTimers()

    const puzzle = puzzles[index]
    if (!puzzle) return

    const startChess = new Chess(puzzle.fen)
    const playableChess = new Chess(puzzle.fen)

    if (puzzle.preMove) {
      try {
        playableChess.move(parseUci(puzzle.preMove))
      } catch {
        // ignore
      }
    }

    setGame(startChess)
    setBoardFen(startChess.fen())
    setDisplayTurn(playableChess.turn())
    setLastMoveHighlight(null)
    setCorrectSquare(null)
    setReplySquare(null)
    setReplyMark(null)
    setSelectedSquare(null)
    setSolved(false)
    setShowHint(false)
    setBoardLocked(true)
    setPhase('solving')

    if (puzzle.preMove) {
      setMessage('Opponent move...')

      preMoveStartTimerRef.current = window.setTimeout(() => {
        const afterPreMove = new Chess(puzzle.fen)

        try {
          afterPreMove.move(parseUci(puzzle.preMove!))
          setGame(afterPreMove)
          setBoardFen(afterPreMove.fen())
          setLastMoveHighlight(puzzle.preMove!)
        } catch {
          setLastMoveHighlight(null)
        }

        preMoveFinishTimerRef.current = window.setTimeout(() => {
          solveStartedAtRef.current = performance.now()
          setBoardLocked(false)
          setMessage('Find the mate in 1')
        }, PREMOVE_AFTER_PLAY_DELAY_MS)
      }, PREMOVE_START_DELAY_MS)
    } else {
      solveStartedAtRef.current = performance.now()
      setBoardLocked(false)
      setMessage('Find the mate in 1')
    }
  }

  function allPuzzlesMastered() {
    return (
      chunkProgress.length > 0 &&
      chunkProgress.every((item) => item.fastSolves >= FAST_SOLVES_TO_MASTER)
    )
  }

  function goToNextPuzzle() {
    const nextChunkProgress = chunkProgress

    const chunkIsMastered =
      nextChunkProgress.length > 0 &&
      nextChunkProgress.every((item) => item.fastSolves >= FAST_SOLVES_TO_MASTER)

    if (chunkIsMastered) {
      const nextChunkIndex = currentChunkIndex + 1

      if (nextChunkIndex < chunkFiles.length) {
        void loadChunkByIndex(nextChunkIndex, undefined, 0)
        return
      }

      setBoardLocked(true)
      setPhase('finished')
      setDisplayTurn('w')
      setMessage('All chunks mastered')
      return
    }

    for (let i = currentIndex + 1; i < nextChunkProgress.length; i++) {
      if ((nextChunkProgress[i]?.fastSolves ?? 0) < FAST_SOLVES_TO_MASTER) {
        setCurrentIndex(i)
        return
      }
    }

    for (let i = 0; i <= currentIndex; i++) {
      if ((nextChunkProgress[i]?.fastSolves ?? 0) < FAST_SOLVES_TO_MASTER) {
        setCurrentIndex(i)
        return
      }
    }

    setBoardLocked(true)
    setPhase('finished')
    setDisplayTurn('w')
    setMessage('Chunk complete')
  }

  function completeCorrectMove(testGame: Chess, playedUci: string, moveToSquare: string) {
    const solvedInSeconds =
      solveStartedAtRef.current == null
        ? null
        : (performance.now() - solveStartedAtRef.current) / 1000

    const fastThreshold = (currentPuzzle?.userMoveCount ?? 1) * FAST_SOLVE_SECONDS_PER_MOVE
    const wasFast = solvedInSeconds !== null && solvedInSeconds <= fastThreshold

    setGame(testGame)
    setBoardFen(testGame.fen())
    setDisplayTurn(testGame.turn())
    setSolved(true)
    setBoardLocked(true)
    setSelectedSquare(null)
    setPhase('correct')
    setLastMoveHighlight(playedUci)
    setCorrectSquare(moveToSquare)

    if (wasFast) {
      incrementFastSolve(currentIndex)

      const currentFastSolves = chunkProgress[currentIndex]?.fastSolves ?? 0
      const nextValue = Math.min(currentFastSolves + 1, FAST_SOLVES_TO_MASTER)

      setMessage(
        `Correct — fast solve (${formatSeconds(
          solvedInSeconds!
        )}s) • ${nextValue}/${FAST_SOLVES_TO_MASTER}`
      )
    } else {
      setMessage(
        solvedInSeconds === null
          ? 'Correct'
          : `Correct — not fast (${formatSeconds(
              solvedInSeconds
            )}s) • need ≤ ${fastThreshold}s`
      )
    }

    const replyMove = currentPuzzle?.fullSolution[2]

    if (replyMove) {
      autoReplyTimerRef.current = window.setTimeout(() => {
        const replyGame = new Chess(testGame.fen())
        const parsedReply = parseUci(replyMove)
        const pieceBeforeReply = replyGame.get(parsedReply.from as Square)

        const reply = replyGame.move(parsedReply)
        if (!reply) {
          autoNextTimerRef.current = window.setTimeout(() => {
            goToNextPuzzle()
          }, AUTO_NEXT_DELAY_MS)
          return
        }

        setGame(replyGame)
        setBoardFen(replyGame.fen())
        setDisplayTurn(replyGame.turn())
        setLastMoveHighlight(replyMove)
        setCorrectSquare(null)
        setReplySquare(reply.to)
        setReplyMark(
          pieceBeforeReply
            ? {
                square: reply.to,
                piece: pieceToUnicode(pieceBeforeReply.color, pieceBeforeReply.type),
              }
            : null
        )
        setMessage('Good. Opponent reply played.')

        autoNextTimerRef.current = window.setTimeout(() => {
          goToNextPuzzle()
        }, AUTO_NEXT_DELAY_MS)
      }, AUTO_REPLY_DELAY_MS)
    } else {
      autoNextTimerRef.current = window.setTimeout(() => {
        goToNextPuzzle()
      }, AUTO_NEXT_DELAY_MS)
    }
  }

  function attemptUserMove(sourceSquare: string, targetSquare: string) {
    if (solved || boardLocked || !currentPuzzle || phase !== 'solving') return false

    const expected = parseUci(currentPuzzle.solutionMove)
    const testGame = new Chess(game.fen())

    let move
    try {
      move = testGame.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: expected.promotion,
      })
    } catch {
      return false
    }

    if (!move) return false

    const playedUci = `${move.from}${move.to}${move.promotion ?? ''}`.toLowerCase()

    if (playedUci !== currentPuzzle.solutionMove.toLowerCase()) {
      setSelectedSquare(null)
      setPhase('wrong')
      setMessage('Wrong move')
      wrongMoveTimerRef.current = window.setTimeout(() => {
        setPhase((prev) => (prev === 'wrong' ? 'solving' : prev))
        setMessage((prev) => (prev === 'Wrong move' ? 'Find the mate in 1' : prev))
      }, 700)
      return false
    }

    completeCorrectMove(testGame, playedUci, move.to)
    return true
  }

  function onDrop(sourceSquare: string, targetSquare: string) {
    return attemptUserMove(sourceSquare, targetSquare)
  }

  function onSquareClick(square: string) {
    if (solved || boardLocked || !currentPuzzle || phase !== 'solving') return

    const clickedPiece = game.get(square as Square)
    const sideToMove = game.turn()

    if (!selectedSquare) {
      if (clickedPiece && clickedPiece.color === sideToMove) {
        setSelectedSquare(square)
      }
      return
    }

    if (selectedSquare === square) {
      setSelectedSquare(null)
      return
    }

    const moveWorked = attemptUserMove(selectedSquare, square)
    if (moveWorked) return

    if (clickedPiece && clickedPiece.color === sideToMove) {
      setSelectedSquare(square)
    } else {
      setSelectedSquare(null)
    }
  }

  const currentPuzzleFastSolves = chunkProgress[currentIndex]?.fastSolves ?? 0
  const totalFastSolves = chunkProgress.reduce((sum, item) => sum + item.fastSolves, 0)
  const currentChunkTarget = Math.max(1, puzzles.length) * FAST_SOLVES_TO_MASTER
  const chunkPercent = Math.round((totalFastSolves / currentChunkTarget) * 100)
  const masteredPuzzleCount = chunkProgress.filter(
    (item) => item.fastSolves >= FAST_SOLVES_TO_MASTER
  ).length

  const sideToMoveText =
    phase === 'finished'
      ? 'Finished'
      : displayTurn === 'w'
      ? 'White'
      : 'Black'

  const sideSquareColor =
    phase === 'finished'
      ? '#c9a227'
      : displayTurn === 'w'
      ? '#ffffff'
      : '#111111'

  const fastThresholdForCurrentPuzzle =
    (currentPuzzle?.userMoveCount ?? 1) * FAST_SOLVE_SECONDS_PER_MOVE

  const handleActive = isDragging || isHandleHovered

  const customSquareStyles = {
    ...getMoveHighlightStyles(lastMoveHighlight),
    ...(selectedSquare
      ? {
          [selectedSquare]: {
            background:
              'radial-gradient(circle, rgba(80,160,255,0.28) 38%, rgba(80,160,255,0.55) 39%)',
            boxShadow: 'inset 0 0 10px rgba(80,160,255,0.85)',
          },
        }
      : {}),
    ...(correctSquare
      ? {
          [correctSquare]: {
            background:
              'radial-gradient(circle, rgba(120,255,120,0.35) 40%, rgba(120,255,120,0.6) 41%)',
            boxShadow: 'inset 0 0 10px rgba(120,255,120,0.8)',
          },
        }
      : {}),
    ...(replySquare
      ? {
          [replySquare]: {
            background:
              'radial-gradient(circle, rgba(255,120,120,0.28) 40%, rgba(255,120,120,0.46) 41%)',
            boxShadow: 'inset 0 0 10px rgba(255,120,120,0.65)',
          },
        }
      : {}),
  }

  const hintArrow =
    showHint && currentPuzzle && !boardLocked
      ? [[
          currentPuzzle.solutionMove.slice(0, 2),
          currentPuzzle.solutionMove.slice(2, 4),
          'rgb(242, 193, 78)',
        ]] as [string, string, string][]
      : []

  const replyMarkStyle = useMemo(() => {
    if (!replyMark) return null
    const pos = squareToCoords(replyMark.square, boardSize)
    return {
      left: pos.left,
      top: pos.top,
      width: pos.squareSize,
      height: pos.squareSize,
    }
  }, [replyMark, boardSize])

  const mainProgressWidth = `${(totalFastSolves / currentChunkTarget) * 100}%`

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#2b2623',
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
          background: '#2b2623',
          color: '#f3f3f3',
          padding: 40,
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <h1>Mate Trainer</h1>
        <p>No puzzles found.</p>
        {loadError && <p>{loadError}</p>}
      </div>
    )
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#2b2623',
        color: '#f3f3f3',
        fontFamily: 'Arial, sans-serif',
        cursor: isDragging ? 'col-resize' : 'default',
      }}
    >
      <div
        style={{
          maxWidth: 1450,
          margin: '0 auto',
          padding: '20px 16px 0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            borderRadius: 12,
            padding: '12px 16px',
            background: '#3b3734',
            color: 'white',
            fontSize: 15,
            fontWeight: 700,
          }}
        >
          Mate Trainer
        </div>

        <div style={{ color: '#bdbdbd', fontSize: 14 }}>
          {currentChunkFileName || 'chunk'}
        </div>
      </div>

      <div
        ref={containerRef}
        style={{
          maxWidth: 1450,
          margin: '0 auto',
          padding: '20px 16px',
          display: 'flex',
          gap: 0,
          alignItems: 'flex-start',
          userSelect: isDragging ? 'none' : 'auto',
          position: 'relative',
        }}
      >
        <div
          style={{
            width: boardSize,
            minWidth: 320,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            transition: isDragging ? 'none' : 'width 0.08s ease',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: boardSize,
              height: boardSize,
            }}
          >
            <Chessboard
              id="trainer-board"
              position={boardFen}
              boardOrientation={boardOrientation}
              onPieceDrop={onDrop}
              onSquareClick={onSquareClick}
              arePiecesDraggable={!solved && !boardLocked && phase === 'solving'}
              boardWidth={boardSize}
              customSquareStyles={customSquareStyles}
              customArrows={hintArrow}
              customDarkSquareStyle={{ backgroundColor: '#7d9a58' }}
              customLightSquareStyle={{ backgroundColor: '#d8d8bf' }}
              customBoardStyle={{
                boxShadow: '0 0 0 1px rgba(255,255,255,0.04)',
              }}
              animationDuration={350}
            />

            {correctSquare && (
              <div
                style={{
                  position: 'absolute',
                  pointerEvents: 'none',
                  fontSize: boardSize / 12,
                  color: '#4caf50',
                  fontWeight: 900,
                  left: squareToCoords(correctSquare, boardSize).left,
                  top: squareToCoords(correctSquare, boardSize).top,
                  width: boardSize / 8,
                  height: boardSize / 8,
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

            {replyMark && replyMarkStyle && (
              <div
                style={{
                  position: 'absolute',
                  pointerEvents: 'none',
                  left: replyMarkStyle.left,
                  top: replyMarkStyle.top,
                  width: replyMarkStyle.width,
                  height: replyMarkStyle.height,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: boardSize / 10.2,
                  lineHeight: 1,
                  userSelect: 'none',
                  textShadow: '0 2px 4px rgba(0,0,0,0.35)',
                  zIndex: 25,
                }}
              >
                {replyMark.piece}
              </div>
            )}
          </div>
        </div>

        <div
          onMouseDown={() => setIsDragging(true)}
          onMouseEnter={() => setIsHandleHovered(true)}
          onMouseLeave={() => setIsHandleHovered(false)}
          style={{
            width: 18,
            height: boardSize,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'col-resize',
            background: handleActive ? 'rgba(255,255,255,0.05)' : 'transparent',
            transition: 'background 0.15s ease',
            position: 'relative',
          }}
          title="Drag to resize"
        >
          <div
            style={{
              width: handleActive ? 16 : 14,
              height: handleActive ? 88 : 64,
              borderRadius: 999,
              background: handleActive ? '#5a534f' : '#3f3a37',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#e4e4e4',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 1,
              boxShadow: handleActive
                ? '0 0 0 1px rgba(255,255,255,0.12), 0 0 16px rgba(0,0,0,0.25)'
                : '0 0 0 1px rgba(255,255,255,0.05)',
              transform: handleActive ? 'scale(1.03)' : 'scale(1)',
              transition: 'all 0.15s ease',
            }}
          >
            ⇆
          </div>
        </div>

        <div
          style={{
            width: 340,
            minHeight: boardSize,
            background: '#2f2b29',
            borderRadius: 6,
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.04)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: 18,
              background: '#4a4441',
              fontSize: 20,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: 3,
                background: sideSquareColor,
                border: '2px solid #888',
              }}
            />
            {phase === 'finished' ? sideToMoveText : `${sideToMoveText} to Move`}
          </div>

          <div
            style={{
              padding: '12px 16px',
              background: '#1f1d1c',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              fontSize: 14,
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>{currentPuzzle?.theme || 'mate in 1'}</span>
            <span>
              {Math.min(currentIndex + 1, puzzles.length)} / {puzzles.length}
            </span>
          </div>

          <div
            style={{
              padding: 20,
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            {loadError && (
              <div
                style={{
                  background: '#46302f',
                  color: '#ffd6d3',
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                {loadError}
              </div>
            )}

            <div
              style={{
                background: '#1f1d1c',
                borderRadius: 8,
                padding: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 14,
                  color: '#d9d9d9',
                  fontWeight: 700,
                }}
              >
                <span>Chunk mastery</span>
                <span>
                  {totalFastSolves} / {currentChunkTarget}
                </span>
              </div>

              <div
                style={{
                  height: 14,
                  background: '#3f3a37',
                  borderRadius: 999,
                  overflow: 'hidden',
                  boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05)',
                }}
              >
                <div
                  style={{
                    width: mainProgressWidth,
                    height: '100%',
                    background: '#8bc34a',
                    transition: 'width 0.25s ease',
                  }}
                />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 13,
                  color: '#bdbdbd',
                }}
              >
                <span>{chunkPercent}% mastered</span>
                <span>{masteredPuzzleCount} / {puzzles.length} puzzles at 5/5</span>
              </div>
            </div>

            <div
              style={{
                background: '#1f1d1c',
                borderRadius: 8,
                padding: 14,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div
                style={{
                  fontSize: 14,
                  color: '#d9d9d9',
                  fontWeight: 700,
                }}
              >
                This puzzle
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                {Array.from({ length: FAST_SOLVES_TO_MASTER }).map((_, i) => {
                  const filled = i < currentPuzzleFastSolves
                  return (
                    <div
                      key={i}
                      style={{
                        flex: 1,
                        height: 12,
                        borderRadius: 999,
                        background: filled ? '#8bc34a' : '#4b4744',
                      }}
                    />
                  )
                })}
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 13,
                  color: '#bdbdbd',
                }}
              >
                <span>
                  {currentPuzzleFastSolves} / {FAST_SOLVES_TO_MASTER} fast solves
                </span>
                <span>Fast = ≤ {fastThresholdForCurrentPuzzle}s</span>
              </div>
            </div>

            <div
              style={{
                textAlign: 'center',
                fontSize: 28,
                color: '#f2c14e',
                fontWeight: 700,
              }}
            >
              🔥 {totalFastSolves}
            </div>

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

            <div
              style={{
                textAlign: 'center',
                fontSize: 16,
                fontWeight: 700,
                minHeight: 24,
              }}
            >
              {message}
            </div>

            <div
              style={{
                background: '#1f1d1c',
                borderRadius: 8,
                padding: 14,
                fontSize: 14,
                lineHeight: 1.5,
                color: '#d9d9d9',
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                {currentPuzzle?.label || 'Puzzle'}
              </div>
              <div>Category: Mates</div>
              <div>Theme: {currentPuzzle?.theme || 'mate in 1'}</div>
              <div>Puzzle ID: {currentPuzzle?.id || '-'}</div>
              <div>User moves: {currentPuzzle?.userMoveCount || 1}</div>
              <div>
                Reply moves available: {Math.max((currentPuzzle?.fullSolution.length || 2) - 2, 0)}
              </div>
              <div>Chunk: {currentChunkIndex + 1} / {chunkFiles.length}</div>
              {showHint && phase !== 'finished' && (
                <div style={{ marginTop: 10, color: '#f2c14e' }}>Hint shown on board</div>
              )}
            </div>

            <div style={{ marginTop: 'auto', display: 'flex', gap: 10 }}>
              {!solved && phase !== 'finished' && (
                <button
                  onClick={() => setShowHint((v) => !v)}
                  disabled={boardLocked}
                  style={{
                    flex: 1,
                    border: 'none',
                    borderRadius: 10,
                    padding: '16px 18px',
                    background: boardLocked ? '#2e2a28' : '#3b3734',
                    color: boardLocked ? '#8f8a86' : 'white',
                    fontSize: 18,
                    fontWeight: 700,
                    cursor: boardLocked ? 'default' : 'pointer',
                  }}
                >
                  💡 Hint
                </button>
              )}

              <button
                onClick={goToNextPuzzle}
                style={{
                  flex: 1,
                  border: 'none',
                  borderRadius: 10,
                  padding: '16px 18px',
                  background: '#7fa650',
                  color: 'white',
                  fontSize: 18,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {allPuzzlesMastered()
                  ? currentChunkIndex < chunkFiles.length - 1
                    ? 'Next Chunk'
                    : 'Finish'
                  : 'Next Puzzle'}
              </button>
            </div>
          </div>

          <div
            style={{
              padding: '12px 16px',
              background: '#1f1d1c',
              borderTop: '1px solid rgba(255,255,255,0.04)',
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 13,
              color: '#cfcfcf',
            }}
          >
            <span>Lichess Chunk</span>
            <span>{boardSize}px</span>
          </div>
        </div>

        {isDragging && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              cursor: 'col-resize',
              zIndex: 999,
            }}
          />
        )}
      </div>
    </div>
  )
}