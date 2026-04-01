import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Chess } from 'chess.js'
import type { Square } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { stockfishService } from '../lib/chess/stockfishService'
import { useGlobalBoard } from '../hooks/useGlobalBoard'

type Side = 'white' | 'black'
type Mode = 'play' | 'analyze'

const pieceSymbols: Record<string, string> = {
  p: '♟',
  n: '♞',
  b: '♝',
  r: '♜',
  q: '♛',
}

function sideToMove(fen: string): Side {
  return fen.split(' ')[1] === 'b' ? 'black' : 'white'
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
      style={{
        minHeight: 30,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        color: '#e5e7eb',
      }}
    >
      <div style={{ display: 'flex', gap: 2, fontSize: 22, lineHeight: 1 }}>
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
  return <div style={{ minHeight: 30 }} />
}

export default function PlayComputerPage() {
  const location = useLocation()
  const searchParams = new URLSearchParams(location.search)

  const queryFen = searchParams.get('fen') || undefined
  const queryColor = searchParams.get('color')
  const queryMode = searchParams.get('mode')
  const querySource = searchParams.get('source') || undefined

  const stateFen = (location.state as any)?.fen as string | undefined
  const stateSuggestedColor = (location.state as any)?.suggestedColor as Side | undefined
  const stateSource = (location.state as any)?.source as string | undefined
  const stateMode = (location.state as any)?.mode as Mode | undefined

  const initialFen = queryFen || stateFen
  const suggestedColor =
    queryColor === 'white' || queryColor === 'black'
      ? (queryColor as Side)
      : stateSuggestedColor
  const source = querySource || stateSource
  const initialMode: Mode =
    queryMode === 'analyze' || stateMode === 'analyze' ? 'analyze' : 'play'

  const containerRef = useRef<HTMLDivElement | null>(null)
  const chessRef = useRef(new Chess(initialFen || undefined))

  const [gameStarted, setGameStarted] = useState(initialMode === 'analyze')
  const [mode, setMode] = useState<Mode>(initialMode)

  const [playerColor, setPlayerColor] = useState<Side>(suggestedColor || 'white')
  const [boardOrientation, setBoardOrientation] = useState<Side>(
    suggestedColor || 'white'
  )
  const [engineElo, setEngineElo] = useState(1500)
  const [boardSize, setBoardSize] = useState(620)

  const [position, setPosition] = useState(initialFen || chessRef.current.fen())
  const [engineReady, setEngineReady] = useState(false)
  const [engineThinking, setEngineThinking] = useState(false)
  const [moveList, setMoveList] = useState<string[]>([])
  const [evalText, setEvalText] = useState('—')
  const [statusText, setStatusText] = useState(
    initialFen
      ? initialMode === 'analyze'
        ? 'Position loaded for analysis.'
        : 'Position loaded. Choose settings and start.'
      : 'Choose settings and start a game'
  )
  const [isDragging, setIsDragging] = useState(false)
  const [lastMoveHighlight, setLastMoveHighlight] = useState<string | null>(null)
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null)
  const [legalTargets, setLegalTargets] = useState<string[]>([])

  useEffect(() => {
    if (suggestedColor) {
      setPlayerColor(suggestedColor)
      setBoardOrientation(suggestedColor)
    }
  }, [suggestedColor])

  useEffect(() => {
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

    chessRef.current = new Chess(nextFen)
    setPosition(nextFen)
    setMoveList([])
    setLastMoveHighlight(null)
    clearSelection()
    setGameStarted(nextMode === 'analyze')
    setStatusText(
      nextMode === 'analyze'
        ? 'Position loaded for analysis.'
        : 'Position loaded. Choose settings and start.'
    )

    if (nextColor) {
      setPlayerColor(nextColor)
      setBoardOrientation(nextColor)
    }
  }, [location.search, location.state])

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
    ;(stockfishService as any).send?.('setoption name UCI_LimitStrength value true')
    ;(stockfishService as any).send?.(`setoption name UCI_Elo value ${engineElo}`)
    stockfishService.setSkill({
      skillLevel: 20,
      depth: 12,
      moveTime: 250,
    })
  }, [engineElo])

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!isDragging || !containerRef.current) return

      const rect = containerRef.current.getBoundingClientRect()
      const rightPanelWidth = 390
      const dividerWidth = 18
      const minBoard = 420
      const maxBoard = Math.min(760, rect.width - rightPanelWidth - dividerWidth)

      const nextSize = e.clientX - rect.left
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
    if (mode === 'analyze' && engineReady) {
      refreshEval()
      setStatusText('Analysis mode')
    }
  }, [mode, engineReady, position])

  const material = useMemo(() => getMaterialData(position), [position])

  const checkedKingSquare = getCheckedKingSquare(chessRef.current)
  const isMate = chessRef.current.isCheckmate()
  const isDraw = chessRef.current.isDraw()

  function clearSelection() {
    setSelectedSquare(null)
    setLegalTargets([])
  }

  function refreshEval() {
    if (!engineReady) return
    if (!gameStarted && mode !== 'analyze') return

    stockfishService
      .getEvaluation(chessRef.current.fen())
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

        setEvalText('—')
      })
      .catch((err) => {
        console.error(err)
      })
  }

  function syncFromGame() {
    setPosition(chessRef.current.fen())
    setMoveList(chessRef.current.history())
  }

  function updateGameStateLabels() {
    if (chessRef.current.isCheckmate()) {
      const loser = sideToMove(chessRef.current.fen())
      setStatusText(
        loser === 'white' ? 'Checkmate • Black wins' : 'Checkmate • White wins'
      )
      setEvalText('Mate')
      return
    }

    if (chessRef.current.isDraw()) {
      setStatusText('Draw')
      return
    }

    if (chessRef.current.inCheck()) {
      setStatusText(
        sideToMove(chessRef.current.fen()) === 'white'
          ? 'White is in check'
          : 'Black is in check'
      )
      return
    }

    setStatusText(
      sideToMove(chessRef.current.fen()) === 'white'
        ? 'White to move'
        : 'Black to move'
    )
  }

  function makeEngineMove() {
    if (!engineReady || chessRef.current.isGameOver() || mode === 'analyze') return

    setEngineThinking(true)
    setStatusText('Computer thinking...')

    stockfishService
      .getBestMove(chessRef.current.fen())
      .then((result) => {
        const move = result.bestMove
        if (!move || move.length < 4) return

        const from = move.slice(0, 2)
        const to = move.slice(2, 4)
        const promotion = move.length > 4 ? move.slice(4, 5) : undefined

        const applied = chessRef.current.move({ from, to, promotion })
        if (!applied) return

        setLastMoveHighlight(`${applied.from}${applied.to}${applied.promotion ?? ''}`)
        clearSelection()
        syncFromGame()
        updateGameStateLabels()
        refreshEval()
      })
      .catch((err) => {
        console.error('Engine move failed:', err)
        setStatusText('Engine move failed')
      })
      .finally(() => {
        setEngineThinking(false)
      })
  }

  function startGame() {
    chessRef.current = new Chess(position)
    setGameStarted(true)
    setBoardOrientation(playerColor)
    setEvalText('—')
    setLastMoveHighlight(null)
    clearSelection()
    syncFromGame()
    updateGameStateLabels()

    const turnSide = sideToMove(chessRef.current.fen())
    if (mode === 'play' && turnSide !== playerColor) {
      setTimeout(makeEngineMove, 180)
    } else {
      refreshEval()
    }
  }

  function handleFlipBoard() {
    setBoardOrientation((prev) => (prev === 'white' ? 'black' : 'white'))
  }

  useGlobalBoard({
    isAvailable: true,
    fen: position,
    suggestedColor: sideToMove(position),
    canFlip: true,
    onFlip: handleFlipBoard,
  })

  function handleSetup() {
    chessRef.current = new Chess(position)
    setGameStarted(mode === 'analyze')
    setPosition(chessRef.current.fen())
    setMoveList([])
    setEvalText('—')
    setLastMoveHighlight(null)
    clearSelection()
    setStatusText(
      mode === 'analyze'
        ? 'Analysis mode'
        : initialFen
          ? 'Position loaded. Choose settings and start.'
          : 'Choose settings and start a game'
    )

    if (mode === 'analyze') {
      refreshEval()
    }
  }

  function handleResign() {
    setStatusText(
      playerColor === 'white'
        ? 'White resigned • Black wins'
        : 'Black resigned • White wins'
    )
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

  function tryUserMove(from: string, to: string) {
    const move = chessRef.current.move({
      from,
      to,
      promotion: 'q',
    })

    if (!move) return false

    setLastMoveHighlight(`${move.from}${move.to}${move.promotion ?? ''}`)
    clearSelection()
    syncFromGame()
    updateGameStateLabels()
    refreshEval()

    if (mode === 'play' && !chessRef.current.isGameOver()) {
      setTimeout(makeEngineMove, 120)
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

  const groupedMoves = []
  for (let i = 0; i < moveList.length; i += 2) {
    groupedMoves.push({
      number: Math.floor(i / 2) + 1,
      white: moveList[i] || '',
      black: moveList[i + 1] || '',
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

  const topBoardOrientation = boardOrientation

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(180deg, #262522 0%, #1f1e1b 100%)',
        color: 'white',
        padding: 20,
        cursor: isDragging ? 'col-resize' : 'default',
      }}
    >
      <div
        ref={containerRef}
        style={{
          maxWidth: 1360,
          margin: '0 auto',
          display: 'flex',
          gap: 0,
          alignItems: 'flex-start',
          userSelect: isDragging ? 'none' : 'auto',
        }}
      >
        <div style={{ width: boardSize }}>
          <div
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

          <div style={{ position: 'relative', width: boardSize, height: boardSize }}>
            <Chessboard
              position={position}
              boardOrientation={topBoardOrientation}
              boardWidth={boardSize}
              arePiecesDraggable={gameStarted || mode === 'analyze'}
              customSquareStyles={gameStarted || mode === 'analyze' ? customSquareStyles : {}}
              animationDuration={350}
              customDarkSquareStyle={{ backgroundColor: '#7d9a58' }}
              customLightSquareStyle={{ backgroundColor: '#d8d8bf' }}
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

                return tryUserMove(sourceSquare, targetSquare)
              }}
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

            {(isMate || isDraw) ? (
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

          <div style={{ marginTop: 8 }}>
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
          onMouseDown={() => setIsDragging(true)}
          title="Drag to resize"
          style={{
            width: 18,
            height: boardSize,
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
          style={{
            width: 390,
            minHeight: boardSize + 46,
            background: '#1f1f1d',
            borderRadius: 14,
            overflow: 'hidden',
            boxShadow: '0 10px 28px rgba(0,0,0,0.28)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div
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
            <span>{mode === 'analyze' ? 'Analyze Position' : 'Play Computer'}</span>
            <span style={{ fontSize: 14, opacity: 0.82 }}>
              {engineReady ? 'Ready' : 'Loading'}
              {gameStarted && engineThinking ? ' • Thinking' : ''}
            </span>
          </div>

          {!gameStarted && mode !== 'analyze' ? (
            <div style={{ padding: 18 }}>
              <div style={{ opacity: 0.82, marginBottom: 12 }}>
                {initialFen
                  ? 'This page was opened from an existing board position.'
                  : 'Pick your side and engine strength before starting.'}
              </div>

              {source ? (
                <div
                  style={{
                    marginBottom: 18,
                    fontSize: 13,
                    opacity: 0.72,
                  }}
                >
                  Source: {source}
                </div>
              ) : null}

              <div style={{ marginBottom: 16 }}>
                <div style={labelStyle}>Your Side</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => setPlayerColor('white')}
                    style={{
                      ...segButtonStyle,
                      ...(playerColor === 'white' ? segButtonActiveStyle : {}),
                    }}
                  >
                    White
                  </button>
                  <button
                    onClick={() => setPlayerColor('black')}
                    style={{
                      ...segButtonStyle,
                      ...(playerColor === 'black' ? segButtonActiveStyle : {}),
                    }}
                  >
                    Black
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
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

              <button
                onClick={startGame}
                disabled={!engineReady}
                style={{
                  ...primaryButtonStyle,
                  width: '100%',
                  opacity: engineReady ? 1 : 0.6,
                  cursor: engineReady ? 'pointer' : 'not-allowed',
                }}
              >
                {engineReady ? 'Start Game' : 'Loading Engine...'}
              </button>

              <div style={{ marginTop: 14, fontSize: 14, opacity: 0.8 }}>
                Status: {statusText}
              </div>
            </div>
          ) : (
            <>
              <div
                style={{
                  padding: 16,
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div style={{ marginBottom: 8, fontSize: 16, fontWeight: 700 }}>
                  {mode === 'analyze' ? 'Analysis' : 'Computer Strength'}
                </div>
                <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 8 }}>
                  {mode === 'analyze' ? '∞' : engineElo}
                </div>

                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                  <button onClick={handleFlipBoard} style={btnStyle}>
                    Flip Board
                  </button>
                  <button onClick={handleSetup} style={btnStyle}>
                    Back to Setup
                  </button>
                </div>

                <div style={{ fontSize: 14, opacity: 0.82 }}>{statusText}</div>
              </div>

              <div
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
                  <div style={{ fontSize: 28, fontWeight: 800 }}>{evalText}</div>
                </div>

                <div>
                  <div style={{ fontSize: 13, opacity: 0.75, marginBottom: 6 }}>
                    Mode
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800 }}>
                    {mode === 'analyze' ? 'Analyze' : playerColor === 'white' ? 'White' : 'Black'}
                  </div>
                </div>
              </div>

              <div
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
                      <div style={{ opacity: 0.7 }}>{row.number}.</div>
                      <div>{row.white}</div>
                      <div>{row.black}</div>
                    </div>
                  ))
                )}
              </div>

              <div
                style={{
                  padding: 16,
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 10,
                }}
              >
                <button onClick={handleSetup} style={bigBtnStyle}>
                  Back to Setup
                </button>
                <button onClick={handleResign} style={bigBtnStyle}>
                  Resign
                </button>
                <button style={{ ...bigBtnStyle, opacity: 0.55 }} disabled>
                  Analyze
                </button>
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
  background: '#2f2e2b',
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
  background: 'linear-gradient(180deg, #78b84c 0%, #5f9c3d 100%)',
  color: 'white',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  padding: '12px 18px',
  fontWeight: 800,
  fontSize: 16,
}

const btnStyle: React.CSSProperties = {
  background: '#3a3936',
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