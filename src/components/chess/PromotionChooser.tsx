import { createPortal } from 'react-dom'

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
  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose promotion piece"
      data-testid="promotion-chooser"
      onClick={onCancel}
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
        <div style={{ marginBottom: 12, fontWeight: 850, fontSize: 18 }}>Promote pawn to</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
          {labels.map(({ piece, name }) => (
            <button
              key={piece}
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
              {glyphs[color][piece]}
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
