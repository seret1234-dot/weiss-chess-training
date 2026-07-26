import { ReactNode, RefObject, useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import ThemedChessboard from "../../theme/ThemedChessboard"
import './trainerShell.css'
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
 sidePanelWidth?: number
 sidePanelColumns?: 1 | 2
 preventPageScroll?: boolean

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
 kpkBoardOverlay?: ReactNode
}

const MOBILE_TRAINER_BREAKPOINT = 768
const MOBILE_TRAINER_GUTTER = 16

function getMobileBoardSize() {
 if (typeof window === 'undefined') return null

 const viewportWidth = window.innerWidth
 if (viewportWidth > MOBILE_TRAINER_BREAKPOINT) return null

 return Math.max(0, Math.floor(viewportWidth - MOBILE_TRAINER_GUTTER))
}

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
 position: "relative",
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
 sidePanelWidth,
 sidePanelColumns = 1,
 preventPageScroll = false,
 footerLeft,
 footerRight,
 maxWidth = 1600,

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
 kpkBoardOverlay,
 boardOverlay,
 customPieces,
}: TrainerShellProps) {
 const handleActive = isDragging || isHandleHovered
 const resolvedSidePanelWidth = sidePanelWidth ?? (sidePanelColumns === 2 ? 680 : 420)
 const useManagedBoard = typeof fen === 'string' && fen.length > 0
 const [mobileBoardSize, setMobileBoardSize] = useState<number | null>(() => getMobileBoardSize())
 const renderedBoardSize = mobileBoardSize ?? boardSize

 const [selectedSquare, setSelectedSquare] = useState<string | null>(null)
 const [clickTargets, setClickTargets] = useState<string[]>([])

 useEffect(() => {
 const updateMobileBoardSize = () => setMobileBoardSize(getMobileBoardSize())

 updateMobileBoardSize()
 window.addEventListener('resize', updateMobileBoardSize)
 window.visualViewport?.addEventListener('resize', updateMobileBoardSize)

 return () => {
 window.removeEventListener('resize', updateMobileBoardSize)
 window.visualViewport?.removeEventListener('resize', updateMobileBoardSize)
 }
 }, [])

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

 const resolvedPieces = customPieces;

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
 className={[
 'site-mobile-dock-scroll',
 preventPageScroll ? 'trainer-shell-page trainer-shell-page--fixed' : 'trainer-shell-page',
 sidePanelColumns === 2 ? 'trainer-shell-page--wide-side' : '',
 ].filter(Boolean).join(' ')}
 style={{
 minHeight: '100dvh',
 background: 'var(--theme-page-bg)',
 color: 'var(--theme-text)',
 padding: preventPageScroll ? '10px 14px 12px' : '18px 14px 24px',
 fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
 boxSizing: 'border-box',
 cursor: isDragging ? 'col-resize' : 'default',
 }}
 >
 <div className='trainer-shell-content' style={{ maxWidth, margin: '0 auto' }}>
 <div
 className='trainer-shell-title'
 style={{
 marginBottom: preventPageScroll ? 8 : 12,
 display: 'inline-block',
 padding: preventPageScroll ? '7px 13px' : '10px 16px',
 borderRadius: 14,
 background: 'var(--theme-panel-2)',
 border: '1px solid var(--theme-border)',
 boxShadow: '0 10px 28px rgba(0,0,0,0.22)',
 fontSize: preventPageScroll ? 20 : 24,
 fontWeight: 800,
 }}
 >
 {title}
 </div>

 <div
 ref={containerRef}
 className='trainer-shell-layout'
 style={{
 display: 'flex',
 alignItems: 'flex-start',
 gap: 18,
 userSelect: isDragging ? 'none' : 'auto',
 position: 'relative',
 }}
 >
 <div className='trainer-shell-board-column' style={{ flex: '0 0 auto' }}>
 <div
 className='trainer-shell-board-frame'
 style={{
 width: renderedBoardSize + 16,
 background: 'var(--theme-board-frame)',
 borderRadius: 16,
 padding: 8,
 border: '1px solid var(--theme-border)',
 boxShadow: 'var(--theme-shadow)',
 boxSizing: 'border-box',
 }}
 >
 {useManagedBoard ? (
 <div className='trainer-shell-managed-board-row' style={{ display: 'flex', gap: 10 }}>
 {boardLeft ? <div className='trainer-shell-board-left'>{boardLeft}</div> : null}

 <div
 className='trainer-shell-managed-board-slot'
 style={{
 position: 'relative',
 width: renderedBoardSize,
 height: renderedBoardSize,
 }}
 >
 <ThemedChessboard
 id={boardId}
 position={fen}
 onPieceDrop={onPieceDrop}
 onSquareClick={handleSquareClick}
 boardWidth={renderedBoardSize}
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
 promotionDialogVariant="modal"
/>

 {kpkBoardOverlay && (
 <div
 style={{
 position: "absolute",
 inset: 0,
 zIndex: 9999,
 pointerEvents: "none",
 }}
 >
 {kpkBoardOverlay}
 </div>
 )}

 {boardOverlay && (
 <div
 style={{
 position: "absolute",
 inset: 0,
 zIndex: 999,
 pointerEvents: "none",
 }}
 >
 {boardOverlay}
 </div>
 )}

 {boardOverlay}
 </div>
 </div>
 ) : (
 <div className='trainer-shell-custom-board-slot'>{board}</div>
 )}
 </div>

 {(footerLeft || footerRight) && (
 <div
 className='trainer-shell-board-footer'
 style={{
 marginTop: 10,
 display: 'flex',
 justifyContent: 'space-between',
 gap: 12,
 fontSize: 11,
 color: 'var(--theme-muted)',
 padding: '0 4px',
 }}
 >
 <span>{footerLeft}</span>
 <span>{footerRight}</span>
 </div>
 )}
 </div>

 <div
 className='trainer-shell-divider'
 onMouseDown={() => setIsDragging(true)}
 onMouseEnter={() => setIsHandleHovered(true)}
 onMouseLeave={() => setIsHandleHovered(false)}
 style={{
 width: 18,
 alignSelf: 'stretch',
 display: 'flex',
 alignItems: 'flex-start',
 justifyContent: 'center',
 cursor: 'ew-resize',
 }}
 >
 <div
 style={{
 width: 8,
 height: 72,
 borderRadius: 999,
 background: handleActive ? 'var(--theme-accent)' : 'color-mix(in srgb, var(--theme-muted) 45%, transparent)',
 }}
 />
 </div>

 <div
 className={`trainer-shell-side${sidePanelColumns === 2 ? ' trainer-shell-side--columns-2' : ''}`}
 style={{
 width: resolvedSidePanelWidth,
 boxSizing: 'border-box',
 background: 'var(--theme-panel)',
 borderRadius: 16,
 padding: 12,
 border: '1px solid var(--theme-border)',
 boxShadow: 'var(--theme-card-shadow)',
 }}
 >
 {sidePanel}
 </div>

 {subtitle && (
 <div
 className='trainer-shell-subtitle'
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
