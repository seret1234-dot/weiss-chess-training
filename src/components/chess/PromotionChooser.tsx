import { createPortal } from 'react-dom'
import { useEffect, useId, useRef, type KeyboardEvent } from 'react'

export type PromotionPiece = 'q' | 'r' | 'b' | 'n'

type PromotionChooserProps = {
  color: 'w' | 'b'
  onSelect: (piece: PromotionPiece) => void
  onCancel: () => void
}

const labels: Array<{ piece: PromotionPiece; name: string }> = [
  { piece: 'q', name: 'Queen' },
  { piece: 'r', name: 'Rook' },
  { piece: 'b', name: 'Bishop' },
  { piece: 'n', name: 'Knight' },
]

const glyphs: Record<'w' | 'b', Record<PromotionPiece, string>> = {
  w: { q: '♕', r: '♖', b: '♗', n: '♘' },
  b: { q: '♛', r: '♜', b: '♝', n: '♞' },
}

/** Explicit choice UI for tap/click board controls. */
export default function PromotionChooser({ color, onSelect, onCancel }: PromotionChooserProps) {
  const titleId = useId()
  const instructionsId = useId()
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const firstChoiceRef = useRef<HTMLButtonElement | null>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const frame = window.requestAnimationFrame(() => firstChoiceRef.current?.focus())
    return () => {
      window.cancelAnimationFrame(frame)
      const returnFocusTo = previouslyFocusedRef.current
      window.requestAnimationFrame(() => returnFocusTo?.focus())
    }
  }, [])

  if (typeof document === 'undefined') return null

  function handleDialogKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
      return
    }
    if (event.key !== 'Tab') return

    const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
    if (!controls?.length) return
    const first = controls[0]
    const last = controls[controls.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={instructionsId}
      data-testid="promotion-chooser"
      onClick={onCancel}
      onKeyDown={handleDialogKeyDown}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483646,
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        background: 'rgba(0, 0, 0, 0.56)',
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          width: 'min(100%, 360px)',
          padding: 16,
          border: '1px solid var(--theme-border)',
          borderRadius: 16,
          background: 'var(--theme-panel)',
          color: 'var(--theme-text)',
          boxShadow: '0 18px 44px rgba(0, 0, 0, 0.45)',
        }}
      >
        <div id={titleId} style={{ marginBottom: 6, fontWeight: 850, fontSize: 18 }}>Promote pawn to</div>
        <p id={instructionsId} style={{ margin: '0 0 12px', fontSize: 14 }}>Choose Queen, Rook, Bishop, or Knight. Press Escape to cancel.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
          {labels.map(({ piece, name }, index) => (
            <button
              key={piece}
              ref={index === 0 ? firstChoiceRef : undefined}
              type="button"
              aria-label={`Promote to ${name}`}
              onClick={() => onSelect(piece)}
              style={{
                minHeight: 68,
                border: '1px solid var(--theme-border)',
                borderRadius: 12,
                background: 'var(--theme-button-bg)',
                color: 'var(--theme-text)',
                fontSize: 38,
                fontWeight: 800,
                cursor: 'pointer',
                touchAction: 'manipulation',
              }}
            >
              <span aria-hidden="true">{glyphs[color][piece]}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onCancel}
          style={{
            width: '100%',
            minHeight: 44,
            marginTop: 12,
            border: '1px solid var(--theme-border)',
            borderRadius: 10,
            background: 'transparent',
            color: 'var(--theme-text)',
            font: 'inherit',
            fontWeight: 750,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </div>,
    document.body,
  )
}
