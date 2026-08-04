import { useCallback, useEffect, useRef } from "react"

export const CORRECT_PUZZLE_AUTO_ADVANCE_MS = 1_000
export const WRONG_MOVE_RESET_MS = 2_000

export type PuzzleProgressionSnapshot = {
  currentPuzzleIndex: number
  totalPuzzleCount: number
  completedPuzzleCount: number
}

export type PuzzleProgressionTimers = {
  setTimeout: (callback: () => void, delayMs: number) => unknown
  clearTimeout: (handle: unknown) => void
}

export function createCorrectPuzzleAutoAdvanceController(timers: PuzzleProgressionTimers = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}) {
  let timer: unknown = null
  let generation = 0

  return {
    cancel() {
      generation += 1
      if (timer !== null) timers.clearTimeout(timer)
      timer = null
    },
    schedule(onAdvance: () => void, delayMs = CORRECT_PUZZLE_AUTO_ADVANCE_MS) {
      this.cancel()
      const scheduledGeneration = generation
      timer = timers.setTimeout(() => {
        if (scheduledGeneration !== generation) return
        timer = null
        generation += 1
        onAdvance()
      }, delayMs)
    },
  }
}

/**
 * Owns the temporary board state shown after a legal but incorrect move.
 * Cancellation invalidates callbacks so an old reset can never overwrite a
 * later puzzle after navigation, restart, or unmount.
 */
export function createWrongMoveResetController(timers: PuzzleProgressionTimers = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}) {
  let timer: unknown = null
  let generation = 0

  return {
    cancel() {
      generation += 1
      if (timer !== null) timers.clearTimeout(timer)
      timer = null
    },
    schedule(onReset: () => void, delayMs = WRONG_MOVE_RESET_MS) {
      this.cancel()
      const scheduledGeneration = generation
      timer = timers.setTimeout(() => {
        if (scheduledGeneration !== generation) return
        timer = null
        generation += 1
        onReset()
      }, delayMs)
    },
  }
}

/**
 * A final success is complete only when the durable in-memory progress count
 * reaches the full chunk size. This deliberately separates a puzzle's array
 * position from its completion state.
 */
export function isFinalPuzzleCompletion({
  totalPuzzleCount,
  completedPuzzleCount,
}: PuzzleProgressionSnapshot) {
  const total = Math.max(0, Math.floor(Number(totalPuzzleCount) || 0))
  const completed = Math.min(total, Math.max(0, Math.floor(Number(completedPuzzleCount) || 0)))
  return total > 0 && completed === total
}

/**
 * Owns exactly one delayed correct-answer transition. Each new schedule or
 * manual navigation invalidates earlier callbacks, preventing timer/button or
 * rerender double advancement. Cleanup also covers route changes and unmount.
 */
export function useCorrectPuzzleAutoAdvance() {
  const controllerRef = useRef<ReturnType<typeof createCorrectPuzzleAutoAdvanceController> | null>(null)
  if (!controllerRef.current) controllerRef.current = createCorrectPuzzleAutoAdvanceController()

  const cancelCorrectAutoAdvance = useCallback(() => {
    controllerRef.current?.cancel()
  }, [])

  const scheduleCorrectAutoAdvance = useCallback((onAdvance: () => void, delayMs = CORRECT_PUZZLE_AUTO_ADVANCE_MS) => {
    controllerRef.current?.schedule(onAdvance, delayMs)
  }, [])

  useEffect(() => cancelCorrectAutoAdvance, [cancelCorrectAutoAdvance])

  return { cancelCorrectAutoAdvance, scheduleCorrectAutoAdvance }
}

/** A separately owned timer for restoring a legal wrong-move board position. */
export function useWrongMoveReset() {
  const controllerRef = useRef<ReturnType<typeof createWrongMoveResetController> | null>(null)
  if (!controllerRef.current) controllerRef.current = createWrongMoveResetController()

  const cancelWrongMoveReset = useCallback(() => {
    controllerRef.current?.cancel()
  }, [])

  const scheduleWrongMoveReset = useCallback((onReset: () => void) => {
    controllerRef.current?.schedule(onReset)
  }, [])

  useEffect(() => cancelWrongMoveReset, [cancelWrongMoveReset])

  return { cancelWrongMoveReset, scheduleWrongMoveReset }
}
