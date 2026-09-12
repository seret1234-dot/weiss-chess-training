import { PUZZLE_MASTERY_RULES } from '../training/learningPlanRules'

export const PUZZLE_RECOGNITION_LIMIT_MS = PUZZLE_MASTERY_RULES.firstMoveStartUnderMs
export const PUZZLE_MOVE_LIMIT_MS = PUZZLE_MASTERY_RULES.eachLearnerMoveUnderMs

export type PuzzleIntentMode = 'click' | 'drag' | 'touch' | 'fallback'

export type PuzzlePerfectionSnapshot = {
  active: boolean
  timingEnabledForAttempt: boolean
  hadIntentionalError: boolean
  hadSilentError: boolean
  usedHint: boolean
  hadHesitation: boolean
  hadSlowMove: boolean
  learnerTurnsActivated: number
  learnerTurnsCompleted: number
  positionActiveAt: number | null
  correctIntentStartedAt: number | null
  learnerMoveDurationsMs: number[]
  acceptedMoves: string[]
}

type ActiveIntent = {
  source: string
  mode: PuzzleIntentMode
  resolved: boolean
  awaitingPromotion: boolean
}

function normalizeSquare(square: string) {
  return square.trim().toLowerCase()
}

function normalizeMove(move: string) {
  return move.trim().toLowerCase()
}

export function nextPerfectSolveCount(
  currentCount: number,
  requiredCount: number,
  qualifiesAsPerfect: boolean,
) {
  const current = Math.max(0, Math.floor(Number(currentCount) || 0))
  const required = Math.max(0, Math.floor(Number(requiredCount) || 0))
  return qualifiesAsPerfect ? Math.min(current + 1, required) : Math.min(current, required)
}

/**
 * Attempt-level qualification state shared by the regular and Master puzzle
 * trainers. It deliberately owns no React state and no persistence: the
 * existing trainer lifecycle decides when a new attempt begins and when a
 * learner position becomes interactive.
 */
export class PuzzlePerfectionTracker {
  private active = false
  private timingEnabledForAttempt = true
  private hadIntentionalError = false
  private hadSilentError = false
  private usedHint = false
  private hadHesitation = false
  private hadSlowMove = false
  private learnerTurnsActivated = 0
  private learnerTurnsCompleted = 0
  private positionActiveAt: number | null = null
  private correctIntentStartedAt: number | null = null
  private learnerMoveDurationsMs: number[] = []
  private acceptedMoves = new Set<string>()
  private activeIntent: ActiveIntent | null = null
  private currentTurnCompleted = false

  resetAttempt(timingEnabled = true) {
    this.active = false
    this.timingEnabledForAttempt = timingEnabled
    this.hadIntentionalError = false
    this.hadSilentError = false
    this.usedHint = false
    this.hadHesitation = false
    this.hadSlowMove = false
    this.learnerTurnsActivated = 0
    this.learnerTurnsCompleted = 0
    this.positionActiveAt = null
    this.correctIntentStartedAt = null
    this.learnerMoveDurationsMs = []
    this.acceptedMoves.clear()
    this.activeIntent = null
    this.currentTurnCompleted = false
  }

  activateLearnerPosition(now: number, acceptedMoves: readonly string[]) {
    this.active = true
    this.positionActiveAt = now
    this.correctIntentStartedAt = null
    this.acceptedMoves = new Set(acceptedMoves.map(normalizeMove).filter(Boolean))
    this.activeIntent = null
    this.currentTurnCompleted = false
    this.learnerTurnsActivated += 1
  }

  suspendLearnerPosition() {
    this.active = false
    this.positionActiveAt = null
    this.activeIntent = null
  }

  beginSource(sourceSquare: string, now: number, mode: PuzzleIntentMode) {
    if (!this.active || this.positionActiveAt === null || this.currentTurnCompleted) {
      return { recorded: false, sourceAccepted: false, duplicate: false }
    }

    const source = normalizeSquare(sourceSquare)
    if (
      this.activeIntent &&
      !this.activeIntent.resolved &&
      this.activeIntent.source === source
    ) {
      return {
        recorded: false,
        sourceAccepted: this.isAcceptedSource(source),
        duplicate: true,
      }
    }

    const sourceAccepted = this.isAcceptedSource(source)
    if (!sourceAccepted) {
      this.hadIntentionalError = true
    } else if (this.correctIntentStartedAt === null) {
      this.correctIntentStartedAt = now
      if (now - this.positionActiveAt >= PUZZLE_RECOGNITION_LIMIT_MS) {
        this.hadHesitation = true
      }
    }

    this.activeIntent = {
      source,
      mode,
      resolved: false,
      awaitingPromotion: false,
    }

    return { recorded: true, sourceAccepted, duplicate: false }
  }

  markPromotionPending(sourceSquare: string, targetSquare: string, now: number) {
    if (!this.active) return false
    const source = normalizeSquare(sourceSquare)
    const target = normalizeSquare(targetSquare)
    this.ensureSourceIntent(source, now)

    const matchingPromotion = [...this.acceptedMoves].some(
      (move) => move.length > 4 && move.slice(0, 2) === source && move.slice(2, 4) === target,
    )

    if (!matchingPromotion) {
      this.hadIntentionalError = true
      if (this.activeIntent) this.activeIntent.resolved = true
      return false
    }

    if (this.activeIntent) this.activeIntent.awaitingPromotion = true
    return true
  }

  recordDestination(
    sourceSquare: string,
    targetSquare: string,
    now: number,
    promotion?: string,
  ) {
    if (!this.active || this.currentTurnCompleted) return false

    const source = normalizeSquare(sourceSquare)
    const target = normalizeSquare(targetSquare)
    // Putting a piece back / cancelling a drag is not a chess move attempt.
    if (source === target || !/^[a-h][1-8]$/.test(target)) {
      this.cancelIntent(source)
      return false
    }
    this.ensureSourceIntent(source, now)
    const played = `${source}${target}${promotion?.toLowerCase() ?? ''}`
    const accepted = this.acceptedMoves.has(played)

    if (!accepted) this.hadIntentionalError = true
    if (this.activeIntent) {
      this.activeIntent.resolved = true
      this.activeIntent.awaitingPromotion = false
    }
    if (accepted) this.completeCurrentTurn(now)
    return accepted
  }

  recordCommittedMove(playedUci: string, now: number) {
    if (!this.active || this.currentTurnCompleted) return false

    const played = normalizeMove(playedUci)
    this.ensureSourceIntent(played.slice(0, 2), now)
    const accepted = this.acceptedMoves.has(played)

    if (!accepted) this.hadIntentionalError = true
    if (this.activeIntent) {
      this.activeIntent.resolved = true
      this.activeIntent.awaitingPromotion = false
    }
    if (accepted) this.completeCurrentTurn(now)
    return accepted
  }

  cancelIntent(sourceSquare?: string) {
    if (!this.active || !this.activeIntent || this.activeIntent.resolved) return false
    if (sourceSquare && this.activeIntent.source !== normalizeSquare(sourceSquare)) return false

    // Cancellation cannot erase a previous wrong choice, but creates no error.
    this.activeIntent.resolved = true
    this.activeIntent.awaitingPromotion = false
    return true
  }

  finishUnresolvedDrag(sourceSquare: string) {
    if (
      !this.activeIntent ||
      this.activeIntent.mode !== 'drag' && this.activeIntent.mode !== 'touch' ||
      this.activeIntent.awaitingPromotion
    ) {
      return false
    }
    return this.cancelIntent(sourceSquare)
  }

  markHintUsed() {
    this.usedHint = true
  }

  markSilentError() {
    this.hadSilentError = true
  }

  markSubmittedWrongMove() {
    this.hadIntentionalError = true
    if (this.activeIntent) this.activeIntent.resolved = true
  }

  isPerfectSolve() {
    return (
      this.learnerTurnsCompleted > 0 &&
      this.learnerTurnsCompleted === this.learnerTurnsActivated &&
      !this.hadIntentionalError &&
      !this.hadSilentError &&
      !this.usedHint &&
      (!this.timingEnabledForAttempt || (!this.hadHesitation && !this.hadSlowMove))
    )
  }

  snapshot(): PuzzlePerfectionSnapshot {
    return {
      active: this.active,
      timingEnabledForAttempt: this.timingEnabledForAttempt,
      hadIntentionalError: this.hadIntentionalError,
      hadSilentError: this.hadSilentError,
      usedHint: this.usedHint,
      hadHesitation: this.hadHesitation,
      hadSlowMove: this.hadSlowMove,
      learnerTurnsActivated: this.learnerTurnsActivated,
      learnerTurnsCompleted: this.learnerTurnsCompleted,
      positionActiveAt: this.positionActiveAt,
      correctIntentStartedAt: this.correctIntentStartedAt,
      learnerMoveDurationsMs: [...this.learnerMoveDurationsMs],
      acceptedMoves: [...this.acceptedMoves],
    }
  }

  private isAcceptedSource(source: string) {
    return [...this.acceptedMoves].some((move) => move.slice(0, 2) === source)
  }

  private ensureSourceIntent(source: string, now: number) {
    if (this.activeIntent?.source === source && !this.activeIntent.resolved) return
    this.beginSource(source, now, 'fallback')
  }

  private completeCurrentTurn(now: number) {
    if (this.currentTurnCompleted) return
    if (this.positionActiveAt !== null) {
      const duration = Math.max(0, now - this.positionActiveAt)
      this.learnerMoveDurationsMs.push(duration)
      if (duration >= PUZZLE_MOVE_LIMIT_MS) this.hadSlowMove = true
    }
    this.currentTurnCompleted = true
    this.learnerTurnsCompleted += 1
  }
}
