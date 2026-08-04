import { useEffect, useRef, useState } from 'react'
import './chunkCompletionOverlay.css'

export type ChunkCompletionResult = {
  theme: string
  stage: number
  attempts: number
  correct: number
  hints: number
  mixed?: boolean
  masteryIncreased?: boolean
  reinforcementActivated?: boolean
}

export const DEBUG_CHUNK_COMPLETION_RESULT: ChunkCompletionResult = {
  theme: 'hook-mate',
  stage: 1,
  attempts: 24,
  correct: 23,
  hints: 0,
}

export function isChunkCompletionDebugHost(hostname: string) {
  const host = hostname.trim().toLowerCase()
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.vercel.app')
}

export function isChunkCompletionDebugEnabled(hostname: string, value: string | null) {
  return value === '1' && isChunkCompletionDebugHost(hostname)
}

export function shouldShowChunkCompletionOverlay(
  result: ChunkCompletionResult | null,
  dismissed: boolean,
): result is ChunkCompletionResult {
  return result !== null && !dismissed
}

export function createChunkCompletionActionOnceController() {
  let started = false
  return {
    run(callback: () => void) {
      if (started) return false
      started = true
      callback()
      return true
    },
  }
}

// Kept as a narrow compatibility alias for the existing Continue Auto test seam.
export const createContinueAutoOnceController = createChunkCompletionActionOnceController

export function getChunkCompletionSecondaryAction(hasNextChunk: boolean) {
  return hasNextChunk ? 'next' : 'review'
}

function formatTheme(theme: string) {
  return theme
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function ChunkCompletionOverlay({
  result,
  chunkNumber,
  chunkCount,
  hasNextChunk,
  onContinueAuto,
  onNextChunk,
  onDismiss,
}: {
  result: ChunkCompletionResult
  chunkNumber: number
  chunkCount: number
  hasNextChunk: boolean
  onContinueAuto: () => void
  onNextChunk: () => void
  onDismiss: () => void
}) {
  const continueButtonRef = useRef<HTMLButtonElement | null>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const actionControllerRef = useRef(createChunkCompletionActionOnceController())
  const [continuing, setContinuing] = useState(false)

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const frame = window.requestAnimationFrame(() => continueButtonRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [])

  function dismiss() {
    const returnFocusTo = previouslyFocusedRef.current
    onDismiss()
    window.requestAnimationFrame(() => returnFocusTo?.focus())
  }

  function continueAuto() {
    const started = actionControllerRef.current.run(() => {
      setContinuing(true)
      onContinueAuto()
    })
    if (!started) return
  }

  function nextChunk() {
    const started = actionControllerRef.current.run(() => {
      setContinuing(true)
      onNextChunk()
    })
    if (!started) return
  }

  return (
    <div className="chunk-completion-overlay" role="dialog" aria-modal="true" aria-labelledby="chunk-completion-title" aria-describedby="chunk-completion-summary" onKeyDown={(event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        dismiss()
      }
    }}>
      <section className="chunk-completion-overlay__panel">
        <div className="chunk-completion-overlay__check" aria-hidden="true">✓</div>
        <h2 id="chunk-completion-title">Chunk completed!</h2>
        <p className="chunk-completion-overlay__course">{formatTheme(result.theme)} · M{result.stage}</p>
        <p className="chunk-completion-overlay__chunk">Chunk {chunkNumber} of {chunkCount}</p>
        <p id="chunk-completion-summary" className="chunk-completion-overlay__summary">
          {result.correct} / {result.attempts} first-attempt solves<br />
          {result.hints} hints used
        </p>
        <div className="chunk-completion-overlay__actions">
          <button ref={continueButtonRef} type="button" className="chunk-completion-overlay__continue" onClick={continueAuto} disabled={continuing}>
            {continuing ? 'Opening Auto Study…' : 'Continue Auto'}
          </button>
          {getChunkCompletionSecondaryAction(hasNextChunk) === 'next' ? (
            <button type="button" className="chunk-completion-overlay__stay" onClick={nextChunk} disabled={continuing}>
              Next chunk
            </button>
          ) : (
            <button type="button" className="chunk-completion-overlay__stay" onClick={dismiss}>
              Review chunk
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
