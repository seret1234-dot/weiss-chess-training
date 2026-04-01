import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import type { PieceSymbol } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import chunk1 from './data/chunk_1.json'

type DemoPuzzle = {
  startFen: string
  preMove?: string
  solution: string
  label: string
  theme: string
}

type AnimatedPiece = {
  char: string
  from: string
  to: string
  started: boolean
}

type PuzzleMastery = {
  fastSolves: number
}

type Props = {
  onBack: () => void
  category: 'mates' | 'tactics' | 'endgame'
}

const FAST_SOLVES_TO_MASTER = 5
const CHUNK_SIZE = 30
const TOTAL_FAST_SOLVES_NEEDED = CHUNK_SIZE * FAST_SOLVES_TO_MASTER
const FAST_SOLVE_SECONDS = 10

const PREMOVE_DELAY_MS = 300
const PREMOVE_SLIDE_MS = 900
const PREMOVE_FINISH_BUFFER_MS = 60

function parseUci(uci: string) {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion:
      uci.length === 5 ? (uci[4] as 'q' | 'r' | 'b' | 'n') : undefined,
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

function getPieceChar(piece: { color: 'w' | 'b'; type: PieceSymbol }) {
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
  return map[`${piece.color}${piece.type}`] ?? ''
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

function formatSeconds(value: number) {
  return value.toFixed(1)
}

function getCategoryTitle(category: 'mates' | 'tactics' | 'endgame') {
  if (category === 'mates') return 'Mates'
  if (category === 'tactics') return 'Tactics'
  return 'Endgame'
}

export default function MateTrainerDemo({ onBack, category }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const solveStartedAtRef = useRef<number | null>(null)
  const preMoveTimeoutRef = useRef<number | null>(null)
  const preMoveStartTimeoutRef = useRef<number | null>(null)
  const preMoveFinishTimeoutRef = useRef<number | null>(null)

  const [puzzles, setPuzzles] = useState<DemoPuzzle[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [currentIndex, setCurrentIndex] = useState(0)
  const [game, setGame] = useState(new Chess())
  const [boardFen, setBoardFen] = useState('start')
  const [message, setMessage] = useState('Loading...')
  const [solved, setSolved] = useState(false)
  const [showHint, setShowHint] = useState(false)
  const [boardLocked, setBoardLocked] = useState(true)

  const [boardSize, setBoardSize] = useState(820)
  const [isDragging, setIsDragging] = useState(false)
  const [isHandleHovered, setIsHandleHovered] = useState(false)

  const [lastMoveHighlight, setLastMoveHighlight] = useState<string | null>(null)
  const [correctSquare, setCorrectSquare] = useState<string | null>(null)
  const [animatedPiece, setAnimatedPiece] = useState<AnimatedPiece | null>(null)

  const [chunkProgress, setChunkProgress] = useState<PuzzleMastery[]>(
    Array.from({ length: CHUNK_SIZE }, () => ({ fastSolves: 0 }))
  )

  const currentPuzzle = useMemo(
    () => puzzles[currentIndex] ?? null,
    [puzzles, currentIndex]
  )

  const sideToMoveText = game.turn() === 'w' ? 'White' : 'Black'
  const sideSquareColor = game.turn() === 'w' ? '#ffffff' : '#111111'

  const currentPuzzleFastSolves = chunkProgress[currentIndex]?.fastSolves ?? 0
  const totalFastSolves = chunkProgress.reduce(
    (sum, item) => sum + item.fastSolves,
    0
  )
  const chunkPercent = Math.round(
    (totalFastSolves / TOTAL_FAST_SOLVES_NEEDED) * 100
  )
  const masteredPuzzleCount = chunkProgress.filter(
    (item) => item.fastSolves >= FAST_SOLVES_TO_MASTER
  ).length

  useEffect(() => {
    if (category !== 'mates') {
      setPuzzles([])
      setLoadError('Backend trainer is connected for Mates first.')
      setLoading(false)
      return
    }

    const mapped: DemoPuzzle[] = (chunk1 as any[]).map((p, i) => ({
      startFen: p.fen,
      solution: p.solution_move,
      label: `Puzzle ${i + 1}`,
      theme: 'Mate in 1',
    }))

    setPuzzles(mapped)
    setCurrentIndex(0)
    setLoadError(null)
    setLoading(false)
  }, [category])

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

  useEffect(() => {
    if (!currentPuzzle) return
    loadPuzzle(currentPuzzle)

    return () => {
      if (preMoveTimeoutRef.current) window.clearTimeout(preMoveTimeoutRef.current)
      if (preMoveStartTimeoutRef.current) window.clearTimeout(preMoveStartTimeoutRef.current)
      if (preMoveFinishTimeoutRef.current) window.clearTimeout(preMoveFinishTimeoutRef.current)
    }
  }, [currentPuzzle])

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

  function loadPuzzle(puzzle: DemoPuzzle) {
    try {
      const chess = new Chess(puzzle.startFen)

      solveStartedAtRef.current = performance.now()
      setSolved(false)
      setShowHint(false)
      setMessage('Find the winning move')
      setLastMoveHighlight(null)
      setCorrectSquare(null)
      setAnimatedPiece(null)

      if (puzzle.preMove) {
        const move = parseUci(puzzle.preMove)
        const piece = chess.get(move.from as any)

        if (piece) {
          setBoardLocked(true)

          const frozenFen = chess.fen()
          setGame(new Chess(frozenFen))
          setBoardFen(frozenFen)

          preMoveTimeoutRef.current = window.setTimeout(() => {
            setAnimatedPiece({
              char: getPieceChar(piece as any),
              from: move.from,
              to: move.to,
              started: false,
            })

            preMoveStartTimeoutRef.current = window.setTimeout(() => {
              setAnimatedPiece({
                char: getPieceChar(piece as any),
                from: move.from,
                to: move.to,
                started: true,
              })
            }, 20)

            preMoveFinishTimeoutRef.current = window.setTimeout(() => {
              const after = new Chess(puzzle.startFen)
              after.move(move as any)
              setGame(after)
              setBoardFen(after.fen())
              setAnimatedPiece(null)
              setLastMoveHighlight(puzzle.preMove ?? null)
              setBoardLocked(false)
              solveStartedAtRef.current = performance.now()
            }, PREMOVE_SLIDE_MS + PREMOVE_FINISH_BUFFER_MS)
          }, PREMOVE_DELAY_MS)

          return
        }
      }

      setGame(chess)
      setBoardFen(chess.fen())
      setBoardLocked(false)
    } catch {
      setGame(new Chess())
      setBoardFen('start')
      setBoardLocked(true)
      setMessage('Failed to load puzzle')
    }
  }

  function onDrop(sourceSquare: string, targetSquare: string) {
    if (solved || boardLocked || !currentPuzzle) return false

    const expected = parseUci(currentPuzzle.solution)
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
    const expectedUci = currentPuzzle.solution.toLowerCase()

    if (playedUci === expectedUci) {
      const solvedInSeconds =
        solveStartedAtRef.current == null
          ? null
          : (performance.now() - solveStartedAtRef.current) / 1000

      const wasFast =
        solvedInSeconds !== null && solvedInSeconds <= FAST_SOLVE_SECONDS

      setGame(testGame)
      setBoardFen(testGame.fen())
      setSolved(true)
      setLastMoveHighlight(playedUci)
      setCorrectSquare(move.to)

      if (wasFast) {
        incrementFastSolve(currentIndex)

        const nextValue = Math.min(
          (chunkProgress[currentIndex]?.fastSolves ?? 0) + 1,
          FAST_SOLVES_TO_MASTER
        )

        setMessage(
          `Correct — fast solve (${formatSeconds(
            solvedInSeconds
          )}s) • ${nextValue}/${FAST_SOLVES_TO_MASTER}`
        )
      } else {
        setMessage(
          solvedInSeconds === null
            ? 'Correct'
            : `Correct — not fast (${formatSeconds(
                solvedInSeconds
              )}s) • need ≤ ${FAST_SOLVE_SECONDS}s`
        )
      }

      return true
    }

    setMessage('Wrong move')

    const resetChess = new Chess(currentPuzzle.startFen)
    setGame(resetChess)
    setBoardFen(resetChess.fen())
    setLastMoveHighlight(null)
    setCorrectSquare(null)
    return false
  }

  function nextPuzzle() {
    const nextIndex = currentIndex + 1
    if (nextIndex >= puzzles.length) {
      setMessage('Chunk complete')
      return
    }
    setCurrentIndex(nextIndex)
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#2b2623', color: '#f3f3f3', padding: 40 }}>
        <button onClick={onBack}>← Back</button>
        <h1>{getCategoryTitle(category)} Trainer</h1>
        <p>Loading chunk...</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div style={{ minHeight: '100vh', background: '#2b2623', color: '#f3f3f3', padding: 40 }}>
        <button onClick={onBack}>← Back</button>
        <h1>{getCategoryTitle(category)} Trainer</h1>
        <p>{loadError}</p>
      </div>
    )
  }

  if (!currentPuzzle) {
    return (
      <div style={{ minHeight: '100vh', background: '#2b2623', color: '#f3f3f3', padding: 40 }}>
        <button onClick={onBack}>← Back</button>
        <h1>{getCategoryTitle(category)} Trainer</h1>
        <p>No puzzles found.</p>
      </div>
    )
  }

  const hintText = `Try: ${currentPuzzle.solution.slice(0, 2)} → ${currentPuzzle.solution.slice(2, 4)}`
  const handleActive = isDragging || isHandleHovered

  const customSquareStyles = {
    ...getMoveHighlightStyles(lastMoveHighlight),
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

  const mainProgressWidth = `${(totalFastSolves / TOTAL_FAST_SOLVES_NEEDED) * 100}%`

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
        <button
          onClick={onBack}
          style={{
            border: 'none',
            borderRadius: 12,
            padding: '12px 16px',
            background: '#3b3734',
            color: 'white',
            fontSize: 15,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          ← Back
        </button>

        <div style={{ color: '#bdbdbd', fontSize: 14 }}>
          {getCategoryTitle(category)} Trainer
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
          <div style={{ position: 'relative', width: boardSize, height: boardSize }}>
            <Chessboard
              id="trainer-board"
              position={boardFen}
              onPieceDrop={onDrop}
              arePiecesDraggable={!solved && !boardLocked}
              boardWidth={boardSize}
              customSquareStyles={customSquareStyles}
              customDarkSquareStyle={{ backgroundColor: '#7d9a58' }}
              customLightSquareStyle={{ backgroundColor: '#d8d8bf' }}
              customBoardStyle={{
                boxShadow: '0 0 0 1px rgba(255,255,255,0.04)',
              }}
              animationDuration={250}
            />

            {animatedPiece && (
              <div
                style={{
                  position: 'absolute',
                  left: animatedPiece.started
                    ? squareToCoords(animatedPiece.to, boardSize).left
                    : squareToCoords(animatedPiece.from, boardSize).left,
                  top: animatedPiece.started
                    ? squareToCoords(animatedPiece.to, boardSize).top
                    : squareToCoords(animatedPiece.from, boardSize).top,
                  width: squareToCoords(animatedPiece.from, boardSize).squareSize,
                  height: squareToCoords(animatedPiece.from, boardSize).squareSize,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: boardSize / 12,
                  zIndex: 50,
                  pointerEvents: 'none',
                  transition: animatedPiece.started
                    ? `left ${PREMOVE_SLIDE_MS}ms ease, top ${PREMOVE_SLIDE_MS}ms ease`
                    : 'none',
                }}
              >
                {animatedPiece.char}
              </div>
            )}

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
            {`${sideToMoveText} to Move`}
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
            <span>{currentPuzzle.theme}</span>
            <span>
              {currentIndex + 1} / {puzzles.length}
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
                  {totalFastSolves} / {TOTAL_FAST_SOLVES_NEEDED}
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
                <span>{masteredPuzzleCount} / {CHUNK_SIZE} puzzles at 5/5</span>
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
                <span>Fast = ≤ {FAST_SOLVE_SECONDS}s</span>
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
                const done = i < currentIndex || (i === currentIndex && solved)
                return (
                  <div
                    key={i}
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 3,
                      background: done ? '#8bc34a' : '#5b5652',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: done ? '#fff' : 'transparent',
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
                {currentPuzzle.label}
              </div>
              <div>Category: {getCategoryTitle(category)}</div>
              <div>Theme: {currentPuzzle.theme}</div>
              <div>Loaded from local chunk_1.json</div>
              <div>Chunk target: 150 fast solves</div>
              {showHint && (
                <div style={{ marginTop: 10, color: '#f2c14e' }}>{hintText}</div>
              )}
            </div>

            <div style={{ marginTop: 'auto' }}>
              {solved ? (
                <button
                  onClick={nextPuzzle}
                  style={{
                    width: '100%',
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
                  {currentIndex === puzzles.length - 1 ? 'Finish' : 'Next Puzzle'}
                </button>
              ) : (
                <button
                  onClick={() => setShowHint((v) => !v)}
                  disabled={boardLocked}
                  style={{
                    width: '100%',
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
            <span>{getCategoryTitle(category)} Trainer</span>
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