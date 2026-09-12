import type { CSSProperties, ReactNode } from 'react'

/** The regular Mate panel composition, shared by regular and Master puzzles. */
export default function PuzzleTrainerPanel({ boardSize, explanation, provenance, children }: {
  boardSize: number
  explanation?: ReactNode
  provenance?: ReactNode
  children: ReactNode
}) {
  const hasReference = Boolean(explanation || provenance)
  return (
    <div
      className={`trainer-puzzle-panel${hasReference ? '' : ' trainer-puzzle-panel--single'}`}
      style={{ '--trainer-panel-board-size': `${boardSize}px` } as CSSProperties}
    >
      <div className="trainer-puzzle-panel-controls">{children}</div>
      {hasReference && (
        <div className="trainer-puzzle-panel-reference">
          {explanation}
          {provenance}
        </div>
      )}
    </div>
  )
}
