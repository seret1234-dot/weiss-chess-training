import { PuzzlePerfectionTracker } from '../puzzlePerfection'

/** Shared error state only; Endgames retain their own accepted moves and time limits. */
export class EndgameAttempt {
  private tracker = new PuzzlePerfectionTracker()
  private key = ''
  private completed = false
  private voiceTime: { startedAt: number; elapsed: number } | null = null
  begin(key: string) {
    if (key !== this.key || this.completed) {
      this.tracker.resetAttempt(false)
      this.key = key
      this.completed = false
    }
    this.voiceTime = null
  }
  silentError() { this.tracker.markSilentError() }
  wrongMove() { this.tracker.markSubmittedWrongMove() }
  snapshot() { return this.tracker.snapshot() }
  nonQualifyingMessage(timingMessage: string) {
    const state = this.tracker.snapshot()
    // The new error gate must not relabel a fast, error-marked solve as slow.
    return state.hadSilentError || state.hadIntentionalError ? 'Correct' : timingMessage
  }
  qualify(existingTimingResult: boolean) {
    const attempt = this.tracker.snapshot()
    this.completed = true
    return existingTimingResult && !attempt.hadSilentError && !attempt.hadIntentionalError
  }
  mouseMove() { this.voiceTime = null }
  voiceMove(timerStartedAt: number, speechStartedAt: number, now: number, wallNow: number) {
    // Legacy Date.now() timer -> monotonic speech clock, frozen at submission.
    this.voiceTime = { startedAt: timerStartedAt, elapsed: Math.max(0, wallNow - (now - speechStartedAt) - timerStartedAt) }
  }
  elapsed(timerStartedAt: number, wallNow = Date.now()) {
    return this.voiceTime?.startedAt === timerStartedAt ? this.voiceTime.elapsed : wallNow - timerStartedAt
  }
}
