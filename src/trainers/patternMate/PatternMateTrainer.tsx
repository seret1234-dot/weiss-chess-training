import { updateCategoryStats } from '../../training/updateCategoryStats'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Chess } from 'chess.js'
import type { Square } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { supabase } from '../../lib/supabase'
import {
  saveTrainingProgress,
  loadTrainingProgressMap,
} from '../../lib/trainingProgress'
import { useRegisterPlayableBoard } from '../../hooks/useRegisterPlayableBoard'
import { useAnimatedReplies } from '../../hooks/useAnimatedReplies'
import { useSearchParams } from 'react-router-dom'
import TrainerShell from '../../components/trainer/TrainerShell'
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

export type PatternMatePuzzle = {
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
}

type PuzzleMastery = {
  fastSolves: number
}

type Phase = 'loading' | 'solving' | 'correct' | 'wrong' | 'finished'

export type PatternMateTrainerConfig = {
  trainerKey: string
  trainerTitle: string
  dataBasePath: string
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

const AUTO_NEXT_DELAY_MS = 1500
const BOARD_ANIMATION_MS = 140
const REPLY_PAUSE_AFTER_MS = 80
const PREMOVE_START_DELAY_MS = 800
const PREMOVE_AFTER_PLAY_DELAY_MS = 1000

type SavedState = {
  currentChunkIndex: number
  currentPuzzleIndex: number
  chunkProgressByFile: Record<string, number[]>
}

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
  if (!input) return 'mate'
  return input.replace(/_/g, ' ')
}

function normalizePuzzle(
  raw: LichessChunkPuzzle,
  index: number
): PatternMatePuzzle | null {
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
      : normalizeThemeName(raw.subtheme || raw.Themes || 'mate'),
    fen,
    preMove: raw.preMove,
    solutionLine,
    userMoveIndexes,
    chunkNumber,
    chunkIndex,
    rating: raw.rating,
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
  return `pattern_mate_progress_${trainerKey}_v1`
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

function getUserMoveCount(puzzle?: PatternMatePuzzle | null) {
  return puzzle?.userMoveIndexes.length ?? 1
}

function getExpectedUserMove(
  puzzle: PatternMatePuzzle | undefined,
  solvedUserMoveCount: number
) {
  if (!puzzle) return null
  const lineIndex = puzzle.userMoveIndexes[solvedUserMoveCount]
  if (lineIndex == null) return null
  return puzzle.solutionLine[lineIndex] ?? null
}

function getRemainingLineAfterSolvedUserMoves(
  puzzle: PatternMatePuzzle | undefined,
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

export default function PatternMateTrainer({
  config,
}: {
  config: PatternMateTrainerConfig
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const autoNextTimerRef = useRef<number | null>(null)
  const wrongMoveTimerRef = useRef<number | null>(null)
  const preMoveTimerRef = useRef<number | null>(null)
  const solveStartedAtRef = useRef<number | null>(null)
  const currentUserMoveIndexRef = useRef(0)

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
  const urlChunkParam = searchParams.get('chunk')
  const forcedChunkIndex =
    urlChunkParam !== null && !isNaN(Number(urlChunkParam))
      ? Math.max(0, Number(urlChunkParam))
      : null

  const manifestFetchPath = `${config.dataBasePath}/manifest.json`
  const storageKey = getStorageKey(config.trainerKey)

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  const [chunkFiles, setChunkFiles] = useState<string[]>([])
  const [currentChunkIndex, setCurrentChunkIndex] = useState(0)

  const [puzzles, setPuzzles] = useState<PatternMatePuzzle[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)

  const [game, setGame] = useState(new Chess())
  const [message, setMessage] = useState('Loading puzzles...')
  const [phase, setPhase] = useState<Phase>('loading')
  const [solved, setSolved] = useState(false)
  const [showHint, setShowHint] = useState(false)
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

  async function ensureChunkExists(userId: string, chunkNumber = 1) {
    try {
      const { data: existing, error: existingError } = await supabase
        .from('user_chunk_progress')
        .select('chunk_index')
        .eq('user_id', userId)
        .eq('trainer_key', config.trainerKey)
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
          trainer_key: config.trainerKey,
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
          trainerKey: config.trainerKey,
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
  ) {
    try {
      const nowIso = new Date().toISOString()
      const chunkNumber = chunkIndexZeroBased + 1

      const { error } = await supabase.from('user_chunk_progress').upsert({
        user_id: userId,
        trainer_key: config.trainerKey,
        chunk_index: chunkNumber,
        mastered_puzzles_count: masteredCount,
        is_mastered: true,
        mastered_at: nowIso,
        last_reviewed_at: nowIso,
        updated_at: nowIso,
      })

      if (error) {
        console.error('Could not mark chunk mastered', error)
        return
      }

      console.log('Chunk mastered:', {
        trainerKey: config.trainerKey,
        chunkIndex: chunkNumber,
        masteredCount,
      })

      const nextChunkNumber = chunkNumber + 1
      if (nextChunkNumber <= chunkFiles.length) {
        await ensureNextChunkExists(userId, nextChunkNumber)
      }
    } catch (error) {
      console.error('Unexpected markChunkMastered error', error)
    }
  }

  useEffect(() => {
    if (!currentUserId) return
    void ensureChunkExists(currentUserId, 1)
  }, [currentUserId, config.trainerKey])

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
    setDisableBoardAnimation(true)
    setGame(nextGame)

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setDisableBoardAnimation(false)
      })
    })
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
      const res = await fetch(`${config.dataBasePath}/${fileName}`)
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const data = (await res.json()) as
        | LichessChunkPuzzle[]
        | { puzzles?: LichessChunkPuzzle[] }
      const rawList = Array.isArray(data) ? data : data.puzzles || []

      const normalized = rawList
        .map((item, index) => normalizePuzzle(item, index))
        .filter(Boolean) as PatternMatePuzzle[]

      if (normalized.length === 0) {
        throw new Error(`No valid puzzles found in ${fileName}`)
      }

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

      const restoredChunkProgress = normalized.map((puzzle, i) => {
        const localValue = savedProgress[i] ?? 0
        const supaValue = supaProgress[puzzle.id] ?? 0

        return {
          fastSolves: Math.max(
            0,
            Math.min(FAST_SOLVES_TO_MASTER, Math.max(localValue, supaValue))
          ),
        }
      })

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
          Math.min(normalized.length - 1, desiredPuzzleIndex)
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
      currentUserMoveIndexRef.current = 0
      setCurrentChunkIndex(chunkIndex)
      setJumpChunkInput(String(chunkIndex + 1))
      setPuzzles(normalized)
      setChunkProgress(restoredChunkProgress)

      const initialPuzzle = normalized[desiredPuzzleIndex]
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
      setGame(new Chess())
      setBoardLocked(true)
      setPhase('finished')
      setDisplayTurn('w')
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

        const saved = getSavedState(storageKey)

        let startChunkIndex: number

        if (forcedChunkIndex !== null) {
          startChunkIndex = Math.max(
            0,
            Math.min(files.length - 1, forcedChunkIndex)
          )
          console.log('Using chunk from AUTO (URL):', startChunkIndex)
        } else {
          startChunkIndex = Math.max(
            0,
            Math.min(files.length - 1, saved.currentChunkIndex ?? 0)
          )

          if (currentUserId) {
            const { data: dueChunk, error: dueChunkError } = await supabase.rpc(
              'get_next_due_chunk',
              {
                p_user_id: currentUserId,
                p_trainer_key: config.trainerKey,
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
    if (!currentUserId) return
    if (puzzles.length === 0) return
    if (chunkProgress.length !== puzzles.length) return

    const allMasteredNow = chunkProgress.every(
      (item) => item.fastSolves >= FAST_SOLVES_TO_MASTER
    )

    if (!allMasteredNow) return

    void markChunkMastered(currentUserId, currentChunkIndex, chunkProgress.length)
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

  function loadPuzzleImmediate(
    puzzle: PatternMatePuzzle,
    index: number,
    nextChunkProgressArg?: PuzzleMastery[],
    nextChunkIndexArg?: number,
    fileNameOverride?: string
  ) {
    clearTimers()

    currentUserMoveIndexRef.current = 0

    const startChess = new Chess(puzzle.fen)

    clearReplyEffects()
    setLastMoveHighlight(null)
    setCorrectSquare(null)
    setSelectedSquare(null)
    setLegalTargets([])
    setSolved(false)
    setShowHint(false)
    setPhase('solving')

    setCurrentIndex(index)
    swapToPuzzlePosition(startChess)
    setDisplayTurn(startChess.turn())

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
          setMessage(`Find the mate in ${getUserMoveCount(puzzle)}`)
          return
        }

        setGame(afterPreMove)
        setDisplayTurn(afterPreMove.turn())
        setLastMoveHighlight(puzzle.preMove!)

        preMoveTimerRef.current = window.setTimeout(() => {
          setBoardLocked(false)
          solveStartedAtRef.current = performance.now()
          setMessage(`Find the mate in ${getUserMoveCount(puzzle)}`)
        }, PREMOVE_AFTER_PLAY_DELAY_MS)
      }, PREMOVE_START_DELAY_MS)

      return
    }

    setBoardLocked(false)
    solveStartedAtRef.current = performance.now()
    setMessage(`Find the mate in ${getUserMoveCount(puzzle)}`)
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

  function completeChunk() {
    window.location.assign('/auto')
  }

  function goToNextPuzzle() {
    const nextChunkProgress = chunkProgress

    const chunkIsMastered =
      nextChunkProgress.length > 0 &&
      nextChunkProgress.every((item) => item.fastSolves >= FAST_SOLVES_TO_MASTER)

    if (chunkIsMastered) {
      completeChunk()
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

    setGame(solvedGame)
    setDisplayTurn(solvedGame.turn())
    setSolved(true)
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
        `Correct — fast solve (${formatSeconds(
          solvedInSeconds!
        )}s • ${nextValue}/${FAST_SOLVES_TO_MASTER})`
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

    if (currentUserId && solveStartedAtRef.current != null) {
      const timeMs = performance.now() - solveStartedAtRef.current
      updateCategoryStats({
        userId: currentUserId,
        category: 'mates',
        wasCorrect: true,
        timeMs,
      })
    }

    config.onPuzzleSolved?.({
      puzzleId: currentPuzzle?.id ?? '',
      wasFast,
      solvedInSeconds,
      course: config.studyCourse,
      theme: config.studyTheme,
    })

    autoNextTimerRef.current = window.setTimeout(() => {
      goToNextPuzzle()
    }, AUTO_NEXT_DELAY_MS)
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

    currentUserMoveIndexRef.current = solvedUserMoveCountAfter

    const autoMoves = getRemainingLineAfterSolvedUserMoves(
      currentPuzzle,
      solvedUserMoveCountAfter
    )

    if (autoMoves.length === 0) {
      setGame(testGame)
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
        setGame(new Chess(nextGame.fen()))
        setDisplayTurn(nextGame.turn())
      },
      onMessage: () => {},
      onDone: (finalGame) => {
        setGame(new Chess(finalGame.fen()))
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

  function attemptUserMove(
    sourceSquare: string,
    targetSquare: string,
    options?: { allowWrongMoveToShow?: boolean }
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
        promotion: expected.promotion,
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
      setPhase('wrong')
      setMessage('Wrong move')

      if (currentUserId && solveStartedAtRef.current != null) {
        const timeMs = performance.now() - solveStartedAtRef.current
        updateCategoryStats({
          userId: currentUserId,
          category: 'mates',
          wasCorrect: false,
          timeMs,
        })
      }

      if (options?.allowWrongMoveToShow) {
        const resetFen = game.fen()

        setGame(testGame)
        setDisplayTurn(testGame.turn())
        setLastMoveHighlight(playedUci)

        wrongMoveTimerRef.current = window.setTimeout(() => {
          const resetGame = new Chess(resetFen)
          setGame(resetGame)
          setDisplayTurn(resetGame.turn())
          setLastMoveHighlight(null)
          setPhase('solving')
          setMessage(`Find the mate in ${getUserMoveCount(currentPuzzle)}`)
        }, 700)

        return true
      }

      wrongMoveTimerRef.current = window.setTimeout(() => {
        setPhase((prev) => (prev === 'wrong' ? 'solving' : prev))
        setMessage((prev) =>
          prev === 'Wrong move'
            ? `Find the mate in ${getUserMoveCount(currentPuzzle)}`
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

  function onDrop(sourceSquare: string, targetSquare: string) {
    return attemptUserMove(sourceSquare, targetSquare, {
      allowWrongMoveToShow: true,
    })
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

    const moveWorked = attemptUserMove(selectedSquare, square)
    if (moveWorked) return

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
  }

  const hintMove = getExpectedUserMove(currentPuzzle, currentUserMoveIndexRef.current)
  const hintArrow =
    showHint && hintMove && !boardLocked
      ? [[hintMove.slice(0, 2), hintMove.slice(2, 4), 'rgb(242, 193, 78)']] as [
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
      subtitle={currentChunkFileName || 'chunk'}
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
          <Chessboard
            id={`${config.trainerKey}-board`}
            position={globalFen}
            boardOrientation={boardOrientation}
            onPieceDrop={onDrop}
            onSquareClick={onSquareClick}
            arePiecesDraggable={!solved && !boardLocked && phase === 'solving'}
            boardWidth={boardSize}
            customPieces={customPieces}
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
          />

          {animatedReply && animatedReplyStyle && (
            <div style={animatedReplyStyle}>
              {renderPieceImage(
                animatedReply.piece,
                animatedReplyStartPos?.squareSize ?? boardSize / 8
              )}
            </div>
          )}

          {correctSquare && correctPos && (
            <div
              style={{
                position: 'absolute',
                pointerEvents: 'none',
                fontSize: boardSize / 12,
                color: '#4caf50',
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
                {currentPuzzle?.theme || 'mate'}
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
              <div>Fast = ≤ {fastThresholdForCurrentPuzzle}s</div>
            </div>
          </PanelCard>

          <BigMessage streak={`🔥 ${totalFastSolves}`} message={message} />

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
              <div>Category: Mates</div>
              <div>Theme: {currentPuzzle?.theme || 'mate'}</div>
              <div>Puzzle ID: {currentPuzzle?.id || '-'}</div>
              <div>User moves: {getUserMoveCount(currentPuzzle)}</div>
              <div>Line length: {currentPuzzle?.solutionLine.length || 0}</div>
              <div>Chunk: {currentChunkIndex + 1} / {chunkFiles.length}</div>
              {showHint && phase !== 'finished' && (
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
                onClick={() => setShowHint((v) => !v)}
                disabled={boardLocked}
              >
                Hint
              </HintButton>
            )}

            <PrimaryButton
              onClick={() => {
                if (allPuzzlesMastered()) {
                  completeChunk()
                } else {
                  goToNextPuzzle()
                }
              }}
            >
              {allPuzzlesMastered() ? 'Continue Auto' : 'Next Puzzle'}
            </PrimaryButton>
          </div>
        </div>
      }
    />
  )
}