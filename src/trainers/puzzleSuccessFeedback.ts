import type { PuzzlePerfectionSnapshot } from './puzzlePerfection'

// Presentation only: qualification, counters and transition timers remain owned
// by the existing tracker/trainer. Do not relabel hint/error attempts as slow.
export function puzzleSuccessFeedback(attempt: PuzzlePerfectionSnapshot) {
  const timingOnly = attempt.timingEnabledForAttempt
    && (attempt.hadHesitation || attempt.hadSlowMove)
    && !attempt.hadIntentionalError
    && !attempt.hadSilentError
    && !attempt.usedHint
  return timingOnly ? 'Correct, but slow' : 'Correct'
}
