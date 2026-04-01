import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent } from 'react'
import { Chessboard } from 'react-chessboard'

type SideMode = 'white' | 'black'
type TrainerMode = 'find-square' | 'name-square' | 'name-color'
type Status = 'idle' | 'correct' | 'wrong' | 'chunk-complete' | 'course-complete'

type Chunk = {
  id: string
  label: string
  phase: string
  squares: string[]
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const
const RANKS = [1, 2, 3, 4, 5, 6, 7, 8] as const
const EVEN_RANKS = [2, 4, 6, 8]
const ODD_RANKS = [1, 3, 5, 7]
const EVEN_FILES = ['a', 'c', 'e', 'g']
const ODD_FILES = ['b', 'd', 'f', 'h']

const FAST_SECONDS = 1.5
const FAST_SOLVES_TO_MASTER = 5

function sq(file: string, rank: number) {
  return `${file}${rank}`
}

function createBlankPosition() {
  return '8/8/8/8/8/8/8/8 w - - 0 1'
}

function formatSeconds(value: number) {
  return value.toFixed(2)
}

function normalizeSquareName(value: string) {
  return value.trim().toLowerCase()
}

function isValidSquareName(value: string) {
  return /^[a-h][1-8]$/.test(normalizeSquareName(value))
}

function getSquareColor(squareName: string) {
  const fileIndex = squareName.charCodeAt(0) - 97
  const rank = Number(squareName[1]) - 1
  return (fileIndex + rank) % 2 === 0 ? 'black' : 'white'
}

function uniqueSquares(items: string[]) {
  return Array.from(new Set(items))
}

function shuffleArray<T>(items: T[]) {
  const arr = [...items]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function pickRandomSquare(pool: string[], exclude?: string | null, weakestSquares?: string[]) {
  let candidates = [...pool]

  if (weakestSquares && weakestSquares.length > 0) {
    candidates = [...weakestSquares]
  }

  if (exclude && candidates.length > 1) {
    const filtered = candidates.filter((item) => item !== exclude)
    if (filtered.length > 0) {
      candidates = filtered
    }
  }

  return candidates[Math.floor(Math.random() * candidates.length)]
}

function getBoardOrientation(side: SideMode) {
  return side === 'white' ? 'white' : 'black'
}

function fileLabel(files: string[]) {
  return files.map((f) => f.toUpperCase()).join('')
}

function rankLabel(ranks: number[]) {
  return ranks.join('')
}

function getProgressKey(mode: TrainerMode, chunkId: string, squareName: string) {
  return `${mode}::${chunkId}::${squareName}`
}

function shouldSkipChunkInNameColor(chunk: Chunk) {
  const label = chunk.label.toLowerCase()
  return label.includes('even') || label.includes('odd')
}

function getVisibleChunks(chunks: Chunk[], trainerMode: TrainerMode) {
  if (trainerMode !== 'name-color') return chunks
  return chunks.filter((chunk) => !shouldSkipChunkInNameColor(chunk))
}

function buildSingleFileChunks(): Chunk[] {
  const chunks: Chunk[] = []

  for (const file of FILES) {
    chunks.push({
      id: `file-single-${file}-even`,
      label: `${file.toUpperCase()} file · even`,
      phase: 'Files · single',
      squares: EVEN_RANKS.map((rank) => sq(file, rank)),
    })

    chunks.push({
      id: `file-single-${file}-odd`,
      label: `${file.toUpperCase()} file · odd`,
      phase: 'Files · single',
      squares: ODD_RANKS.map((rank) => sq(file, rank)),
    })

    chunks.push({
      id: `file-single-${file}-full`,
      label: `${file.toUpperCase()} file · whole`,
      phase: 'Files · single',
      squares: RANKS.map((rank) => sq(file, rank)),
    })
  }

  return chunks
}

function buildFilePairChunks(): Chunk[] {
  const chunks: Chunk[] = []

  for (let i = 0; i < FILES.length; i += 1) {
    for (let j = i + 1; j < FILES.length; j += 1) {
      const group = [FILES[i], FILES[j]]
      chunks.push({
        id: `file-pair-${group.join('')}`,
        label: `Files ${fileLabel(group as unknown as string[])}`,
        phase: 'Files · pairs',
        squares: group.flatMap((file) => RANKS.map((rank) => sq(file, rank))),
      })
    }
  }

  return chunks
}

function buildFileTripletChunks(): Chunk[] {
  const chunks: Chunk[] = []

  for (let i = 0; i <= FILES.length - 3; i += 1) {
    const group = FILES.slice(i, i + 3)
    chunks.push({
      id: `file-triplet-${group.join('')}`,
      label: `Files ${fileLabel(group as unknown as string[])}`,
      phase: 'Files · triplets',
      squares: group.flatMap((file) => RANKS.map((rank) => sq(file, rank))),
    })
  }

  return chunks
}

function buildFileQuadChunks(): Chunk[] {
  const chunks: Chunk[] = []

  for (let i = 0; i <= FILES.length - 4; i += 1) {
    const group = FILES.slice(i, i + 4)
    chunks.push({
      id: `file-quad-${group.join('')}`,
      label: `Files ${fileLabel(group as unknown as string[])}`,
      phase: 'Files · groups of 4',
      squares: group.flatMap((file) => RANKS.map((rank) => sq(file, rank))),
    })
  }

  return chunks
}

function buildSingleRankChunks(): Chunk[] {
  const chunks: Chunk[] = []

  for (const rank of RANKS) {
    chunks.push({
      id: `rank-single-${rank}-even`,
      label: `Rank ${rank} · even files`,
      phase: 'Ranks · single',
      squares: EVEN_FILES.map((file) => sq(file, rank)),
    })

    chunks.push({
      id: `rank-single-${rank}-odd`,
      label: `Rank ${rank} · odd files`,
      phase: 'Ranks · single',
      squares: ODD_FILES.map((file) => sq(file, rank)),
    })

    chunks.push({
      id: `rank-single-${rank}-full`,
      label: `Rank ${rank} · whole`,
      phase: 'Ranks · single',
      squares: FILES.map((file) => sq(file, rank)),
    })
  }

  return chunks
}

function buildRankPairChunks(): Chunk[] {
  const chunks: Chunk[] = []

  for (let i = 0; i < RANKS.length; i += 1) {
    for (let j = i + 1; j < RANKS.length; j += 1) {
      const group = [RANKS[i], RANKS[j]]
      chunks.push({
        id: `rank-pair-${group.join('')}`,
        label: `Ranks ${rankLabel(group as unknown as number[])}`,
        phase: 'Ranks · pairs',
        squares: group.flatMap((rank) => FILES.map((file) => sq(file, rank))),
      })
    }
  }

  return chunks
}

function buildRankTripletChunks(): Chunk[] {
  const chunks: Chunk[] = []

  for (let i = 0; i <= RANKS.length - 3; i += 1) {
    const group = RANKS.slice(i, i + 3)
    chunks.push({
      id: `rank-triplet-${group.join('')}`,
      label: `Ranks ${rankLabel(group as unknown as number[])}`,
      phase: 'Ranks · triplets',
      squares: group.flatMap((rank) => FILES.map((file) => sq(file, rank))),
    })
  }

  return chunks
}

function buildRankQuadChunks(): Chunk[] {
  const chunks: Chunk[] = []

  for (let i = 0; i <= RANKS.length - 4; i += 1) {
    const group = RANKS.slice(i, i + 4)
    chunks.push({
      id: `rank-quad-${group.join('')}`,
      label: `Ranks ${rankLabel(group as unknown as number[])}`,
      phase: 'Ranks · groups of 4',
      squares: group.flatMap((rank) => FILES.map((file) => sq(file, rank))),
    })
  }

  return chunks
}

function buildColorChunks(): Chunk[] {
  const allSquares = FILES.flatMap((file) => RANKS.map((rank) => sq(file, rank)))
  const lightSquares = allSquares.filter((squareName) => getSquareColor(squareName) === 'white')
  const darkSquares = allSquares.filter((squareName) => getSquareColor(squareName) === 'black')
  const queenside = allSquares.filter((squareName) => ['a', 'b', 'c', 'd'].includes(squareName[0]))
  const kingside = allSquares.filter((squareName) => ['e', 'f', 'g', 'h'].includes(squareName[0]))

  return [
    {
      id: 'color-light',
      label: 'Light squares',
      phase: 'Colors',
      squares: lightSquares,
    },
    {
      id: 'color-dark',
      label: 'Dark squares',
      phase: 'Colors',
      squares: darkSquares,
    },
    {
      id: 'color-light-queenside',
      label: 'Light squares · queenside',
      phase: 'Colors',
      squares: lightSquares.filter((squareName) => queenside.includes(squareName)),
    },
    {
      id: 'color-light-kingside',
      label: 'Light squares · kingside',
      phase: 'Colors',
      squares: lightSquares.filter((squareName) => kingside.includes(squareName)),
    },
    {
      id: 'color-dark-queenside',
      label: 'Dark squares · queenside',
      phase: 'Colors',
      squares: darkSquares.filter((squareName) => queenside.includes(squareName)),
    },
    {
      id: 'color-dark-kingside',
      label: 'Dark squares · kingside',
      phase: 'Colors',
      squares: darkSquares.filter((squareName) => kingside.includes(squareName)),
    },
  ]
}

function buildHalfChunks(): Chunk[] {
  const allSquares = FILES.flatMap((file) => RANKS.map((rank) => sq(file, rank)))

  return [
    {
      id: 'half-queenside',
      label: 'Queenside',
      phase: 'Halves',
      squares: allSquares.filter((squareName) => ['a', 'b', 'c', 'd'].includes(squareName[0])),
    },
    {
      id: 'half-kingside',
      label: 'Kingside',
      phase: 'Halves',
      squares: allSquares.filter((squareName) => ['e', 'f', 'g', 'h'].includes(squareName[0])),
    },
    {
      id: 'half-top',
      label: 'Top half',
      phase: 'Halves',
      squares: allSquares.filter((squareName) => ['5', '6', '7', '8'].includes(squareName[1])),
    },
    {
      id: 'half-bottom',
      label: 'Bottom half',
      phase: 'Halves',
      squares: allSquares.filter((squareName) => ['1', '2', '3', '4'].includes(squareName[1])),
    },
  ]
}

function buildQuadrantChunks(): Chunk[] {
  const topLeft = ['a', 'b', 'c', 'd'].flatMap((file) => [5, 6, 7, 8].map((rank) => sq(file, rank)))
  const topRight = ['e', 'f', 'g', 'h'].flatMap((file) => [5, 6, 7, 8].map((rank) => sq(file, rank)))
  const bottomLeft = ['a', 'b', 'c', 'd'].flatMap((file) => [1, 2, 3, 4].map((rank) => sq(file, rank)))
  const bottomRight = ['e', 'f', 'g', 'h'].flatMap((file) => [1, 2, 3, 4].map((rank) => sq(file, rank)))

  return [
    {
      id: 'quadrant-top-left',
      label: 'Top left quadrant',
      phase: 'Quadrants',
      squares: topLeft,
    },
    {
      id: 'quadrant-top-right',
      label: 'Top right quadrant',
      phase: 'Quadrants',
      squares: topRight,
    },
    {
      id: 'quadrant-bottom-left',
      label: 'Bottom left quadrant',
      phase: 'Quadrants',
      squares: bottomLeft,
    },
    {
      id: 'quadrant-bottom-right',
      label: 'Bottom right quadrant',
      phase: 'Quadrants',
      squares: bottomRight,
    },
    {
      id: 'quadrant-top',
      label: 'Top quadrants together',
      phase: 'Quadrants · combined',
      squares: uniqueSquares([...topLeft, ...topRight]),
    },
    {
      id: 'quadrant-bottom',
      label: 'Bottom quadrants together',
      phase: 'Quadrants · combined',
      squares: uniqueSquares([...bottomLeft, ...bottomRight]),
    },
    {
      id: 'quadrant-left',
      label: 'Left quadrants together',
      phase: 'Quadrants · combined',
      squares: uniqueSquares([...topLeft, ...bottomLeft]),
    },
    {
      id: 'quadrant-right',
      label: 'Right quadrants together',
      phase: 'Quadrants · combined',
      squares: uniqueSquares([...topRight, ...bottomRight]),
    },
    {
      id: 'quadrant-three-no-top-left',
      label: 'Three quadrants · no top left',
      phase: 'Quadrants · combined',
      squares: uniqueSquares([...topRight, ...bottomLeft, ...bottomRight]),
    },
    {
      id: 'quadrant-three-no-top-right',
      label: 'Three quadrants · no top right',
      phase: 'Quadrants · combined',
      squares: uniqueSquares([...topLeft, ...bottomLeft, ...bottomRight]),
    },
    {
      id: 'quadrant-three-no-bottom-left',
      label: 'Three quadrants · no bottom left',
      phase: 'Quadrants · combined',
      squares: uniqueSquares([...topLeft, ...topRight, ...bottomRight]),
    },
    {
      id: 'quadrant-three-no-bottom-right',
      label: 'Three quadrants · no bottom right',
      phase: 'Quadrants · combined',
      squares: uniqueSquares([...topLeft, ...topRight, ...bottomLeft]),
    },
    {
      id: 'quadrant-all',
      label: 'All quadrants · full board',
      phase: 'Quadrants · full board',
      squares: uniqueSquares([...topLeft, ...topRight, ...bottomLeft, ...bottomRight]),
    },
  ]
}

function buildAllDiagonalsA1H8() {
  const diagonals: string[][] = []

  for (let startFile = 0; startFile < 8; startFile += 1) {
    const line: string[] = []
    let file = startFile
    let rank = 1

    while (file < 8 && rank <= 8) {
      line.push(sq(FILES[file], rank))
      file += 1
      rank += 1
    }

    if (line.length >= 2) diagonals.push(line)
  }

  for (let startRank = 2; startRank <= 8; startRank += 1) {
    const line: string[] = []
    let file = 0
    let rank = startRank

    while (file < 8 && rank <= 8) {
      line.push(sq(FILES[file], rank))
      file += 1
      rank += 1
    }

    if (line.length >= 2) diagonals.push(line)
  }

  return diagonals
}

function buildAllDiagonalsH1A8() {
  const diagonals: string[][] = []

  for (let startFile = 7; startFile >= 0; startFile -= 1) {
    const line: string[] = []
    let file = startFile
    let rank = 1

    while (file >= 0 && rank <= 8) {
      line.push(sq(FILES[file], rank))
      file -= 1
      rank += 1
    }

    if (line.length >= 2) diagonals.push(line)
  }

  for (let startRank = 2; startRank <= 8; startRank += 1) {
    const line: string[] = []
    let file = 7
    let rank = startRank

    while (file >= 0 && rank <= 8) {
      line.push(sq(FILES[file], rank))
      file -= 1
      rank += 1
    }

    if (line.length >= 2) diagonals.push(line)
  }

  return diagonals
}

function buildDiagonalChunks(): Chunk[] {
  const lines = [...buildAllDiagonalsA1H8(), ...buildAllDiagonalsH1A8()]
  const chunks: Chunk[] = []

  lines.forEach((line, index) => {
    chunks.push({
      id: `diag-single-${index + 1}`,
      label: `Diagonal ${line[0]}-${line[line.length - 1]}`,
      phase: 'Diagonals · single',
      squares: line,
    })
  })

  for (let i = 0; i <= lines.length - 2; i += 1) {
    chunks.push({
      id: `diag-pair-${i + 1}`,
      label: `Diagonal pair ${i + 1}`,
      phase: 'Diagonals · pairs',
      squares: uniqueSquares([...lines[i], ...lines[i + 1]]),
    })
  }

  for (let i = 0; i <= lines.length - 3; i += 1) {
    chunks.push({
      id: `diag-triplet-${i + 1}`,
      label: `Diagonal triplet ${i + 1}`,
      phase: 'Diagonals · triplets',
      squares: uniqueSquares([...lines[i], ...lines[i + 1], ...lines[i + 2]]),
    })
  }

  for (let i = 0; i <= lines.length - 4; i += 1) {
    chunks.push({
      id: `diag-quad-${i + 1}`,
      label: `Diagonal group ${i + 1}`,
      phase: 'Diagonals · groups of 4',
      squares: uniqueSquares([...lines[i], ...lines[i + 1], ...lines[i + 2], ...lines[i + 3]]),
    })
  }

  return chunks
}

function buildGeometryChunks(): Chunk[] {
  const allSquares = FILES.flatMap((file) => RANKS.map((rank) => sq(file, rank)))
  const fourCenter = ['d4', 'd5', 'e4', 'e5']
  const sixteenCenter = ['c', 'd', 'e', 'f'].flatMap((file) => [3, 4, 5, 6].map((rank) => sq(file, rank)))
  const corners = ['a1', 'a8', 'h1', 'h8']
  const edges = allSquares.filter(
    (squareName) =>
      squareName[0] === 'a' ||
      squareName[0] === 'h' ||
      squareName[1] === '1' ||
      squareName[1] === '8'
  )
  const innerBoard = allSquares.filter((squareName) => !edges.includes(squareName))

  return [
    {
      id: 'geometry-center-4',
      label: '4 center squares',
      phase: 'Geometry',
      squares: fourCenter,
    },
    {
      id: 'geometry-center-16',
      label: '16 center squares',
      phase: 'Geometry',
      squares: sixteenCenter,
    },
    {
      id: 'geometry-corners',
      label: 'Corners',
      phase: 'Geometry',
      squares: corners,
    },
    {
      id: 'geometry-edges',
      label: 'Edge squares',
      phase: 'Geometry',
      squares: edges,
    },
    {
      id: 'geometry-inner',
      label: 'Inner board',
      phase: 'Geometry',
      squares: innerBoard,
    },
  ]
}

function buildMixedChunks(): Chunk[] {
  const allSquares = FILES.flatMap((file) => RANKS.map((rank) => sq(file, rank)))
  const filesOnly = buildSingleFileChunks().flatMap((chunk) => chunk.squares)
  const ranksOnly = buildSingleRankChunks().flatMap((chunk) => chunk.squares)
  const diagonalsOnly = buildDiagonalChunks().flatMap((chunk) => chunk.squares)
  const colorsOnly = buildColorChunks().flatMap((chunk) => chunk.squares)
  const quadrantsOnly = buildQuadrantChunks().flatMap((chunk) => chunk.squares)

  return [
    {
      id: 'mixed-files',
      label: 'Mixed files review',
      phase: 'Mixed review',
      squares: uniqueSquares(filesOnly),
    },
    {
      id: 'mixed-ranks',
      label: 'Mixed ranks review',
      phase: 'Mixed review',
      squares: uniqueSquares(ranksOnly),
    },
    {
      id: 'mixed-diagonals',
      label: 'Mixed diagonals review',
      phase: 'Mixed review',
      squares: uniqueSquares(diagonalsOnly),
    },
    {
      id: 'mixed-colors',
      label: 'Mixed colors review',
      phase: 'Mixed review',
      squares: uniqueSquares(colorsOnly),
    },
    {
      id: 'mixed-quadrants',
      label: 'Mixed quadrants review',
      phase: 'Mixed review',
      squares: uniqueSquares(quadrantsOnly),
    },
    {
      id: 'mixed-all',
      label: 'Mixed everything',
      phase: 'Mixed review',
      squares: allSquares,
    },
  ]
}

function buildCourseChunks(): Chunk[] {
  const allSquares = FILES.flatMap((file) => RANKS.map((rank) => sq(file, rank)))

  return [
    ...buildSingleFileChunks(),
    ...buildFilePairChunks(),
    ...buildFileTripletChunks(),
    ...buildFileQuadChunks(),
    {
      id: 'files-full-board',
      label: 'Files · full board',
      phase: 'Files · full board',
      squares: allSquares,
    },

    ...buildSingleRankChunks(),
    ...buildRankPairChunks(),
    ...buildRankTripletChunks(),
    ...buildRankQuadChunks(),
    {
      id: 'ranks-full-board',
      label: 'Ranks · full board',
      phase: 'Ranks · full board',
      squares: allSquares,
    },

    ...buildColorChunks(),
    ...buildHalfChunks(),
    ...buildQuadrantChunks(),
    ...buildDiagonalChunks(),
    {
      id: 'diagonals-full-board',
      label: 'Diagonals · full board',
      phase: 'Diagonals · full board',
      squares: allSquares,
    },

    ...buildGeometryChunks(),
    ...buildMixedChunks(),

    {
      id: 'final-full-board-speed',
      label: 'Final · full board',
      phase: 'Final exam',
      squares: allSquares,
    },
  ]
}

const COURSE_CHUNKS = buildCourseChunks()

export default function BoardVisionPage() {
  const [sideMode, setSideMode] = useState<SideMode>('white')
  const [trainerMode, setTrainerMode] = useState<TrainerMode>('find-square')
  const [chunkIndex, setChunkIndex] = useState(0)
  const [targetSquare, setTargetSquare] = useState('')
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [statusText, setStatusText] = useState('Click Start to begin')
  const [isStarted, setIsStarted] = useState(false)
  const [targetVisible, setTargetVisible] = useState(true)
  const [solveStartedAt, setSolveStartedAt] = useState<number | null>(null)
  const [lastSolveSeconds, setLastSolveSeconds] = useState<number | null>(null)
  const [totalAttempts, setTotalAttempts] = useState(0)
  const [totalCorrect, setTotalCorrect] = useState(0)
  const [progressMap, setProgressMap] = useState<Record<string, number>>({})
  const [jumpValue, setJumpValue] = useState('')
  const [typedAnswer, setTypedAnswer] = useState('')
  const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>({})

  const flashTimerRef = useRef<number | null>(null)
  const revealTimerRef = useRef<number | null>(null)
  const targetSwapTimerRef = useRef<number | null>(null)

  const chunks = useMemo(() => COURSE_CHUNKS, [])
  const visibleChunks = useMemo(() => getVisibleChunks(chunks, trainerMode), [chunks, trainerMode])

  const currentChunk = visibleChunks[chunkIndex]
  const currentPool = currentChunk?.squares ?? []

  const groupedChunks = useMemo(() => {
    const map = new Map<string, { phase: string; items: Array<{ chunk: Chunk; index: number }> }>()

    visibleChunks.forEach((chunk, index) => {
      if (!map.has(chunk.phase)) {
        map.set(chunk.phase, {
          phase: chunk.phase,
          items: [],
        })
      }

      map.get(chunk.phase)!.items.push({ chunk, index })
    })

    return Array.from(map.values())
  }, [visibleChunks])

  const totalNeededForChunk = currentPool.length * FAST_SOLVES_TO_MASTER

  const currentChunkFastTotal = useMemo(() => {
    if (!currentChunk) return 0
    return currentPool.reduce((sum, squareName) => {
      return sum + (progressMap[getProgressKey(trainerMode, currentChunk.id, squareName)] ?? 0)
    }, 0)
  }, [currentChunk, currentPool, progressMap, trainerMode])

  const weakestSquares = useMemo(() => {
    if (!currentChunk || currentPool.length === 0) return []

    const minValue = Math.min(
      ...currentPool.map(
        (squareName) => progressMap[getProgressKey(trainerMode, currentChunk.id, squareName)] ?? 0
      )
    )

    return shuffleArray(
      currentPool.filter(
        (squareName) =>
          (progressMap[getProgressKey(trainerMode, currentChunk.id, squareName)] ?? 0) === minValue
      )
    )
  }, [currentChunk, currentPool, progressMap, trainerMode])

  const masteredSquaresCount = useMemo(() => {
    if (!currentChunk) return 0
    return currentPool.filter(
      (squareName) =>
        (progressMap[getProgressKey(trainerMode, currentChunk.id, squareName)] ?? 0) >=
        FAST_SOLVES_TO_MASTER
    ).length
  }, [currentChunk, currentPool, progressMap, trainerMode])

  const chunkPercent =
    totalNeededForChunk === 0
      ? 0
      : Math.min(100, Math.round((currentChunkFastTotal / totalNeededForChunk) * 100))

  const coursePercent =
    visibleChunks.length === 0 ? 0 : Math.round((chunkIndex / visibleChunks.length) * 100)

  const squareStyles = useMemo(() => {
    const styles: Record<string, CSSProperties> = {}

    if (trainerMode === 'name-square' && targetSquare) {
      styles[targetSquare] = {
        boxShadow: 'inset 0 0 0 4px rgba(59,130,246,0.95)',
      }
    }

    if (selectedSquare && trainerMode !== 'name-color') {
      styles[selectedSquare] = {
        boxShadow:
          status === 'wrong'
            ? 'inset 0 0 0 4px rgba(239,68,68,0.95)'
            : 'inset 0 0 0 4px rgba(34,197,94,0.95)',
      }
    }

    return styles
  }, [selectedSquare, status, targetSquare, trainerMode])

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current)
      if (revealTimerRef.current) window.clearTimeout(revealTimerRef.current)
      if (targetSwapTimerRef.current) window.clearTimeout(targetSwapTimerRef.current)
    }
  }, [])

  useEffect(() => {
    setTypedAnswer('')
    setSelectedSquare(null)
    setLastSolveSeconds(null)
    setStatus('idle')
    setChunkIndex(0)
  }, [trainerMode])

  useEffect(() => {
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (!isStarted || !targetSquare) return

      const key = event.key.toLowerCase()

      if (trainerMode === 'name-color') {
        if (key === 'w') {
          event.preventDefault()
          handleColorAnswer('white')
        } else if (key === 'b') {
          event.preventDefault()
          handleColorAnswer('black')
        }
        return
      }

      if (trainerMode !== 'name-square') return

      if (key === 'enter') {
        event.preventDefault()
        handleSubmitNameSquare()
        return
      }

      if (key === 'backspace') {
        event.preventDefault()
        setTypedAnswer((prev) => prev.slice(0, -1))
        return
      }

      if (/^[a-h]$/.test(key)) {
        event.preventDefault()
        setTypedAnswer((prev) => {
          const current = prev.toLowerCase()
          const withoutRank = current.replace(/[1-8]/g, '')
          return (withoutRank + key).slice(-1)
        })
        return
      }

      if (/^[1-8]$/.test(key)) {
        event.preventDefault()
        setTypedAnswer((prev) => {
          const current = prev.toLowerCase()
          const filePart = current.match(/[a-h]/)?.[0] ?? ''
          return `${filePart}${key}`.slice(0, 2)
        })
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [trainerMode, isStarted, targetSquare])

  function togglePhase(phase: string) {
    setExpandedPhases((prev) => ({
      ...prev,
      [phase]: !prev[phase],
    }))
  }

  function clearFlashTimer() {
    if (flashTimerRef.current) {
      window.clearTimeout(flashTimerRef.current)
      flashTimerRef.current = null
    }
  }

  function clearTargetTimers() {
    if (revealTimerRef.current) {
      window.clearTimeout(revealTimerRef.current)
      revealTimerRef.current = null
    }
    if (targetSwapTimerRef.current) {
      window.clearTimeout(targetSwapTimerRef.current)
      targetSwapTimerRef.current = null
    }
  }

  function resetPerQuestionUi() {
    setSelectedSquare(null)
    setStatus('idle')
    setStatusText(
      trainerMode === 'find-square'
        ? 'Click the named square'
        : trainerMode === 'name-square'
        ? 'Type the square name'
        : 'Choose white or black'
    )
    setLastSolveSeconds(null)
    setTypedAnswer('')
  }

  function startNewTarget(nextTarget?: string, chunkOverride?: Chunk) {
    const chunk = chunkOverride ?? currentChunk
    const pool = chunk?.squares ?? []

    if (!chunk || pool.length === 0) return

    const picked = nextTarget ?? pickRandomSquare(pool, targetSquare, weakestSquares)

    clearTargetTimers()
    resetPerQuestionUi()
    setTargetVisible(false)

    targetSwapTimerRef.current = window.setTimeout(() => {
      setTargetSquare(picked)
      setSolveStartedAt(performance.now())

      revealTimerRef.current = window.setTimeout(() => {
        setTargetVisible(true)
      }, 40)
    }, 120)
  }

  function resetCurrentChunkProgress() {
    if (!currentChunk) return

    setProgressMap((prev) => {
      const next = { ...prev }
      for (const squareName of currentChunk.squares) {
        next[getProgressKey(trainerMode, currentChunk.id, squareName)] = 0
      }
      return next
    })
  }

  function beginChunk(index: number, text?: string) {
    clearFlashTimer()
    clearTargetTimers()

    const nextIndex = Math.max(0, Math.min(index, visibleChunks.length - 1))
    const nextChunk = visibleChunks[nextIndex]

    setChunkIndex(nextIndex)
    setIsStarted(true)
    setTargetVisible(true)
    setSelectedSquare(null)
    setLastSolveSeconds(null)
    setTypedAnswer('')

    if (!nextChunk || nextChunk.squares.length === 0) {
      setTargetSquare('')
      setSolveStartedAt(null)
      return
    }

    setStatus('idle')
    setStatusText(text ?? `Started: ${nextChunk.label}`)
    const nextTarget = pickRandomSquare(nextChunk.squares)
    setTargetSquare(nextTarget)
    setSolveStartedAt(performance.now())
  }

  function jumpToChunk(index: number) {
    beginChunk(
      index,
      `Jumped to chunk ${index + 1}: ${visibleChunks[Math.max(0, Math.min(index, visibleChunks.length - 1))].label}`
    )
  }

  function handleJump() {
    const parsed = Number(jumpValue.trim())
    if (!Number.isFinite(parsed)) return
    jumpToChunk(parsed - 1)
  }

  function handleJumpKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      handleJump()
    }
  }

  function handleStart() {
    setTotalAttempts(0)
    setTotalCorrect(0)
    setProgressMap({})
    beginChunk(0, 'Course started')
  }

  function handleRestartChunk() {
    resetCurrentChunkProgress()
    beginChunk(chunkIndex, 'Chunk restarted')
  }

  function goToNextChunk() {
    const nextIndex = chunkIndex + 1
    if (nextIndex >= visibleChunks.length) {
      setStatus('course-complete')
      setStatusText('Course complete')
      setTargetSquare('')
      setSelectedSquare(null)
      setSolveStartedAt(null)
      return
    }

    beginChunk(nextIndex, `Next chunk started: ${visibleChunks[nextIndex].label}`)
  }

  function completeAttempt(correct: boolean, wrongMessage: string, selected?: string) {
    if (!currentChunk || !targetSquare) return

    if (selected) {
      setSelectedSquare(selected)
    }

    setTotalAttempts((v) => v + 1)

    if (!correct) {
      setStatus('wrong')
      setStatusText(wrongMessage)
      return
    }

    const elapsedMs = solveStartedAt ? performance.now() - solveStartedAt : 999999
    const elapsedSeconds = elapsedMs / 1000
    const isFast = elapsedSeconds < FAST_SECONDS

    setLastSolveSeconds(elapsedSeconds)
    setTotalCorrect((v) => v + 1)

    if (!isFast) {
      setStatus('correct')
      setStatusText(`Correct, but too slow (${formatSeconds(elapsedSeconds)}s)`)
      clearFlashTimer()
      flashTimerRef.current = window.setTimeout(() => {
        startNewTarget()
      }, 500)
      return
    }

    const key = getProgressKey(trainerMode, currentChunk.id, targetSquare)
    const currentFast = progressMap[key] ?? 0
    const nextFast = Math.min(FAST_SOLVES_TO_MASTER, currentFast + 1)

    const nextMap = {
      ...progressMap,
      [key]: nextFast,
    }

    const chunkCompleted = currentPool.every(
      (squareValue) =>
        (nextMap[getProgressKey(trainerMode, currentChunk.id, squareValue)] ?? 0) >=
        FAST_SOLVES_TO_MASTER
    )

    setProgressMap(nextMap)

    if (chunkCompleted) {
      setStatus('chunk-complete')
      setStatusText(`Chunk complete: ${currentChunk.label}`)
      clearFlashTimer()
      flashTimerRef.current = window.setTimeout(() => {
        goToNextChunk()
      }, 900)
      return
    }

    setStatus('correct')
    setStatusText(`Correct and fast (${formatSeconds(elapsedSeconds)}s)`)
    clearFlashTimer()
    flashTimerRef.current = window.setTimeout(() => {
      startNewTarget()
    }, 400)
  }

  function handleSquareClick(squareName: string) {
    if (
      !isStarted ||
      !targetSquare ||
      status === 'chunk-complete' ||
      status === 'course-complete'
    ) {
      return
    }

    if (trainerMode !== 'find-square') return

    if (squareName !== targetSquare) {
      completeAttempt(false, `Wrong. Find ${targetSquare}`, squareName)
      return
    }

    completeAttempt(true, '', squareName)
  }

  function handleSubmitNameSquare() {
    if (
      !isStarted ||
      !targetSquare ||
      trainerMode !== 'name-square' ||
      status === 'chunk-complete' ||
      status === 'course-complete'
    ) {
      return
    }

    const normalized = normalizeSquareName(typedAnswer)

    if (!isValidSquareName(normalized)) {
      setStatus('wrong')
      setStatusText('Type a valid square like e4')
      return
    }

    if (normalized !== targetSquare) {
      completeAttempt(false, `Wrong. That square is ${targetSquare}`, targetSquare)
      return
    }

    completeAttempt(true, '', targetSquare)
  }

  function handleColorAnswer(answer: 'white' | 'black') {
    if (
      !isStarted ||
      !targetSquare ||
      trainerMode !== 'name-color' ||
      status === 'chunk-complete' ||
      status === 'course-complete'
    ) {
      return
    }

    const actual = getSquareColor(targetSquare)

    if (answer !== actual) {
      completeAttempt(false, `Wrong. ${targetSquare} is ${actual}`, targetSquare)
      return
    }

    completeAttempt(true, '', targetSquare)
  }

  const accuracy = totalAttempts === 0 ? 0 : Math.round((totalCorrect / totalAttempts) * 100)

  const promptTitle =
    trainerMode === 'find-square'
      ? 'Current target'
      : trainerMode === 'name-square'
      ? 'Name this square'
      : 'Name this color'

  const promptValue =
    trainerMode === 'find-square'
      ? targetSquare || '—'
      : trainerMode === 'name-square'
      ? 'Highlighted square'
      : targetSquare || '—'

  const boardDarkStyle =
    trainerMode === 'name-color'
      ? {
          backgroundColor: '#8a8a8a',
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.18)',
        }
      : { backgroundColor: '#769656' }

  const boardLightStyle =
    trainerMode === 'name-color'
      ? {
          backgroundColor: '#8a8a8a',
          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.18)',
        }
      : { backgroundColor: '#eeeed2' }

  return (
    <div
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at top, rgba(37,99,235,0.16), transparent 32%), linear-gradient(180deg, #0b1220 0%, #111827 100%)',
        color: '#e5e7eb',
        padding: '20px',
      }}
    >
      <div style={{ maxWidth: 1520, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 18,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div
              style={{
                fontSize: 30,
                fontWeight: 800,
                letterSpacing: '-0.02em',
                color: '#f9fafb',
              }}
            >
              Board Vision Trainer
            </div>
            <div
              style={{
                marginTop: 6,
                color: '#9ca3af',
                fontSize: 15,
              }}
            >
              Find square, name square, and name color
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={handleStart} style={buttonPrimaryStyle}>
              Start Course
            </button>

            <button onClick={handleRestartChunk} style={buttonSecondaryStyle}>
              Restart Chunk
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(340px, 1fr) 440px',
            gap: 20,
            alignItems: 'start',
          }}
        >
          <div style={cardStyle}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 14,
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              <div>
                <div style={eyebrowStyle}>{promptTitle}</div>
                <div
                  style={{
                    fontSize: 42,
                    fontWeight: 900,
                    lineHeight: 1,
                    color: '#f9fafb',
                    letterSpacing: '0.04em',
                    opacity: targetVisible ? 1 : 0,
                    transform: targetVisible ? 'translateY(0px)' : 'translateY(6px)',
                    transition: 'opacity 140ms ease, transform 140ms ease',
                  }}
                >
                  {promptValue}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  onClick={() => setTrainerMode('find-square')}
                  style={{
                    ...pillStyle,
                    ...(trainerMode === 'find-square' ? activePillStyle : {}),
                  }}
                >
                  Find
                </button>

                <button
                  onClick={() => setTrainerMode('name-square')}
                  style={{
                    ...pillStyle,
                    ...(trainerMode === 'name-square' ? activePillStyle : {}),
                  }}
                >
                  Name
                </button>

                <button
                  onClick={() => setTrainerMode('name-color')}
                  style={{
                    ...pillStyle,
                    ...(trainerMode === 'name-color' ? activePillStyle : {}),
                  }}
                >
                  Color
                </button>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 14,
                flexWrap: 'wrap',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setSideMode('white')}
                  style={{
                    ...pillStyle,
                    ...(sideMode === 'white' ? activePillStyle : {}),
                  }}
                >
                  White
                </button>

                <button
                  onClick={() => setSideMode('black')}
                  style={{
                    ...pillStyle,
                    ...(sideMode === 'black' ? activePillStyle : {}),
                  }}
                >
                  Black
                </button>
              </div>

              <div style={{ color: '#94a3b8', fontSize: 13 }}>
                Black course = same course, flipped board
              </div>
            </div>

            <div style={{ width: '100%', maxWidth: 900, margin: '0 auto' }}>
              <Chessboard
                id="board-vision-board"
                position={createBlankPosition()}
                onSquareClick={handleSquareClick}
                arePiecesDraggable={false}
                boardOrientation={getBoardOrientation(sideMode)}
                customBoardStyle={{
                  borderRadius: '18px',
                  boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
                }}
                customDarkSquareStyle={boardDarkStyle}
                customLightSquareStyle={boardLightStyle}
                customSquareStyles={squareStyles}
                showBoardNotation={trainerMode === 'name-color'}
                animationDuration={200}
              />
            </div>

            {trainerMode === 'name-square' && (
              <div style={{ marginTop: 16 }}>
                <div style={sectionTitleStyle}>Answer</div>

                <div
                  style={{
                    ...inputStyle,
                    minHeight: 44,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontWeight: 800,
                    letterSpacing: '0.06em',
                  }}
                >
                  <span>{typedAnswer || 'Type directly: file + rank'}</span>
                  <span style={{ color: '#94a3b8', fontSize: 12 }}>Enter = submit</span>
                </div>

                <div style={{ marginTop: 10, color: '#9ca3af', fontSize: 13 }}>
                  No need to click the box. Just type on keyboard.
                </div>
              </div>
            )}

            {trainerMode === 'name-color' && (
              <div style={{ marginTop: 16 }}>
                <div style={sectionTitleStyle}>Answer color</div>
                <div
                  style={{
                    display: 'flex',
                    gap: 14,
                    justifyContent: 'center',
                    alignItems: 'center',
                    marginTop: 10,
                  }}
                >
                  <div
                    onClick={() => handleColorAnswer('white')}
                    style={{
                      width: 70,
                      height: 70,
                      background: '#f3f4f6',
                      borderRadius: 10,
                      border: '2px solid rgba(255,255,255,0.15)',
                      cursor: 'pointer',
                      boxShadow: '0 6px 14px rgba(0,0,0,0.25)',
                    }}
                  />

                  <div
                    onClick={() => handleColorAnswer('black')}
                    style={{
                      width: 70,
                      height: 70,
                      background: '#111827',
                      borderRadius: 10,
                      border: '2px solid rgba(255,255,255,0.15)',
                      cursor: 'pointer',
                      boxShadow: '0 6px 14px rgba(0,0,0,0.25)',
                    }}
                  />
                </div>
                <div style={{ marginTop: 10, color: '#9ca3af', fontSize: 13 }}>
                  Keyboard also works: W = white, B = black
                </div>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gap: 16 }}>
            <div style={cardStyle}>
              <div style={sectionTitleStyle}>Session</div>

              <div style={infoRowStyle}>
                <span style={labelStyle}>Mode</span>
                <span style={valueStyle}>
                  {trainerMode === 'find-square'
                    ? 'Find square'
                    : trainerMode === 'name-square'
                    ? 'Name square'
                    : 'Name color'}
                </span>
              </div>

              <div style={infoRowStyle}>
                <span style={labelStyle}>Side</span>
                <span style={valueStyle}>{sideMode === 'white' ? 'White' : 'Black'}</span>
              </div>

              <div style={infoRowStyle}>
                <span style={labelStyle}>Phase</span>
                <span style={valueStyle}>{currentChunk?.phase ?? '—'}</span>
              </div>

              <div style={infoRowStyle}>
                <span style={labelStyle}>Chunk</span>
                <span style={valueStyle}>
                  {currentChunk ? `${chunkIndex + 1}. ${currentChunk.label}` : '—'}
                </span>
              </div>

              <div style={infoRowStyle}>
                <span style={labelStyle}>Squares in chunk</span>
                <span style={valueStyle}>{currentPool.length}</span>
              </div>

              <div style={infoRowStyle}>
                <span style={labelStyle}>Fast limit</span>
                <span style={valueStyle}>{FAST_SECONDS.toFixed(1)} seconds</span>
              </div>

              <div style={infoRowStyle}>
                <span style={labelStyle}>Need for mastery</span>
                <span style={valueStyle}>{FAST_SOLVES_TO_MASTER} fast solves each</span>
              </div>

              <div
                style={{
                  marginTop: 14,
                  padding: '12px 14px',
                  borderRadius: 14,
                  background:
                    status === 'wrong'
                      ? 'rgba(127,29,29,0.45)'
                      : status === 'correct'
                      ? 'rgba(20,83,45,0.45)'
                      : status === 'chunk-complete'
                      ? 'rgba(30,58,138,0.45)'
                      : status === 'course-complete'
                      ? 'rgba(22,101,52,0.45)'
                      : 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div style={eyebrowStyle}>Status</div>
                <div style={{ marginTop: 4, fontWeight: 700, color: '#f9fafb' }}>
                  {statusText}
                </div>
                {lastSolveSeconds !== null && (
                  <div style={{ marginTop: 6, color: '#cbd5e1', fontSize: 13 }}>
                    Last solve: {formatSeconds(lastSolveSeconds)}s
                  </div>
                )}
              </div>
            </div>

            <div style={cardStyle}>
              <div style={sectionTitleStyle}>Jump to chunk</div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: 10,
                  alignItems: 'center',
                }}
              >
                <input
                  value={jumpValue}
                  onChange={(e) => setJumpValue(e.target.value)}
                  onKeyDown={handleJumpKeyDown}
                  placeholder={`1 - ${visibleChunks.length}`}
                  style={inputStyle}
                />
                <button onClick={handleJump} style={buttonPrimaryStyle}>
                  Jump
                </button>
              </div>
            </div>

            <div style={cardStyle}>
              <div style={sectionTitleStyle}>Chunk progress</div>

              <div style={progressHeaderStyle}>
                <span>
                  {currentChunkFastTotal} / {totalNeededForChunk}
                </span>
                <span>{chunkPercent}%</span>
              </div>

              <div style={progressTrackStyle}>
                <div
                  style={{
                    ...progressFillStyle,
                    width: `${chunkPercent}%`,
                  }}
                />
              </div>

              <div
                style={{
                  marginTop: 14,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0,1fr))',
                  gap: 10,
                  maxHeight: 320,
                  overflowY: 'auto',
                  paddingRight: 4,
                }}
              >
                {currentPool.map((squareName) => {
                  const count = currentChunk
                    ? progressMap[getProgressKey(trainerMode, currentChunk.id, squareName)] ?? 0
                    : 0
                  const done = count >= FAST_SOLVES_TO_MASTER

                  return (
                    <div
                      key={`${trainerMode}-${currentChunk?.id ?? 'chunk'}-${squareName}`}
                      style={{
                        padding: '10px 12px',
                        borderRadius: 12,
                        background: done ? 'rgba(20,83,45,0.5)' : 'rgba(255,255,255,0.04)',
                        border: done
                          ? '1px solid rgba(34,197,94,0.35)'
                          : '1px solid rgba(255,255,255,0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 800,
                          letterSpacing: '0.04em',
                          color: '#f9fafb',
                        }}
                      >
                        {squareName}
                      </span>

                      <span
                        style={{
                          color: done ? '#86efac' : '#cbd5e1',
                          fontWeight: 700,
                          fontSize: 13,
                        }}
                      >
                        {count}/{FAST_SOLVES_TO_MASTER}
                      </span>
                    </div>
                  )
                })}
              </div>

              <div style={{ marginTop: 14, color: '#9ca3af', fontSize: 13 }}>
                Mastered squares: {masteredSquaresCount} / {currentPool.length}
              </div>
            </div>

            <div style={cardStyle}>
              <div style={sectionTitleStyle}>Course progress</div>

              <div style={progressHeaderStyle}>
                <span>
                  {Math.min(chunkIndex + 1, visibleChunks.length)} / {visibleChunks.length}
                </span>
                <span>{coursePercent}%</span>
              </div>

              <div style={progressTrackStyle}>
                <div
                  style={{
                    ...progressFillStyle,
                    width: `${coursePercent}%`,
                  }}
                />
              </div>

              <div
                style={{
                  marginTop: 14,
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 10,
                }}
              >
                <div style={miniStatStyle}>
                  <div style={eyebrowStyle}>Attempts</div>
                  <div style={miniStatValueStyle}>{totalAttempts}</div>
                </div>

                <div style={miniStatStyle}>
                  <div style={eyebrowStyle}>Accuracy</div>
                  <div style={miniStatValueStyle}>{accuracy}%</div>
                </div>
              </div>
            </div>

            <div style={cardStyle}>
              <div style={sectionTitleStyle}>Current order</div>

              <div
                style={{
                  maxHeight: 420,
                  overflowY: 'auto',
                  display: 'grid',
                  gap: 10,
                  paddingRight: 4,
                }}
              >
                {groupedChunks.map((group) => {
                  const isOpen =
                    expandedPhases[group.phase] ?? group.items.some((item) => item.index === chunkIndex)
                  const doneCount = group.items.filter((item) => item.index < chunkIndex).length

                  return (
                    <div
                      key={group.phase}
                      style={{
                        border: '1px solid rgba(255,255,255,0.08)',
                        borderRadius: 14,
                        background: 'rgba(255,255,255,0.03)',
                        overflow: 'hidden',
                      }}
                    >
                      <button
                        onClick={() => togglePhase(group.phase)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '12px 14px',
                          background: 'rgba(255,255,255,0.02)',
                          border: 'none',
                          color: '#f3f4f6',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontWeight: 800,
                        }}
                      >
                        <span>{group.phase}</span>
                        <span style={{ color: '#94a3b8', fontSize: 12 }}>
                          {doneCount}/{group.items.length} done · {isOpen ? 'hide' : 'show'}
                        </span>
                      </button>

                      {isOpen && (
                        <div
                          style={{
                            display: 'grid',
                            gap: 8,
                            padding: '10px',
                          }}
                        >
                          {group.items.map(({ chunk, index }) => {
                            const active = index === chunkIndex
                            const completed = index < chunkIndex

                            return (
                              <button
                                key={chunk.id}
                                onClick={() => jumpToChunk(index)}
                                style={{
                                  textAlign: 'left',
                                  padding: '10px 12px',
                                  borderRadius: 12,
                                  border: active
                                    ? '1px solid rgba(59,130,246,0.45)'
                                    : '1px solid rgba(255,255,255,0.08)',
                                  background: active
                                    ? 'rgba(30,64,175,0.28)'
                                    : completed
                                    ? 'rgba(20,83,45,0.22)'
                                    : 'rgba(255,255,255,0.03)',
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  alignItems: 'center',
                                  gap: 8,
                                  cursor: 'pointer',
                                  color: '#f3f4f6',
                                }}
                              >
                                <span>
                                  <span style={{ color: '#9ca3af', marginRight: 8 }}>{index + 1}.</span>
                                  <span style={{ fontWeight: active ? 800 : 600 }}>{chunk.label}</span>
                                </span>

                                <span
                                  style={{
                                    color: completed ? '#86efac' : active ? '#93c5fd' : '#9ca3af',
                                    fontSize: 12,
                                    fontWeight: 700,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.04em',
                                  }}
                                >
                                  {completed ? 'done' : active ? 'current' : 'jump'}
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={cardStyle}>
              <div style={sectionTitleStyle}>Inside</div>
              <div style={noteStyle}>Files: single, pairs, triplets, groups of 4, full board</div>
              <div style={noteStyle}>Ranks: single, pairs, triplets, groups of 4, full board</div>
              <div style={noteStyle}>Colors, halves, quadrants</div>
              <div style={noteStyle}>Diagonals, geometry, mixed review, final full board</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const cardStyle: CSSProperties = {
  background: 'rgba(17,24,39,0.92)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 20,
  padding: 18,
  boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
}

const buttonPrimaryStyle: CSSProperties = {
  background: 'linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)',
  color: 'white',
  border: 'none',
  borderRadius: 12,
  padding: '10px 16px',
  fontWeight: 800,
  cursor: 'pointer',
}

const buttonSecondaryStyle: CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  color: '#e5e7eb',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 12,
  padding: '10px 16px',
  fontWeight: 700,
  cursor: 'pointer',
}

const inputStyle: CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  color: '#f3f4f6',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 12,
  padding: '10px 12px',
  outline: 'none',
  fontSize: 14,
}

const pillStyle: CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  color: '#d1d5db',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 999,
  padding: '8px 14px',
  fontWeight: 700,
  cursor: 'pointer',
}

const activePillStyle: CSSProperties = {
  background: 'rgba(59,130,246,0.22)',
  color: '#eff6ff',
  border: '1px solid rgba(59,130,246,0.45)',
}

const sectionTitleStyle: CSSProperties = {
  fontSize: 18,
  fontWeight: 800,
  color: '#f9fafb',
  marginBottom: 12,
}

const eyebrowStyle: CSSProperties = {
  color: '#94a3b8',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
}

const infoRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  padding: '8px 0',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
}

const labelStyle: CSSProperties = {
  color: '#9ca3af',
  fontSize: 14,
}

const valueStyle: CSSProperties = {
  color: '#f3f4f6',
  fontWeight: 700,
  textAlign: 'right',
}

const progressHeaderStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  color: '#e5e7eb',
  fontWeight: 700,
  marginBottom: 8,
}

const progressTrackStyle: CSSProperties = {
  width: '100%',
  height: 12,
  borderRadius: 999,
  background: 'rgba(255,255,255,0.08)',
  overflow: 'hidden',
}

const progressFillStyle: CSSProperties = {
  height: '100%',
  borderRadius: 999,
  background: 'linear-gradient(90deg, #22c55e 0%, #3b82f6 100%)',
}

const miniStatStyle: CSSProperties = {
  borderRadius: 14,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  padding: '12px 14px',
}

const miniStatValueStyle: CSSProperties = {
  marginTop: 6,
  color: '#f9fafb',
  fontSize: 26,
  fontWeight: 900,
}

const noteStyle: CSSProperties = {
  color: '#cbd5e1',
  fontSize: 14,
  padding: '6px 0',
}