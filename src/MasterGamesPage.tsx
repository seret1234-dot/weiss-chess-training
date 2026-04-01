import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Chess, Move } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import games from './data/masterGamesIndex.json'

type MasterGame = {
  id: string
  title?: string
  white: string
  black: string
  event?: string
  site?: string
  year?: number
  round?: string
  result?: string
  opening?: string
  eco?: string
  pgn?: string
  description?: string
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

const MS_PER_MOVE = 3000
const REQUIRED_FAST_RUNS = 5
const GROW_UNTIL = 15
const SLIDE_FROM = 10
const SLIDE_WINDOW = 16
const SLIDE_STEP = 10
const MESSAGE_DELAY_MS = 3000

function parseGame(game: MasterGame) {
  const pgn = (game.pgn || '').trim()

  if (!pgn) {
    return {
      moves: [] as ParsedMove[],
      positionsBeforeEachPly: [new Chess().fen()],
      totalPlies: 0,
      totalFullMoves: 0,
      hasValidPgn: false,
    }
  }

  const base = new Chess()

  try {
    base.loadPgn(pgn)
  } catch (error) {
    return {
      moves: [] as ParsedMove[],
      positionsBeforeEachPly: [new Chess().fen()],
      totalPlies: 0,
      totalFullMoves: 0,
      hasValidPgn: false,
    }
  }

  const replay = new Chess()
  const history = base.history({ verbose: true }) as ParsedMove[]

  const positionsBeforeEachPly: string[] = [replay.fen()]
  for (const mv of history) {
    replay.move(mv)
    positionsBeforeEachPly.push(replay.fen())
  }

  const totalPlies = history.length
  const totalFullMoves = Math.ceil(totalPlies / 2)

  return {
    moves: history,
    positionsBeforeEachPly,
    totalPlies,
    totalFullMoves,
    hasValidPgn: true,
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
    const endPly = Math.min(endFullMove * 2, totalFullMoves * 2) - 1

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
      const endPly = Math.min(end * 2, totalFullMoves * 2) - 1

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
    endPly: totalFullMoves * 2 - 1,
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

function panelCardStyle(): React.CSSProperties {
  return {
    background: '#2a2523',
    borderRadius: 10,
    padding: 12,
    border: '1px solid rgba(255,255,255,0.05)',
  }
}

export default function MasterGamesPage() {
  const { gameId } = useParams()

  const GAME = useMemo(() => {
    return (games as MasterGame[]).find((g) => g.id === gameId) || null
  }, [gameId])

  const parsed = useMemo(() => {
    if (!GAME) {
      return {
        moves: [] as ParsedMove[],
        positionsBeforeEachPly: [new Chess().fen()],
        totalPlies: 0,
        totalFullMoves: 0,
        hasValidPgn: false,
      }
    }
    return parseGame(GAME)
  }, [GAME])

  const stages = useMemo(
    () => buildStages(parsed.totalFullMoves, parsed.positionsBeforeEachPly),
    [parsed.totalFullMoves, parsed.positionsBeforeEachPly],
  )

  const [stageIndex, setStageIndex] = useState(0)
  const [position, setPosition] = useState(stages[0].startFen)
  const [currentPly, setCurrentPly] = useState(stages[0].startPly)
  const [runStartAt, setRunStartAt] = useState<number | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [fastSuccesses, setFastSuccesses] = useState(0)
  const [notationHidden, setNotationHidden] = useState(false)
  const [hasFirstSuccessInStage, setHasFirstSuccessInStage] = useState(false)
  const [status, setStatus] = useState('Play the game moves exactly.')
  const [flash, setFlash] = useState<'idle' | 'good' | 'bad' | 'slow' | 'mastered'>('idle')
  const [gameMastered, setGameMastered] = useState(false)

  const resetTimeoutRef = useRef<number | null>(null)
  const nextStageTimeoutRef = useRef<number | null>(null)

  const stage = stages[Math.min(stageIndex, stages.length - 1)]
  const stageRows = useMemo(
    () => getStageMoveRows(parsed.moves, stage.startPly, stage.endPly),
    [parsed.moves, stage.startPly, stage.endPly],
  )

  const stagePlyCount = Math.max(0, stage.endPly - stage.startPly + 1)
  const fastLimitMs = Math.max(1000, stagePlyCount * MS_PER_MOVE)

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
    setStageIndex(0)
    setPosition(stages[0].startFen)
    setCurrentPly(stages[0].startPly)
    setRunStartAt(null)
    setElapsedMs(0)
    setFastSuccesses(0)
    setNotationHidden(false)
    setHasFirstSuccessInStage(false)
    setStatus(parsed.hasValidPgn ? 'Play the game moves exactly.' : 'PGN missing for this game.')
    setFlash('idle')
    setGameMastered(false)
  }, [gameId, stages, parsed.hasValidPgn])

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
    setStatus(parsed.hasValidPgn ? 'Play the game moves exactly.' : 'PGN missing for this game.')
    setFlash('idle')
  }

  function resetWholeStageProgress() {
    clearTimers()
    setFastSuccesses(0)
    setNotationHidden(false)
    setHasFirstSuccessInStage(false)
    setGameMastered(false)
    beginStageRun()
  }

  function moveToNextStage() {
    clearTimers()

    const isLastStage = stageIndex >= stages.length - 1
    if (isLastStage) {
      setGameMastered(true)
      setFlash('mastered')
      setStatus('Mastered. Final full-game stage completed 5 fast times.')
      return
    }

    const nextIndex = stageIndex + 1
    const nextStage = stages[nextIndex]

    setStageIndex(nextIndex)
    setFastSuccesses(0)
    setNotationHidden(false)
    setHasFirstSuccessInStage(false)
    setPosition(nextStage.startFen)
    setCurrentPly(nextStage.startPly)
    setRunStartAt(null)
    setElapsedMs(0)
    setFlash('idle')
    setStatus(`Stage ${nextStage.startFullMove}-${nextStage.endFullMove}. First run shows the moves.`)
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

  function completeRun() {
    const finishedMs = runStartAt == null ? elapsedMs : Date.now() - runStartAt

    setElapsedMs(finishedMs)
    setRunStartAt(null)

    const wasFast = finishedMs <= fastLimitMs

    if (!hasFirstSuccessInStage) {
      setHasFirstSuccessInStage(true)
      setNotationHidden(true)
    }

    if (wasFast) {
      const nextFastSuccesses = fastSuccesses + 1
      setFastSuccesses(nextFastSuccesses)

      if (nextFastSuccesses >= REQUIRED_FAST_RUNS) {
        setStatus(
          stageIndex === stages.length - 1
            ? 'Final stage cleared.'
            : `Stage ${stage.startFullMove}-${stage.endFullMove} cleared.`,
        )
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
    if (!parsed.hasValidPgn) return false
    if (gameMastered) return false
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

    if (!attempted) {
      return false
    }

    const correct =
      attempted.from === expected.from &&
      attempted.to === expected.to &&
      (attempted.promotion ?? undefined) === (expected.promotion ?? undefined)

    if (!correct) {
      restartRunAfterDelay(`Wrong move. Expected ${expected.san}. Start again.`, 'bad')
      return false
    }

    const nextFen = working.fen()

    if (runStartAt == null) {
      setRunStartAt(Date.now())
      setElapsedMs(0)
    }

    setPosition(nextFen)

    const nextPly = currentPly + 1
    setCurrentPly(nextPly)

    if (nextPly > stage.endPly) {
      window.setTimeout(() => {
        completeRun()
      }, 120)
    } else {
      setStatus('Correct. Keep going.')
      setFlash('idle')
    }

    return true
  }

  useEffect(() => {
    beginStageRun()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stageIndex])

  if (!GAME) {
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
        Game not found
      </div>
    )
  }

  if (!parsed.hasValidPgn) {
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
        <div style={{ fontSize: 28, fontWeight: 800, marginBottom: 12 }}>
          {GAME.title || `${GAME.white} vs ${GAME.black}`}
        </div>
        <div style={{ fontSize: 16, color: '#d0d0d0', marginBottom: 8 }}>
          This route is working, but this game does not yet have a PGN in `masterGamesIndex.json`.
        </div>
        <div style={{ fontSize: 14, color: '#b8b8b8' }}>
          Add a `pgn` field for this game and it will load its own moves.
        </div>
      </div>
    )
  }

  const currentExpected = parsed.moves[currentPly]
  const totalStages = stages.length
  const stageNumber = stageIndex + 1
  const isFinalStage = stageIndex === stages.length - 1
  const stageProgressPercent = Math.min(100, (fastSuccesses / REQUIRED_FAST_RUNS) * 100)

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

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#2b2623',
        color: '#f3f3f3',
        padding: '18px 14px 24px',
        fontFamily: 'Arial, sans-serif',
      }}
    >
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
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
          Master Games
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18 }}>
          <div style={{ flex: '0 0 auto' }}>
            <Chessboard
              id="master-games-board"
              position={position}
              onPieceDrop={onPieceDrop}
              boardWidth={820}
              arePiecesDraggable={!gameMastered}
              animationDuration={180}
            />
          </div>

          <div
            style={{
              width: 320,
              background: '#1f1d1c',
              borderRadius: 12,
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
                  Full Game Replay
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
                <div style={{ color: '#e6e6e6', fontWeight: 700 }}>
                  {GAME.white} vs {GAME.black}
                </div>
                <div style={{ color: '#d3d3d3' }}>
                  {stageNumber}/{totalStages}
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
                <div>{GAME.event || 'Unknown event'}</div>
                <div>{GAME.year || '—'}</div>
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
                <div style={{ color: '#dcdcdc', fontWeight: 700 }}>Stage</div>
                <div style={{ color: '#f1f1f1', fontWeight: 700 }}>
                  {stage.startFullMove}-{stage.endFullMove}
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
                {isFinalStage ? 'Play the full game' : `Play moves ${stage.startFullMove}-${stage.endFullMove}`}
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
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                {notationHidden ? 'Moves hidden' : 'Current stage moves'}
              </div>

              {!notationHidden ? (
                <div
                  style={{
                    maxHeight: 255,
                    overflowY: 'auto',
                    paddingRight: 4,
                  }}
                >
                  {stageRows.map((row) => (
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
                  First success completed. Now replay this stage from memory.
                </div>
              )}
            </div>

            <div style={{ ...panelCardStyle(), marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                Game info
              </div>
              <div style={{ fontSize: 12, color: '#d0d0d0', lineHeight: 1.55 }}>
                <div>Opening: {GAME.opening || 'Unknown opening'}</div>
                <div>Result: {GAME.result || '—'}</div>
                <div>Round: {GAME.round || '—'}</div>
                <div>Site: {GAME.site || '—'}</div>
                <div>ECO: {GAME.eco || '—'}</div>
              </div>
            </div>

            <div style={{ ...panelCardStyle(), marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                Next expected move
              </div>
              <div style={{ fontSize: 12, color: '#d0d0d0' }}>
                {notationHidden
                  ? 'Hidden during memory runs.'
                  : currentExpected
                    ? currentExpected.san
                    : 'Run complete.'}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={beginStageRun}
                style={{
                  flex: 1,
                  background: '#4c4744',
                  color: '#f3f3f3',
                  border: 'none',
                  borderRadius: 10,
                  padding: '13px 12px',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Restart Run
              </button>

              <button
                onClick={resetWholeStageProgress}
                style={{
                  flex: 1,
                  background: '#88a94f',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 10,
                  padding: '13px 12px',
                  fontSize: 14,
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
              {GAME.id}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}