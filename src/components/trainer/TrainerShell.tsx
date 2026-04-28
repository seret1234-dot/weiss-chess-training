import { ReactNode, RefObject, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { Chessboard } from 'react-chessboard'

type PieceRendererProps = {
  squareWidth: number
}

type CustomPiecesMap = Record<
  string,
  (props: PieceRendererProps) => JSX.Element
>

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

type TrainerShellProps = {
  title: string
  subtitle?: string
  boardSize: number
  isDragging: boolean
  isHandleHovered: boolean
  setIsDragging: (value: boolean) => void
  setIsHandleHovered: (value: boolean) => void
  containerRef: RefObject<HTMLDivElement | null>
  sidePanel: ReactNode
  footerLeft?: ReactNode
  footerRight?: ReactNode
  maxWidth?: number

  board?: ReactNode

  boardId?: string
  fen?: string
  onPieceDrop?: (sourceSquare: string, targetSquare: string) => boolean
  getLegalTargets?: (fromSquare: string) => string[]
  boardOrientation?: 'white' | 'black'
  customDarkSquareStyle?: CSSProperties
  customLightSquareStyle?: CSSProperties
  customBoardStyle?: CSSProperties
  customSquareStyles?: Record<string, CSSProperties>
  arePiecesDraggable?: boolean
  boardLeft?: ReactNode
  boardOverlay?: ReactNode
  customPieces?: CustomPiecesMap
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

export default function TrainerShell({
  title,
  subtitle,
  boardSize,
  isDragging,
  isHandleHovered,
  setIsDragging,
  setIsHandleHovered,
  containerRef,
  sidePanel,
  footerLeft,
  footerRight,
  maxWidth = 1280,

  board,

  boardId = 'TrainerShellBoard',
  fen,
  onPieceDrop,
  getLegalTargets,
  boardOrientation = 'white',
  customDarkSquareStyle = { backgroundColor: '#769656' },
  customLightSquareStyle = { backgroundColor: '#eeeed2' },
  customBoardStyle,
  customSquareStyles,
  arePiecesDraggable = true,
  boardLeft,
  boardOverlay,
  customPieces,
}: TrainerShellProps) {
  const handleActive = isDragging || isHandleHovered
  const useManagedBoard = typeof fen === 'string' && fen.length > 0

  const [selectedSquare, setSelectedSquare] = useState<string | null>(null)
  const [clickTargets, setClickTargets] = useState<string[]>([])

  const anastasiaPieces = useMemo<CustomPiecesMap>(() => {
    return {
      wP: ({ squareWidth }) => renderPieceImage('wP', squareWidth),
      wN: ({ squareWidth }) => renderPieceImage('wN', squareWidth),
      wB: ({ squareWidth }) => renderPieceImage('wB', squareWidth),
      wR: ({ squareWidth }) => renderPieceImage('wR', squareWidth),
      wQ: ({ squareWidth }) => renderPieceImage('wQ', squareWidth),
      wK: ({ squareWidth }) => renderPieceImage('wK', squareWidth),
      bP: ({ squareWidth }) => renderPieceImage('bP', squareWidth),
      bN: ({ squareWidth }) => renderPieceImage('bN', squareWidth),
      bB: ({ squareWidth }) => renderPieceImage('bB', squareWidth),
      bR: ({ squareWidth }) => renderPieceImage('bR', squareWidth),
      bQ: ({ squareWidth }) => renderPieceImage('bQ', squareWidth),
      bK: ({ squareWidth }) => renderPieceImage('bK', squareWidth),
    }
  }, [])

  const resolvedPieces = customPieces ?? anastasiaPieces

  function clearSelection() {
    setSelectedSquare(null)
    setClickTargets([])
  }

  useEffect(() => {
    clearSelection()
  }, [fen])

  function handleSquareClick(square: string) {
    if (!getLegalTargets) return

    if (!selectedSquare) {
      const targets = getLegalTargets(square)
      if (targets.length > 0) {
        setSelectedSquare(square)
        setClickTargets(targets)
      }
      return
    }

    if (square === selectedSquare) {
      clearSelection()
      return
    }

    if (clickTargets.includes(square) && onPieceDrop) {
      const accepted = onPieceDrop(selectedSquare, square)
      clearSelection()

      if (!accepted) {
        const retryTargets = getLegalTargets(square)
        if (retryTargets.length > 0) {
          setSelectedSquare(square)
          setClickTargets(retryTargets)
        }
      }

      return
    }

    const newTargets = getLegalTargets(square)
    if (newTargets.length > 0) {
      setSelectedSquare(square)
      setClickTargets(newTargets)
    } else {
      clearSelection()
    }
  }

  const mergedSquareStyles: Record<string, CSSProperties> = {
    ...(customSquareStyles ?? {}),
  }

  if (selectedSquare) {
    mergedSquareStyles[selectedSquare] = {
      ...(mergedSquareStyles[selectedSquare] ?? {}),
      boxShadow: 'inset 0 0 0 4px rgba(255, 215, 0, 0.9)',
    }
  }

  for (const sq of clickTargets) {
    mergedSquareStyles[sq] = {
      ...(mergedSquareStyles[sq] ?? {}),
      boxShadow: 'inset 0 0 0 4px rgba(80,180,255,0.9)',
      backgroundColor: 'rgba(80,180,255,0.22)',
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#161512',
        color: '#f3f3f3',
        padding: '18px 14px 24px',
        fontFamily: 'Arial, sans-serif',
        boxSizing: 'border-box',
        cursor: isDragging ? 'col-resize' : 'default',
      }}
    >
      <div style={{ maxWidth, margin: '0 auto' }}>
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
          {title}
        </div>

        <div
          ref={containerRef}
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 18,
            userSelect: isDragging ? 'none' : 'auto',
            position: 'relative',
          }}
        >
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
              {useManagedBoard ? (
                <div style={{ display: 'flex', gap: 10 }}>
                  {boardLeft}

                  <div
                    style={{
                      position: 'relative',
                      width: boardSize,
                      height: boardSize,
                    }}
                  >
                    <Chessboard
                      id={boardId}
                      position={fen}
                      onPieceDrop={onPieceDrop}
                      onSquareClick={handleSquareClick}
                      boardWidth={boardSize}
                      boardOrientation={boardOrientation}
                      customPieces={resolvedPieces}
                      customDarkSquareStyle={customDarkSquareStyle}
                      customLightSquareStyle={customLightSquareStyle}
                      customBoardStyle={{
                        borderRadius: '8px',
                        overflow: 'hidden',
                        ...customBoardStyle,
                      }}
                      customSquareStyles={mergedSquareStyles}
                      arePiecesDraggable={arePiecesDraggable}
                    />

                    {boardOverlay}
                  </div>
                </div>
              ) : (
                board
              )}
            </div>

            {(footerLeft || footerRight) && (
              <div
                style={{
                  marginTop: 10,
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 12,
                  fontSize: 11,
                  color: '#b0b0b0',
                  padding: '0 4px',
                }}
              >
                <span>{footerLeft}</span>
                <span>{footerRight}</span>
              </div>
            )}
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
            }}
          >
            <div
              style={{
                width: 8,
                height: 72,
                borderRadius: 999,
                background: handleActive ? '#88a94f' : '#4a4542',
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
            }}
          >
            {sidePanel}
          </div>

          {subtitle && (
            <div
              style={{
                position: 'absolute',
                top: -34,
                right: 0,
                color: '#bdbdbd',
                fontSize: 14,
              }}
            >
              {subtitle}
            </div>
          )}

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
    </div>
  )
}