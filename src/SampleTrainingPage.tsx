import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Chess } from 'chess.js'
import ThemedChessboard from './theme/ThemedChessboard'
import sampleChunk from './data/chunk_1.json'
import { trackAnalyticsEvent } from './lib/analytics'

type SamplePuzzle = {
  fen: string
  solution_move: string
}

const samplePuzzle = sampleChunk[0] as SamplePuzzle

function getBoardWidth() {
  return Math.max(288, Math.min(window.innerWidth - 32, 520))
}

export default function SampleTrainingPage() {
  const navigate = useNavigate()
  const [boardWidth, setBoardWidth] = useState(getBoardWidth)
  // The bundled sample comes from legacy Lichess data whose en-passant field
  // is not accepted by the current chess.js validator. It has no bearing on
  // this position's legal move, so retain the original board while loading it.
  const [game, setGame] = useState(() => new Chess(samplePuzzle.fen, { skipValidation: true }))
  const [feedback, setFeedback] = useState('Find the best move.')
  const [completed, setCompleted] = useState(false)

  useEffect(() => {
    trackAnalyticsEvent('sample_training_started')

    const onResize = () => setBoardWidth(getBoardWidth())
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const boardPosition = useMemo(() => game.fen(), [game])

  function completeSample() {
    if (completed) return
    setCompleted(true)
    trackAnalyticsEvent('sample_training_completed')
    trackAnalyticsEvent('signup_prompt_viewed')
  }

  function onPieceDrop(sourceSquare: string, targetSquare: string) {
    if (completed) return false

    const nextGame = new Chess(game.fen())
    let move
    const promotion = samplePuzzle.solution_move[4]

    try {
      move = nextGame.move({
        from: sourceSquare,
        to: targetSquare,
        ...(promotion ? { promotion } : {}),
      })
    } catch {
      return false
    }

    if (!move) return false

    const playedMove = `${move.from}${move.to}${move.promotion ?? ''}`.toLowerCase()
    if (playedMove !== samplePuzzle.solution_move.toLowerCase()) {
      setFeedback('Not quite. Try another move.')
      return false
    }

    setGame(nextGame)
    setFeedback('Correct — you found the tactic.')
    completeSample()
    return true
  }

  return (
    <main
      style={{
        minHeight: '100dvh',
        boxSizing: 'border-box',
        padding: '28px 16px calc(var(--site-fixed-bottom-clearance, 0px) + 28px)',
        background: 'var(--theme-page-bg, #262421)',
        color: 'var(--theme-text, #f3f3f3)',
      }}
    >
      <section style={{ width: '100%', maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
        <button
          type="button"
          onClick={() => navigate('/')}
          style={{
            alignSelf: 'flex-start',
            border: '1px solid var(--theme-border, rgba(255,255,255,0.18))',
            borderRadius: 999,
            padding: '10px 14px',
            background: 'transparent',
            color: 'inherit',
            cursor: 'pointer',
          }}
        >
          Back to home
        </button>
        <h1 style={{ margin: '24px 0 8px', fontSize: 'clamp(28px, 7vw, 42px)' }}>
          Your 2-minute training session
        </h1>
        <p style={{ margin: '0 0 24px', color: 'var(--theme-muted, #cfcfcf)' }}>
          Solve one tactical position to see how structured practice works.
        </p>

        <div
          style={{
            width: boardWidth,
            maxWidth: '100%',
            margin: '0 auto',
            borderRadius: 12,
            overflow: 'hidden',
            boxShadow: '0 12px 36px rgba(0,0,0,0.28)',
          }}
        >
          <ThemedChessboard
            id="sample-training-board"
            position={boardPosition}
            onPieceDrop={onPieceDrop}
            boardWidth={boardWidth}
            animationDuration={180}
          />
        </div>

        <p aria-live="polite" style={{ minHeight: 24, margin: '20px 0', fontWeight: 700 }}>
          {feedback}
        </p>
      </section>

      {completed && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sample-complete-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 5000,
            display: 'grid',
            placeItems: 'center',
            padding: 16,
            background: 'rgba(0,0,0,0.65)',
          }}
        >
          <section
            style={{
              width: 'min(100%, 440px)',
              boxSizing: 'border-box',
              padding: 28,
              borderRadius: 18,
              background: 'var(--theme-panel, #1f1d1c)',
              color: 'var(--theme-text, #f3f3f3)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.42)',
              textAlign: 'center',
            }}
          >
            <h2 id="sample-complete-title" style={{ marginTop: 0 }}>
              Sample complete
            </h2>
            <p style={{ lineHeight: 1.55 }}>
              Create a free account to save your progress and continue training.
            </p>
            <button
              type="button"
              onClick={() => {
                trackAnalyticsEvent('signup_prompt_clicked')
                navigate('/auth?source=sample-training')
              }}
              style={{
                width: '100%',
                minHeight: 44,
                border: 0,
                borderRadius: 999,
                padding: '12px 18px',
                background: 'var(--theme-accent, #f2c14e)',
                color: 'var(--theme-accent-text, #1f1d1c)',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              Create free account
            </button>
            <button
              type="button"
              onClick={() => navigate('/')}
              style={{
                width: '100%',
                minHeight: 44,
                marginTop: 10,
                border: 0,
                background: 'transparent',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              Return home
            </button>
          </section>
        </div>
      )}
    </main>
  )
}
