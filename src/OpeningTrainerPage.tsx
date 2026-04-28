import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Chess, Move } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { supabase } from './lib/supabase'
import { useRegisterPlayableBoard } from './hooks/useRegisterPlayableBoard'
import { loadTrainingProgressMap, saveTrainingProgress } from './lib/trainingProgress'

type OpeningLine = {
  id: string
  slug?: string
  name: string
  family?: string | null
  variation?: string | null
  subvariation?: string | null
  eco?: string | null
  uci_moves?: string[] | null
  san_moves?: string[] | null
  ply_count?: number | null
  final_epd?: string | null
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
const MESSAGE_DELAY_MS = 1000

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

const OPENING_SELECT_FIELDS = `
  id,
  slug,
  name,
  family,
  variation,
  subvariation,
  eco,
  uci_moves,
  san_moves,
  ply_count,
  final_epd
`

const OPENING_CACHE_PREFIX = 'opening_line_cache:'

function getOpeningCacheKey(slug: string) {
  return `${OPENING_CACHE_PREFIX}${slug}`
}

function readCachedOpeningBySlug(slug: string): OpeningLine | null {
  try {
    const raw = sessionStorage.getItem(getOpeningCacheKey(slug))
    if (!raw) return null
    return JSON.parse(raw) as OpeningLine
  } catch {
    return null
  }
}

function writeCachedOpening(line: OpeningLine) {
  if (!line.slug) return

  try {
    sessionStorage.setItem(getOpeningCacheKey(line.slug), JSON.stringify(line))
  } catch {
    // Ignore storage failures; Supabase fetch still works.
  }
}

async function prefetchOpeningBySlug(slug: string) {
  const cached = readCachedOpeningBySlug(slug)
  if (cached) return cached

  const { data, error } = await supabase
    .from('opening_lines')
    .select(OPENING_SELECT_FIELDS)
    .eq('slug', slug)
    .limit(1)
    .maybeSingle()

  if (error || !data) return null

  const line = { ...data } as OpeningLine
  writeCachedOpening(line)
  return line
}

function emptyParsed() {
  return {
    moves: [] as ParsedMove[],
    positionsBeforeEachPly: [new Chess().fen()],
    totalPlies: 0,
    totalFullMoves: 0,
    hasValidLine: false,
  }
}

function parseOpeningLine(line: OpeningLine) {
  const uciMoves = Array.isArray(line.uci_moves) ? line.uci_moves : []
  const sanMoves = Array.isArray(line.san_moves) ? line.san_moves : []

  if (!uciMoves.length) {
    return emptyParsed()
  }

  const replay = new Chess()
  const parsedMoves: ParsedMove[] = []
  const positionsBeforeEachPly: string[] = [replay.fen()]

  for (let i = 0; i < uciMoves.length; i += 1) {
    const uci = (uciMoves[i] || '').trim()
    if (!uci || uci.length < 4) {
      return emptyParsed()
    }

    const from = uci.slice(0, 2)
    const to = uci.slice(2, 4)
    const promotion = uci.length >= 5 ? uci[4] : undefined

    const move = replay.move({
      from,
      to,
      promotion,
    }) as ParsedMove | null

    if (!move) {
      return emptyParsed()
    }

    if (sanMoves[i]) {
      move.san = sanMoves[i]
    }

    parsedMoves.push(move)
    positionsBeforeEachPly.push(replay.fen())
  }

  const totalPlies = parsedMoves.length
  const totalFullMoves = Math.ceil(totalPlies / 2)

  return {
    moves: parsedMoves,
    positionsBeforeEachPly,
    totalPlies,
    totalFullMoves,
    hasValidLine: true,
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
    const endPly = Math.min(endFullMove * 2, positionsBeforeEachPly.length - 1) - 1

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
      const endPly = Math.min(end * 2, positionsBeforeEachPly.length - 1) - 1

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
    endPly: positionsBeforeEachPly.length - 2,
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


function inferOpeningSide(line: OpeningLine | null): 'white' | 'black' {
  if (!line) return 'white'

  const text = [line.name, line.family, line.variation, line.subvariation]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  const blackOpeningWords = [
    'defense',
    'defence',
    'sicilian',
    'french',
    'caro-kann',
    'caro kann',
    'pirc',
    'modern defense',
    'modern defence',
    'alekhine',
    'scandinavian',
    'center counter',
    'centre counter',
    'philidor',
    'petrov',
    'petroff',
    'russian game',
    'owen',
    'nimzowitsch defense',
    'nimzowitsch defence',
    'hippopotamus',
    'benoni',
    'benko',
    'budapest',
    'gruenfeld',
    'grünfeld',
    'king\'s indian',
    'queen\'s indian',
    'nimzo-indian',
    'nimzo indian',
    'bogo-indian',
    'bogo indian',
    'dutch defense',
    'dutch defence',
    'old indian',
  ]

  return blackOpeningWords.some((word) => text.includes(word)) ? 'black' : 'white'
}

function parseSideParam(value: string | null): 'white' | 'black' | null {
  if (value === 'white' || value === 'black') return value
  return null
}

async function loadOpeningProgress(openingTheme: string) {
  return loadTrainingProgressMap('openings', openingTheme)
}

async function saveStageProgress(openingTheme: string, stageId: string, mastery: number) {
  const sr = calculateNextReview(mastery)

  await saveTrainingProgress({
    course: 'openings',
    theme: openingTheme,
    itemId: stageId,
    mastery: Math.max(0, Math.min(REQUIRED_FAST_RUNS, mastery)),
    nextReviewAt: sr.next_review_at,
    reviewCount: sr.review_count,
    intervalDays: sr.interval_days,
  })
}

async function fetchOpeningByRouteParam(rawOpeningId: string): Promise<OpeningLine> {
  const decoded = decodeURIComponent(rawOpeningId).trim()
  const cached = readCachedOpeningBySlug(decoded)

  if (cached) return cached

  const { data, error } = await supabase
    .from('opening_lines')
    .select(OPENING_SELECT_FIELDS)
    .eq('slug', decoded)
    .limit(1)
    .maybeSingle()

  if (error) {
    throw new Error(`opening_lines slug query failed: ${error.message}`)
  }

  if (!data) {
    throw new Error(`No opening found for slug: ${decoded}`)
  }

  const line = { ...data } as OpeningLine
  writeCachedOpening(line)
  return line
}

export default function OpeningTrainerPage() {
  const { openingId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const familySlug = searchParams.get('family')
  const sideOverride = parseSideParam(searchParams.get('side'))

  const [openingRecord, setOpeningRecord] = useState<OpeningLine | null>(null)
  const [openingLoading, setOpeningLoading] = useState(true)
  const [openingError, setOpeningError] = useState('')

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
    if (!openingRecord) return emptyParsed()
    return parseOpeningLine(openingRecord)
  }, [openingRecord])

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
  const [fullLineVisible, setFullLineVisible] = useState(false)
  const [hasFirstSuccessInStage, setHasFirstSuccessInStage] = useState(false)
  const [status, setStatus] = useState('Play the opening moves exactly.')
  const [flash, setFlash] = useState<'idle' | 'good' | 'bad' | 'slow' | 'mastered'>('idle')
  const [openingMastered, setOpeningMastered] = useState(false)
  const [stageProgressMap, setStageProgressMap] = useState<Record<string, number>>({})
  const [progressReady, setProgressReady] = useState(false)
  const [familyLineIndex, setFamilyLineIndex] = useState<number | null>(null)
  const [familyLineTotal, setFamilyLineTotal] = useState<number | null>(null)

  function getLegalTargets(fromSquare: string) {
    if (!parsed.hasValidLine) return []
    if (!progressReady) return []
    if (openingMastered) return []
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
    if (!parsed.hasValidLine) return
    if (!progressReady) return
    if (openingMastered) return
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

    async function loadOpening() {
      setOpeningError('')

      if (!openingId?.trim()) {
        if (!cancelled) {
          setOpeningRecord(null)
          setOpeningError('Missing route param: openingId')
          setOpeningLoading(false)
        }
        return
      }

      const decodedOpeningId = decodeURIComponent(openingId).trim()
      const cachedOpening = readCachedOpeningBySlug(decodedOpeningId)

      if (cachedOpening) {
        if (!cancelled) {
          setOpeningRecord(cachedOpening)
          setOpeningLoading(false)
        }
        return
      }

      setOpeningLoading(true)
      setOpeningRecord(null)

      try {
        const loadedOpening = await fetchOpeningByRouteParam(openingId)
        if (cancelled) return
        setOpeningRecord(loadedOpening)
      } catch (error) {
        console.error('Failed to load opening:', error)
        if (!cancelled) {
          setOpeningError(errorMessage(error))
        }
      } finally {
        if (!cancelled) {
          setOpeningLoading(false)
        }
      }
    }

    void loadOpening()

    return () => {
      cancelled = true
    }
  }, [openingId])

  useEffect(() => {
    if (!openingRecord) return
    setBoardOrientation(sideOverride ?? inferOpeningSide(openingRecord))
  }, [openingRecord, sideOverride])

  useEffect(() => {
    let cancelled = false

    async function loadFamilyLinePosition() {
      setFamilyLineIndex(null)
      setFamilyLineTotal(null)

      if (!openingRecord?.slug || !openingRecord.family) return

      const { data, error } = await supabase
        .from('opening_lines')
        .select('slug')
        .eq('family', openingRecord.family)
        .not('slug', 'is', null)
        .order('name', { ascending: true })

      if (cancelled) return

      if (error) {
        console.error('family line position error', error)
        return
      }

      const lines = (data ?? []).filter((line: { slug?: string | null }) => Boolean(line.slug))
      const index = lines.findIndex(
        (line: { slug?: string | null }) => line.slug === openingRecord.slug,
      )

      setFamilyLineTotal(lines.length)
      setFamilyLineIndex(index >= 0 ? index + 1 : null)
    }

    void loadFamilyLinePosition()

    return () => {
      cancelled = true
    }
  }, [openingRecord?.slug, openingRecord?.family])

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
  const fullLineRows = useMemo(
    () => getStageMoveRows(parsed.moves, 0, Math.max(0, parsed.moves.length - 1)),
    [parsed.moves],
  )

  const stagePlyCount = Math.max(0, stage.endPly - stage.startPly + 1)
  const fastLimitMs = Math.max(1000, stagePlyCount * MS_PER_MOVE)

  const openingTheme = openingRecord
    ? `opening:${openingRecord.slug || openingRecord.id}`
    : ''

  const topPlayer =
    boardOrientation === 'white'
      ? {
          name: 'Black',
          side: 'Black',
          meta: openingRecord?.eco || '—',
        }
      : {
          name: 'White',
          side: 'White',
          meta: openingRecord?.family || '—',
        }

  const bottomPlayer =
    boardOrientation === 'white'
      ? {
          name: 'White',
          side: 'White',
          meta: openingRecord?.family || '—',
        }
      : {
          name: 'Black',
          side: 'Black',
          meta: openingRecord?.eco || '—',
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
      setStatus(parsed.hasValidLine ? 'Play the opening moves exactly.' : 'Opening line missing.')
      setFlash('idle')
      setOpeningMastered(false)
      setStageProgressMap({})
      setProgressReady(false)

      if (!openingTheme || !parsed.hasValidLine || stages.length === 0) {
        if (!cancelled) setProgressReady(true)
        return
      }

      const progressMap = await loadOpeningProgress(openingTheme)
      if (cancelled) return

      setStageProgressMap(progressMap)

      const allMastered = stages.every((s) => (progressMap[s.id] ?? 0) >= REQUIRED_FAST_RUNS)

      if (allMastered) {
        setOpeningMastered(true)
        setFlash('mastered')
        setStatus(familySlug ? 'Loading next opening...' : 'opening mastered')
        setProgressReady(true)

        if (familySlug) {
          await prefetchNextOpeningInFamily()
          void goToNextOpeningInFamily()
        }

        return
      }

      const firstIncompleteIndex = stages.findIndex(
        (s) => (progressMap[s.id] ?? 0) < REQUIRED_FAST_RUNS,
      )

      const resumeIndex = firstIncompleteIndex >= 0 ? firstIncompleteIndex : Math.max(0, stages.length - 1)

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
      setStatus(parsed.hasValidLine ? 'Play the opening moves exactly.' : 'Opening line missing.')
      setFlash('idle')
      setOpeningMastered(false)
      setProgressReady(true)
    }

    void bootProgress()

    return () => {
      cancelled = true
    }
  }, [openingTheme])

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
    setStatus(parsed.hasValidLine ? 'Play the opening moves exactly.' : 'Opening line missing.')
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
    setOpeningMastered(false)
    void saveStageProgress(openingTheme, stage.id, 0)
    beginStageRun()
  }


  async function manualGoToPreviousOpening() {
    clearTimers()

    if (!openingRecord?.slug || !openingRecord.family) {
      setOpeningMastered(false)
      setFlash('bad')
      setStatus('No previous opening found.')
      return
    }

    setOpeningMastered(true)
    setFlash('mastered')
    setStatus('Loading previous opening...')

    const { data, error } = await supabase
      .from('opening_lines')
      .select('slug, name, family')
      .eq('family', openingRecord.family)
      .not('slug', 'is', null)
      .order('name', { ascending: true })

    if (error || !data?.length) {
      console.error(error)
      setOpeningMastered(false)
      setFlash('bad')
      setStatus('No previous opening found.')
      return
    }

    const lines = data.filter((line: { slug?: string | null }) => Boolean(line.slug))
    const currentIndex = lines.findIndex(
      (line: { slug?: string | null }) => line.slug === openingRecord.slug,
    )

    const previousLine =
      currentIndex >= 0
        ? lines[(currentIndex - 1 + lines.length) % lines.length]
        : lines.find((line: { slug?: string | null }) => line.slug !== openingRecord.slug)

    if (!previousLine?.slug || previousLine.slug === openingRecord.slug) {
      setOpeningMastered(false)
      setFlash('bad')
      setStatus('No previous opening found.')
      return
    }

    await prefetchOpeningBySlug(previousLine.slug)
    const familyParam = familySlug ? `?family=${encodeURIComponent(familySlug)}` : ''
    navigate(`/openings/${previousLine.slug}${familyParam}`)
  }

  async function manualGoToNextOpening() {
    clearTimers()

    if (!openingRecord?.slug || !openingRecord.family) {
      setOpeningMastered(false)
      setFlash('bad')
      setStatus('No next opening found.')
      return
    }

    setOpeningMastered(true)
    setFlash('mastered')
    setStatus('Loading next opening...')

    const { data, error } = await supabase
      .from('opening_lines')
      .select('slug, name, family')
      .eq('family', openingRecord.family)
      .not('slug', 'is', null)
      .order('name', { ascending: true })

    if (error || !data?.length) {
      console.error(error)
      setOpeningMastered(false)
      setFlash('bad')
      setStatus('No next opening found.')
      return
    }

    const lines = data.filter((line: { slug?: string | null }) => Boolean(line.slug))
    const currentIndex = lines.findIndex(
      (line: { slug?: string | null }) => line.slug === openingRecord.slug,
    )

    const nextLine =
      currentIndex >= 0
        ? lines[(currentIndex + 1) % lines.length]
        : lines.find((line: { slug?: string | null }) => line.slug !== openingRecord.slug)

    if (!nextLine?.slug || nextLine.slug === openingRecord.slug) {
      setOpeningMastered(false)
      setFlash('bad')
      setStatus('No next opening found.')
      return
    }

    await prefetchOpeningBySlug(nextLine.slug)
    const familyParam = familySlug ? `?family=${encodeURIComponent(familySlug)}` : ''
    navigate(`/openings/${nextLine.slug}${familyParam}`)
  }

  async function prefetchNextOpeningInFamily() {
    if (!familySlug || !openingRecord?.slug) return

    const { data: authData } = await supabase.auth.getUser()
    const userId = authData.user?.id
    if (!userId) return

    const { data: dueData, error: dueError } = await supabase.rpc(
      'get_due_openings_in_family',
      {
        p_user_id: userId,
        p_family_slug: familySlug,
      },
    )

    if (!dueError) {
      const dueOpenings = Array.isArray(dueData) ? dueData : []
      const nextDueOpening = dueOpenings.find(
        (row: { slug?: string | null }) => row.slug && row.slug !== openingRecord.slug,
      )

      if (nextDueOpening?.slug) {
        await prefetchOpeningBySlug(nextDueOpening.slug)
        return
      }
    }

    const { data, error } = await supabase.rpc('get_next_unmastered_opening_in_family', {
      p_user_id: userId,
      p_family_slug: familySlug,
      p_current_slug: openingRecord.slug,
    })

    if (error) return

    const nextSlug = data?.[0]?.slug
    if (nextSlug) {
      await prefetchOpeningBySlug(nextSlug)
    }
  }

  async function goToNextOpeningInFamily() {
    if (!familySlug || !openingRecord?.slug) {
      setOpeningMastered(true)
      setFlash('mastered')
      setStatus('opening mastered')
      return
    }

    const { data: authData } = await supabase.auth.getUser()
    const userId = authData.user?.id

    if (!userId) {
      setOpeningMastered(true)
      setFlash('mastered')
      setStatus('sign in to continue')
      return
    }

    const { data: dueData, error: dueError } = await supabase.rpc(
      'get_due_openings_in_family',
      {
        p_user_id: userId,
        p_family_slug: familySlug,
      },
    )

    if (dueError) {
      console.error('due openings error', dueError)
      setOpeningMastered(true)
      setFlash('mastered')
      setStatus('review lookup failed')
      return
    }

    const dueOpenings = Array.isArray(dueData) ? dueData : []
    const nextDueOpening = dueOpenings.find(
      (row: { slug?: string | null }) => row.slug && row.slug !== openingRecord.slug,
    )

    if (nextDueOpening?.slug) {
      await prefetchOpeningBySlug(nextDueOpening.slug)
      navigate(`/openings/${nextDueOpening.slug}?family=${familySlug}`)
      return
    }

    const { data, error } = await supabase.rpc('get_next_unmastered_opening_in_family', {
      p_user_id: userId,
      p_family_slug: familySlug,
      p_current_slug: openingRecord.slug,
    })

    if (error) {
      console.error(error)
      setOpeningMastered(true)
      setFlash('mastered')
      setStatus('opening mastered')
      return
    }

    const nextSlug = data?.[0]?.slug

    if (!nextSlug) {
      setOpeningMastered(true)
      setFlash('mastered')
      setStatus('family mastered')
      return
    }

    await prefetchOpeningBySlug(nextSlug)
    navigate(`/openings/${nextSlug}?family=${familySlug}`)
  }

  function moveToNextStage() {
    clearTimers()

    const isLastStage = safeStageIndex >= stages.length - 1
    if (isLastStage) {
      void goToNextOpeningInFamily()
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
    setStatus('Play the opening moves exactly.')
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

  function completeRun(startedAtOverride?: number) {
    const effectiveStartAt = startedAtOverride ?? runStartAt
    const finishedMs = effectiveStartAt == null ? elapsedMs : Date.now() - effectiveStartAt

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
      void saveStageProgress(openingTheme, stage.id, nextFastSuccesses)

      if (nextFastSuccesses >= REQUIRED_FAST_RUNS) {
        const isFinal = safeStageIndex === stages.length - 1

        if (isFinal) {
          setOpeningMastered(true)
          setFlash('mastered')
          setStatus('Great. Loading next opening...')
          void prefetchNextOpeningInFamily()

          nextStageTimeoutRef.current = window.setTimeout(() => {
            void goToNextOpeningInFamily()
          }, MESSAGE_DELAY_MS)

          return
        }

        setStatus(`Stage ${stage.startFullMove}-${stage.endFullMove} cleared.`)
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
    if (!parsed.hasValidLine) return false
    if (!progressReady) return false
    if (openingMastered) return false
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
    const nextPly = currentPly + 1
    const isStageComplete = nextPly > stage.endPly

    const startedAt = runStartAt ?? Date.now()

    if (runStartAt == null) {
      setRunStartAt(startedAt)
      setElapsedMs(0)
    }

    setSelectedSquare(null)
    setPosition(nextFen)
    setCurrentPly(nextPly)

    if (isStageComplete) {
      setStatus('Stage complete.')
      setFlash('good')

      window.setTimeout(() => {
        completeRun(startedAt)
      }, 120)
    } else {
      setStatus('Correct. Keep going.')
      setFlash('idle')
    }

    return true
  }

  // Do not auto-reset on stage changes.
  // Each stage transition sets its own board state in moveToNextStage().

  useRegisterPlayableBoard({
    fen: position,
    orientation: boardOrientation,
    setOrientation: setBoardOrientation,
    suggestedColor: boardOrientation,
    canFlip: true,
  })

  if (openingLoading) {
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
        Loading opening...
      </div>
    )
  }

  if (openingError || !openingRecord) {
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
        <div style={{ fontSize: 24, fontWeight: 800, marginBottom: 12 }}>Failed to load opening</div>
        <div style={{ color: '#ffb4b4' }}>{openingError || 'Opening not found'}</div>
        <div style={{ marginTop: 14, color: '#c9c9c9', fontSize: 13 }}>
          route param: {openingId || '(missing)'}
        </div>
      </div>
    )
  }

  if (!parsed.hasValidLine) {
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
          {openingRecord.name}
        </div>
        <div style={{ fontSize: 16, color: '#d0d0d0', marginBottom: 8 }}>
          This route is working, but this opening does not yet have a valid move line.
        </div>
        <div style={{ fontSize: 14, color: '#b8b8b8' }}>
          Check <code>uci_moves</code> in <code>opening_lines</code>.
        </div>
      </div>
    )
  }

  const currentExpected = parsed.moves[currentPly]
  const totalStages = stages.length
  const stageNumber = safeStageIndex + 1
  const lineProgressLabel =
    familyLineIndex != null && familyLineTotal != null && familyLineTotal > 0
      ? `Line ${familyLineIndex} / ${familyLineTotal}`
      : 'Line —'
  const stageProgressLabel = `Stage ${stageNumber} / ${totalStages}`
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
            marginBottom: 14,
            padding: '14px 18px',
            borderRadius: 16,
            background: '#2a2523',
            border: '1px solid rgba(255,255,255,0.06)',
            maxWidth: 900,
          }}
        >
          <div
            style={{
              fontSize: 26,
              fontWeight: 800,
              color: '#f3f3f3',
              marginBottom: 6,
            }}
          >
            {openingRecord.name}
          </div>

          <div
            style={{
              fontSize: 13,
              color: '#b8b8b8',
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <span>{openingRecord.family || '—'}</span>
            <span>•</span>
            <span>{openingRecord.eco || '—'}</span>

            {openingRecord.variation && (
              <>
                <span>•</span>
                <span>{openingRecord.variation}</span>
              </>
            )}

            {openingRecord.subvariation && (
              <>
                <span>•</span>
                <span>{openingRecord.subvariation}</span>
              </>
            )}
          </div>
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
                id="opening-trainer-board"
                position={position}
                onPieceDrop={onPieceDrop}
                onSquareClick={onSquareClick}
                boardWidth={boardSize}
                boardOrientation={boardOrientation}
                arePiecesDraggable={!openingMastered && progressReady}
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
                  Opening Line Replay
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
                <div style={{ color: '#e6e6e6', fontWeight: 700, minWidth: 0 }}>
                  {openingRecord.name}
                </div>
                <div
                  style={{
                    color: '#d3d3d3',
                    textAlign: 'right',
                    flexShrink: 0,
                    lineHeight: 1.35,
                  }}
                >
                  <div>{lineProgressLabel}</div>
                  <div style={{ color: '#aaa', fontSize: 12 }}>{stageProgressLabel}</div>
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
                <div>{openingRecord.family || 'Unknown family'}</div>
                <div>{openingRecord.eco || '—'}</div>
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
                <div style={{ color: '#dcdcdc', fontWeight: 700 }}>{stageProgressLabel}</div>
                <div style={{ color: '#f1f1f1', fontWeight: 700 }}>
                  Moves {stage.startFullMove}-{stage.endFullMove}
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
                  ? 'Play the full line'
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
                  {fullLineVisible ? 'Full line' : showMoveList ? 'Current stage moves' : 'Moves hidden'}
                </div>

                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {notationHidden && !hintVisible ? (
                    <button
                      onClick={() => {
                        setHintVisible(true)
                        setFullLineVisible(false)
                      }}
                      style={{
                        background: '#6d5a2c',
                        color: '#fff4cf',
                        border: 'none',
                        borderRadius: 8,
                        padding: '6px 9px',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      Hint
                    </button>
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
                      padding: '6px 9px',
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

            <div style={{ ...panelCardStyle(), marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                Opening info
              </div>
              <div style={{ fontSize: 12, color: '#d0d0d0', lineHeight: 1.55 }}>
                <div>Family: {openingRecord.family || '—'}</div>
                <div>Variation: {openingRecord.variation || '—'}</div>
                <div>Subvariation: {openingRecord.subvariation || '—'}</div>
                <div>ECO: {openingRecord.eco || '—'}</div>
                <div>Ply count: {openingRecord.ply_count || parsed.totalPlies || '—'}</div>
              </div>
            </div>

            <div style={{ ...panelCardStyle(), marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                Next expected move
              </div>
              <div style={{ fontSize: 12, color: '#d0d0d0' }}>
                {notationHidden && !hintVisible && !fullLineVisible
                  ? 'Hidden during memory runs.'
                  : currentPly > stage.endPly
                    ? 'Stage complete.'
                    : currentExpected
                      ? currentExpected.san
                      : '—'}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button
                onClick={manualGoToPreviousOpening}
                style={{
                  background: '#4c4744',
                  color: '#f3f3f3',
                  border: 'none',
                  borderRadius: 10,
                  padding: '13px 10px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Previous Opening
              </button>

              <button
                onClick={manualGoToNextOpening}
                style={{
                  background: '#6f8f3e',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  padding: '13px 10px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Next Opening
              </button>

              <button
                onClick={beginStageRun}
                style={{
                  background: '#4c4744',
                  color: '#f3f3f3',
                  border: 'none',
                  borderRadius: 10,
                  padding: '13px 10px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Restart Run
              </button>

              <button
                onClick={resetWholeStageProgress}
                style={{
                  background: '#88a94f',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  padding: '13px 10px',
                  fontSize: 13,
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
              {openingRecord.id}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}