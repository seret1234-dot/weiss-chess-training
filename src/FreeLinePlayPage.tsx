import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Chess, Move } from 'chess.js'
import ThemedChessboard from "./theme/ThemedChessboard"
import { supabase, getMasterGamePgnUrl } from './lib/supabase'
import { useRegisterPlayableBoard } from './hooks/useRegisterPlayableBoard'
import { StockfishService } from './lib/chess/stockfishService'
import './FreeLinePlayPage.css'

import { reportTrainingItemCompleted } from "./lib/trainingQuotaEvents"

type FreePlayKind = 'opening' | 'master-game'

type ParsedMove = Move & {
  san: string
}

type LoadedLine = {
  kind: FreePlayKind
  title: string
  subtitle: string
  initialFen: string
  moves: ParsedMove[]
  trainingPath: string
  orientation: 'white' | 'black'
  whiteName: string
  blackName: string
  whiteMeta: string
  blackMeta: string
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

const FREE_LINE_MOBILE_BREAKPOINT = 768
const FREE_LINE_DESKTOP_MAX_BOARD_SIZE = 760

function getFreeLineBoardSize() {
  if (window.innerWidth <= FREE_LINE_MOBILE_BREAKPOINT) {
    return Math.max(0, Math.min(
      FREE_LINE_DESKTOP_MAX_BOARD_SIZE,
      window.innerWidth - 16,
    ))
  }

  return Math.max(
    320,
    Math.min(
      FREE_LINE_DESKTOP_MAX_BOARD_SIZE,
      window.innerWidth - 470,
      window.innerHeight - 160,
    ),
  )
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

function errorText(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'Unknown error'
}

function inferOpeningOrientation(text: string): 'white' | 'black' {
  const value = text.toLowerCase()
  const blackWords = [
    'defense',
    'defence',
    'sicilian',
    'french',
    'caro-kann',
    'pirc',
    'scandinavian',
    'alekhine',
    'philidor',
    'petrov',
    'benoni',
    'benko',
    'budapest',
    'grunfeld',
    'gruenfeld',
    "king's indian",
    "queen's indian",
    'nimzo-indian',
    'dutch',
  ]

  return blackWords.some((word) => value.includes(word)) ? 'black' : 'white'
}

function replayUciMoves(rawMoves: unknown): ParsedMove[] {
  if (!Array.isArray(rawMoves)) return []

  const chess = new Chess()
  const result: ParsedMove[] = []

  for (const raw of rawMoves) {
    const token = String(raw ?? '').trim()
    if (token.length < 4) continue

    const move = chess.move({
      from: token.slice(0, 2),
      to: token.slice(2, 4),
      promotion: token.length >= 5 ? token.slice(4, 5) : undefined,
    })

    if (!move) return []
    result.push(move as ParsedMove)
  }

  return result
}

function replaySanMoves(rawMoves: unknown): ParsedMove[] {
  if (!Array.isArray(rawMoves)) return []

  const chess = new Chess()
  const result: ParsedMove[] = []

  for (const raw of rawMoves) {
    const token = String(raw ?? '').trim()
    if (!token) continue

    const move = chess.move(token)
    if (!move) return []
    result.push(move as ParsedMove)
  }

  return result
}

async function loadOpening(itemId: string): Promise<LoadedLine> {
  const slug = decodeURIComponent(itemId).trim()

  const { data, error } = await supabase
    .from('opening_lines')
    .select(
      'id, slug, name, family, variation, subvariation, eco, uci_moves, san_moves',
    )
    .eq('slug', slug)
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Could not load opening: ${error.message}`)
  if (!data) throw new Error(`Opening not found: ${slug}`)

  const moves =
    replayUciMoves(data.uci_moves).length > 0
      ? replayUciMoves(data.uci_moves)
      : replaySanMoves(data.san_moves)

  if (moves.length === 0) {
    throw new Error('This opening does not contain a playable move line.')
  }

  const subtitle = [data.family, data.eco, data.variation, data.subvariation]
    .filter(Boolean)
    .join(' · ')

  return {
    kind: 'opening',
    title: data.name || slug,
    subtitle,
    initialFen: new Chess().fen(),
    moves,
    trainingPath: `/openings/${encodeURIComponent(data.slug || slug)}`,
    orientation: inferOpeningOrientation(
      [data.name, data.family, data.variation, data.subvariation]
        .filter(Boolean)
        .join(' '),
    ),
    whiteName: 'White',
    blackName: 'Black',
    whiteMeta: String(data.family || ''),
    blackMeta: String(data.eco || ''),
  }
}

async function loadMasterGame(itemId: string): Promise<LoadedLine> {
  const decoded = decodeURIComponent(itemId).trim()
  const numeric = /^\d+$/.test(decoded)

  let query = supabase
    .from('master_games')
    .select(
      'id, slug, title, white, black, event, site, year, round, result, opening, eco, pgn_storage_key',
    )

  query = numeric
    ? query.eq('id', Number(decoded))
    : query.eq('slug', decoded)

  const { data, error } = await query.limit(1).maybeSingle()

  if (error) throw new Error(`Could not load master game: ${error.message}`)
  if (!data) throw new Error(`Master game not found: ${decoded}`)

  let pgn = ''

  if (!pgn && data.pgn_storage_key) {
    const response = await fetch(getMasterGamePgnUrl(data.pgn_storage_key))
    if (!response.ok) {
      throw new Error(`Could not download PGN (${response.status}).`)
    }
    pgn = (await response.text()).trim()
  }

  if (!pgn) throw new Error('This master game has no PGN.')

  const chess = new Chess()
  chess.loadPgn(pgn)
  const moves = chess.history({ verbose: true }) as ParsedMove[]

  if (moves.length === 0) {
    throw new Error('This master game contains no playable moves.')
  }

  const subtitle = [
    `${data.white || 'White'} vs ${data.black || 'Black'}`,
    data.event,
    data.site,
    data.year,
    data.result,
  ]
    .filter(Boolean)
    .join(' · ')

  return {
    kind: 'master-game',
    title: data.title || `${data.white || 'White'} vs ${data.black || 'Black'}`,
    subtitle,
    initialFen: new Chess().fen(),
    moves,
    trainingPath: `/master-games/${encodeURIComponent(data.slug || String(data.id))}`,
    orientation: 'white',
    whiteName: String(data.white || 'White'),
    blackName: String(data.black || 'Black'),
    whiteMeta: data.year == null ? '' : String(data.year),
    blackMeta: String(data.site || data.event || ''),
  }
}

function panelStyle(): CSSProperties {
  return {
    background: '#24211f',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 14,
    padding: 14,
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


function getWhiteEvalPercent(
  scoreCp: number | null,
  mate: number | null,
  checkmateWinner: 'white' | 'black' | null,
) {
  if (checkmateWinner === 'white') return 97
  if (checkmateWinner === 'black') return 3

  if (mate !== null) {
    if (mate > 0) return 97
    if (mate < 0) return 3
    return 50
  }

  if (scoreCp === null) return 50

  const pawns = scoreCp / 100
  const percentage = 50 + 47 * Math.tanh(pawns / 4)
  return Math.max(3, Math.min(97, percentage))
}

function formatWhiteEval(
  scoreCp: number | null,
  mate: number | null,
  checkmateWinner: 'white' | 'black' | null,
  loading: boolean,
  failed: boolean,
) {
  if (checkmateWinner) return 'M'

  if (mate !== null) {
    if (mate === 0) return 'M'
    return `M${Math.abs(mate)}`
  }

  if (scoreCp !== null) {
    const pawns = scoreCp / 100
    if (Math.abs(pawns) < 0.05) return '0.0'
    return `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`
  }

  if (loading) return '...'
  if (failed) return '-'
  return '0.0'
}

export default function FreeLinePlayPage() {
  const { kind, itemId } = useParams()
  const navigate = useNavigate()

  const [line, setLine] = useState<LoadedLine | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [position, setPosition] = useState(new Chess().fen())
  const [currentPly, setCurrentPly] = useState(0)
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null)
  const [orientation, setOrientation] = useState<'white' | 'black'>('white')
  const [status, setStatus] = useState('Loading line...')
  const [flash, setFlash] = useState<'idle' | 'good' | 'bad' | 'complete'>('idle')
  const [showMoves, setShowMoves] = useState(true)
  
  const [evalCp, setEvalCp] = useState<number | null>(null)
  const [evalMate, setEvalMate] = useState<number | null>(null)
  const [evalLoading, setEvalLoading] = useState(true)
  const [evalFailed, setEvalFailed] = useState(false)
  const evalRequestRef = useRef(0)
  const evalEngineRef = useRef<StockfishService | null>(null)
  const evalEngineInitRef = useRef<Promise<void> | null>(null)
  const evalQueueRef = useRef<Promise<void>>(Promise.resolve())
  const [boardSize, setBoardSize] = useState(getFreeLineBoardSize)
  const [isMobileLayout, setIsMobileLayout] = useState(
    () => window.innerWidth <= FREE_LINE_MOBILE_BREAKPOINT,
  )

  useEffect(() => {
    function resize() {
      setBoardSize(getFreeLineBoardSize())
      setIsMobileLayout(window.innerWidth <= FREE_LINE_MOBILE_BREAKPOINT)
    }

    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')

      try {
        if (!itemId) throw new Error('Missing free-play item.')
        if (kind !== 'opening' && kind !== 'master-game') {
          throw new Error('Unknown free-play type.')
        }

        const loaded =
          kind === 'opening'
            ? await loadOpening(itemId)
            : await loadMasterGame(itemId)

        if (cancelled) return

        setLine(loaded)
        setPosition(loaded.initialFen)
        setCurrentPly(0)
        setSelectedSquare(null)
        setOrientation(loaded.orientation)
        setStatus(
          loaded.kind === 'opening'
            ? 'Free Play: play the complete opening line once.'
            : 'Free Play: replay the complete master game once.',
        )
        setFlash('idle')
      } catch (loadError) {
        if (!cancelled) setError(errorText(loadError))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [kind, itemId])

  useEffect(() => {
    return () => {
      evalRequestRef.current += 1
      evalEngineRef.current?.quit()
      evalEngineRef.current = null
      evalEngineInitRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!line) return

    const requestId = ++evalRequestRef.current
    let cancelled = false

    setEvalLoading(true)
    setEvalFailed(false)

    const timer = window.setTimeout(() => {
      const analyze = async () => {
        if (cancelled || requestId !== evalRequestRef.current) return

        try {
          let engine = evalEngineRef.current

          if (!engine) {
            engine = new StockfishService()
            evalEngineRef.current = engine
          }

          if (!evalEngineInitRef.current) {
            evalEngineInitRef.current = engine.init()
          }

          await evalEngineInitRef.current

          if (cancelled || requestId !== evalRequestRef.current) return

          const info = await engine.getEvaluation(position, {
            moveTime: 300,
          })

          if (cancelled || requestId !== evalRequestRef.current) return

          const sideToMove = new Chess(position).turn()
          const whitePerspective = sideToMove === 'w' ? 1 : -1

          setEvalCp(
            typeof info.scoreCp === 'number'
              ? info.scoreCp * whitePerspective
              : null,
          )
          setEvalMate(
            typeof info.mate === 'number'
              ? info.mate * whitePerspective
              : null,
          )
          setEvalFailed(false)
        } catch (engineError) {
          console.error('Free Play evaluation failed:', engineError)

          if (!cancelled && requestId === evalRequestRef.current) {
            setEvalFailed(true)
          }

          evalEngineRef.current?.quit()
          evalEngineRef.current = null
          evalEngineInitRef.current = null
        } finally {
          if (!cancelled && requestId === evalRequestRef.current) {
            setEvalLoading(false)
          }
        }
      }

      evalQueueRef.current = evalQueueRef.current.then(analyze, analyze)
    }, 120)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [position, line])

  useRegisterPlayableBoard({
    fen: position,
    orientation,
    setOrientation,
    suggestedColor: orientation,
    canFlip: true,
  })

  const complete = Boolean(line && currentPly >= line.moves.length)
  const expected = line?.moves[currentPly]
  const lastPlayedPly = currentPly - 1

  
  const displayedPosition = new Chess(position)
  const checkmateWinner: 'white' | 'black' | null =
    displayedPosition.isCheckmate()
      ? displayedPosition.turn() === 'w'
        ? 'black'
        : 'white'
      : null

  const whiteEvalPercent = getWhiteEvalPercent(
    evalCp,
    evalMate,
    checkmateWinner,
  )
  const evalText = formatWhiteEval(
    evalCp,
    evalMate,
    checkmateWinner,
    evalLoading,
    evalFailed,
  )
  const evalHasValue =
    checkmateWinner !== null || evalMate !== null || evalCp !== null
  const evalFavoursWhite =
    checkmateWinner !== null
      ? checkmateWinner === 'white'
      : evalMate !== null
        ? evalMate >= 0
        : (evalCp ?? 0) >= 0
  const evalLabelAtBottom =
    evalFavoursWhite === (orientation === 'white')
const moveRows = useMemo(() => {
    const rows: Array<{
      moveNumber: number
      white?: string
      black?: string
      whitePly: number
      blackPly: number
    }> = []

    if (!line) return rows

    for (let ply = 0; ply < line.moves.length; ply += 2) {
      rows.push({
        moveNumber: Math.floor(ply / 2) + 1,
        white: line.moves[ply]?.san,
        black: line.moves[ply + 1]?.san,
        whitePly: ply,
        blackPly: ply + 1,
      })
    }

    return rows
  }, [line])

  function getLegalTargets(fromSquare: string) {
    if (!line || complete) return []

    const chess = new Chess(position)
    return (chess.moves({ verbose: true }) as Array<{ from: string; to: string }>)
      .filter((move) => move.from === fromSquare)
      .map((move) => move.to)
  }

  function squareStyles() {
    const styles: Record<string, CSSProperties> = {}

    if (selectedSquare) {
      styles[selectedSquare] = {
        boxShadow: 'inset 0 0 0 4px rgba(255, 213, 74, 0.85)',
        backgroundColor: 'rgba(255, 213, 74, 0.22)',
      }
    }

    for (const square of getLegalTargets(selectedSquare || '')) {
      styles[square] = {
        backgroundImage:
          'radial-gradient(circle, rgba(20,20,20,0.32) 0%, rgba(20,20,20,0.32) 22%, transparent 24%)',
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        backgroundSize: '38% 38%',
      }
    }

    return styles
  }

  function onSquareClick(square: string) {
    if (!line || complete) return

    const chess = new Chess(position)
    const clicked = chess.get(square as any)
    const turn = chess.turn()

    if (selectedSquare === square) {
      setSelectedSquare(null)
      return
    }

    if (clicked && clicked.color === turn && getLegalTargets(square).length > 0) {
      setSelectedSquare(square)
      return
    }

    if (selectedSquare) {
      const sourcePiece = chess.get(selectedSquare as any)
      const moved = onPieceDrop(
        selectedSquare,
        square,
        sourcePiece ? `${sourcePiece.color}${sourcePiece.type}` : '',
      )

      if (moved) {
        setSelectedSquare(null)
        return
      }
    }

    setSelectedSquare(null)
  }

  function onPieceDrop(sourceSquare: string, targetSquare: string, piece: string) {
    if (!line || complete || !expected) return false

    const chess = new Chess(position)
    const promotion =
      expected.promotion ||
      (piece?.toLowerCase() === 'wp' && targetSquare.endsWith('8')
        ? 'q'
        : piece?.toLowerCase() === 'bp' && targetSquare.endsWith('1')
          ? 'q'
          : undefined)

    const attempted = chess.move({
      from: sourceSquare,
      to: targetSquare,
      promotion,
    })

    if (!attempted) return false

    const correct =
      attempted.from === expected.from &&
      attempted.to === expected.to &&
      (attempted.promotion || undefined) === (expected.promotion || undefined)

    if (!correct) {
      setSelectedSquare(null)
      setStatus(`Wrong move. The line continues with ${expected.san}.`)
      setFlash('bad')
      return false
    }

    const nextPly = currentPly + 1
    setPosition(chess.fen())
    setCurrentPly(nextPly)
    setSelectedSquare(null)

    if (nextPly >= line.moves.length) {
      reportTrainingItemCompleted(
        line.kind === 'opening' ? 'opening' : 'master_game',
        `free-play:${line.kind}:${itemId}`,
      )
      setStatus(
        line.kind === 'opening'
          ? 'Line complete. No training progress was changed.'
          : 'Game complete. No training progress was changed.',
      )
      setFlash('complete')
    } else {
      setStatus('Correct. Continue the line.')
      setFlash('good')
    }

    return true
  }

  function restart() {
    if (!line) return

    setPosition(line.initialFen)
    setCurrentPly(0)
    setSelectedSquare(null)
    setFlash('idle')
    setStatus(
      line.kind === 'opening'
        ? 'Free Play: play the complete opening line once.'
        : 'Free Play: replay the complete master game once.',
    )
  }

  if (loading) {
    return (
      <div
        className="free-line-play-page site-mobile-dock-scroll"
        style={{
          minHeight: '100vh',
          background: '#161512',
          color: '#f3f3f3',
          padding: 40,
          fontFamily: 'Arial, sans-serif',
        }}
      >
        Loading Free Play...
      </div>
    )
  }

  if (error || !line) {
    return (
      <div
        className="free-line-play-page site-mobile-dock-scroll"
        style={{
          minHeight: '100vh',
          background: '#161512',
          color: '#f3f3f3',
          padding: 40,
          fontFamily: 'Arial, sans-serif',
        }}
      >
        <h1>Free Play could not load</h1>
        <div style={{ color: '#ffb4b4', marginBottom: 18 }}>{error}</div>
        <button type="button" onClick={() => navigate(-1)}>
          Go back
        </button>
      </div>
    )
  }

  const statusBackground =
    flash === 'bad'
      ? 'rgba(190,60,60,0.18)'
      : flash === 'complete'
        ? 'rgba(90,160,210,0.18)'
        : flash === 'good'
          ? 'rgba(100,170,90,0.18)'
          : '#2a2523'

  const whitePlayer = {
    name: line.whiteName,
    side: 'White',
    meta: line.whiteMeta,
  }
  const blackPlayer = {
    name: line.blackName,
    side: 'Black',
    meta: line.blackMeta,
  }
  const topPlayer = orientation === 'white' ? blackPlayer : whitePlayer
  const bottomPlayer = orientation === 'white' ? whitePlayer : blackPlayer

  return (
    <div
      className="free-line-play-page site-mobile-dock-scroll"
      style={{
        minHeight: '100vh',
        background: '#161512',
        color: '#f3f3f3',
        padding: '18px 14px 28px',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <div className="free-line-play-page__content" style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div
          className="free-line-play-page__header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 14,
            flexWrap: 'wrap',
            marginBottom: 14,
          }}
        >
          <div>
            <div
              style={{
                display: 'inline-block',
                background: '#2f4f73',
                borderRadius: 999,
                padding: '6px 11px',
                fontSize: 12,
                fontWeight: 800,
                marginBottom: 9,
              }}
            >
              FREE PLAY · NO PROGRESS CHANGES
            </div>
            <h1 style={{ margin: 0, fontSize: 28 }}>{line.title}</h1>
            <div style={{ color: '#bdbdbd', marginTop: 6 }}>{line.subtitle}</div>
          </div>

          <div
            className="free-line-play-page__mode-actions"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: '#24211f',
              borderRadius: 12,
              padding: 6,
            }}
          >
            <button
              type="button"
              onClick={() => navigate(line.trainingPath)}
              style={{
                border: 0,
                borderRadius: 8,
                padding: '9px 13px',
                background: '#302e2b',
                color: '#ddd',
                cursor: 'pointer',
                fontWeight: 800,
              }}
            >
              Training
            </button>
            <span
              style={{
                borderRadius: 8,
                padding: '9px 13px',
                background: '#2f4f73',
                color: '#fff',
                fontWeight: 800,
              }}
            >
              Free Play
            </span>
          </div>
        </div>

        <div
          className="free-line-play-page__layout"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 18,
            flexWrap: 'wrap',
          }}
        >
          <div
            className="free-line-play-page__board-card"
            style={{
              flex: '0 0 auto',
              padding: 8,
              borderRadius: 16,
              background: '#201d1b',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <div
              className="free-line-play-page__player-bar"
              data-name="free-play-player-bar-aligned"
              style={{
                ...playerBarStyle(),
                marginLeft: 36,
                width: boardSize,
                boxSizing: 'border-box',
              }}
            >
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
                <div style={{ fontSize: 12, color: '#b8b8b8', marginTop: 2 }}>
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

            <div
              className="free-line-play-page__board-row"
              style={{
                display: 'flex',
                alignItems: 'stretch',
                gap: 8,
              }}
            >
              <div
                className="free-line-play-page__eval-bar"
                data-name="free-play-eval-bar"
                title={`Evaluation: ${evalText} from White's perspective`}
                style={{
                  width: isMobileLayout ? '100%' : 28,
                  height: isMobileLayout ? 18 : boardSize,
                  borderRadius: isMobileLayout ? 999 : 7,
                  overflow: 'hidden',
                  background: '#111',
                  border: '1px solid rgba(255,255,255,0.16)',
                  position: 'relative',
                  flex: '0 0 auto',
                  boxSizing: 'border-box',
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    background: '#f2f2f2',
                    transition: isMobileLayout
                      ? 'width 180ms ease'
                      : 'height 180ms ease',
                    ...(isMobileLayout
                      ? {
                          top: 0,
                          bottom: 0,
                          width: `${whiteEvalPercent}%`,
                          ...(orientation === 'white'
                            ? { left: 0 }
                            : { right: 0 }),
                        }
                      : {
                          left: 0,
                          width: '100%',
                          height: `${whiteEvalPercent}%`,
                          ...(orientation === 'white'
                            ? { bottom: 0 }
                            : { top: 0 }),
                        }),
                  }}
                />

                <div
                  style={{
                    position: 'absolute',
                    ...(isMobileLayout
                      ? {
                          top: 0,
                          bottom: 0,
                          left: '50%',
                          width: 1,
                        }
                      : {
                          left: 0,
                          width: '100%',
                          top: '50%',
                          height: 1,
                        }),
                    background: 'rgba(128,128,128,0.55)',
                  }}
                />

                <div
                  style={{
                    position: 'absolute',
                    left: 1,
                    right: 1,
                    textAlign: 'center',
                    fontSize: 10,
                    lineHeight: 1,
                    fontWeight: 900,
                    zIndex: 2,
                    color: evalHasValue
                      ? evalFavoursWhite
                        ? '#111'
                        : '#fff'
                      : '#ddd',
                    ...(isMobileLayout
                      ? {
                          top: '50%',
                          transform: 'translateY(-50%)',
                        }
                      : evalHasValue
                        ? evalLabelAtBottom
                          ? { bottom: 7 }
                          : { top: 7 }
                        : {
                            top: '50%',
                            transform: 'translateY(-50%)',
                          }),
                  }}
                >
                  {evalText}
                </div>

                {evalLoading ? (
                  <div
                    style={{
                      position: 'absolute',
                      left: 3,
                      right: 3,
                      bottom: 2,
                      height: 2,
                      borderRadius: 999,
                      background: 'rgba(95,168,255,0.9)',
                    }}
                  />
                ) : null}
              </div>

            <ThemedChessboard
              id={`free-play-${line.kind}`}
              position={position}
              boardOrientation={orientation}
              boardWidth={boardSize}
              onPieceDrop={onPieceDrop}
              onSquareClick={onSquareClick}

              customSquareStyles={squareStyles()}
              customBoardStyle={{
                borderRadius: 8,
                boxShadow: '0 12px 30px rgba(0,0,0,0.28)',
              }}
              customDarkSquareStyle={{ backgroundColor: '#779455' }}
              customLightSquareStyle={{ backgroundColor: '#ebecd0' }}
              arePiecesDraggable={!complete}
            />
            </div>

            <div style={{ height: 8 }} />

            <div
              className="free-line-play-page__player-bar"
              data-name="free-play-player-bar-aligned"
              style={{
                ...playerBarStyle(),
                marginLeft: 36,
                width: boardSize,
                boxSizing: 'border-box',
              }}
            >
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
                <div style={{ fontSize: 12, color: '#b8b8b8', marginTop: 2 }}>
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

          <div
            className="free-line-play-page__side-panel"
            style={{
              width: 340,
              maxHeight: boardSize + 16,
              overflowY: 'auto',
              paddingRight: 4,
            }}
          >
            <div style={{ ...panelStyle(), marginBottom: 12 }}>
              <div style={{ fontSize: 13, color: '#bdbdbd', marginBottom: 5 }}>
                Progress through line
              </div>
              <div style={{ fontSize: 20, fontWeight: 800 }}>
                {Math.min(currentPly, line.moves.length)} / {line.moves.length} plies
              </div>
              <div
                style={{
                  height: 9,
                  borderRadius: 999,
                  background: '#3a3431',
                  marginTop: 10,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(
                      100,
                      (currentPly / Math.max(1, line.moves.length)) * 100,
                    )}%`,
                    background: complete ? '#5fa8ff' : '#7fa650',
                  }}
                />
              </div>
            </div>

            <div
              style={{
                ...panelStyle(),
                background: statusBackground,
                marginBottom: 12,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 5 }}>
                Status
              </div>
              <div style={{ lineHeight: 1.45 }}>{status}</div>
              {!complete && expected ? (
                <div style={{ color: '#bdbdbd', fontSize: 12, marginTop: 8 }}>
                  Move {Math.floor(currentPly / 2) + 1}
                  {currentPly % 2 === 0 ? ' · White' : ' · Black'}
                </div>
              ) : null}
            </div>

            <div className="free-line-play-page__actions" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button
                type="button"
                onClick={restart}
                style={{
                  flex: 1,
                  border: 0,
                  borderRadius: 10,
                  padding: '10px 12px',
                  background: '#7fa650',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 800,
                }}
              >
                {line.kind === 'opening' ? 'Restart Line' : 'Restart Game'}
              </button>
              <button
                type="button"
                onClick={() => setShowMoves((value) => !value)}
                style={{
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10,
                  padding: '10px 12px',
                  background: '#302e2b',
                  color: '#fff',
                  cursor: 'pointer',
                  fontWeight: 800,
                }}
              >
                {showMoves ? 'Hide Moves' : 'Show Moves'}
              </button>
            </div>

            {showMoves ? (
              <div className="free-line-play-page__moves" style={panelStyle()}>
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>
                  Complete line
                </div>
                <div style={{ display: 'grid', gap: 5 }}>
                  {moveRows.map((row) => (
                    <div
                      key={row.moveNumber}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '34px 1fr 1fr',
                        gap: 7,
                        alignItems: 'center',
                        fontSize: 13,
                      }}
                    >
                      <div style={{ color: '#999' }}>{row.moveNumber}.</div>
                      <div
                        style={{
                          borderRadius: 7,
                          padding: '5px 7px',
                          background:
                            lastPlayedPly === row.whitePly
                              ? 'rgba(95,168,255,0.24)'
                              : lastPlayedPly > row.whitePly
                                ? 'rgba(127,166,80,0.12)'
                                : 'transparent',
                        }}
                      >
                        {row.white || ''}
                      </div>
                      <div
                        style={{
                          borderRadius: 7,
                          padding: '5px 7px',
                          background:
                            lastPlayedPly === row.blackPly
                              ? 'rgba(95,168,255,0.24)'
                              : lastPlayedPly > row.blackPly
                                ? 'rgba(127,166,80,0.12)'
                                : 'transparent',
                        }}
                      >
                        {row.black || ''}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
