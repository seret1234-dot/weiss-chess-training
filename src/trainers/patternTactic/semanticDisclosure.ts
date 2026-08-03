export type SemanticDisclosureEvent = 'reveal' | 'timer' | 'next-puzzle' | 'restart'
export type SemanticDisclosureOutcome = 'correct' | 'assisted'

export const SEMANTIC_DISCLOSURE_AUTO_ADVANCE_MS: Record<SemanticDisclosureOutcome, number> = {
  correct: 5_000,
  assisted: 7_000,
}

export type SemanticDisclosureCountdown = {
  remainingMs: number
  startedAtMs: number | null
}

// Semantic evidence is an explanation of the current position, not transient
// move feedback. Timers may clear move feedback, but never this disclosure.
export function nextSemanticDisclosureState(current: boolean, event: SemanticDisclosureEvent) {
  return event === 'next-puzzle' || event === 'restart' ? false : event === 'reveal' ? true : current
}

export function getSemanticDisclosurePresentation(
  explanation: string | null,
  squares: string[],
  revealed: boolean,
) {
  const visible = Boolean(explanation) && revealed
  return { explanation, visible, squares: visible ? squares : [] }
}

export function createSemanticDisclosureCountdown(
  outcome: SemanticDisclosureOutcome,
  nowMs: number,
): SemanticDisclosureCountdown {
  return {
    remainingMs: SEMANTIC_DISCLOSURE_AUTO_ADVANCE_MS[outcome],
    startedAtMs: nowMs,
  }
}

export function pauseSemanticDisclosureCountdown(
  countdown: SemanticDisclosureCountdown,
  nowMs: number,
): SemanticDisclosureCountdown {
  if (countdown.startedAtMs === null) return countdown
  return {
    remainingMs: Math.max(0, countdown.remainingMs - (nowMs - countdown.startedAtMs)),
    startedAtMs: null,
  }
}

export function resumeSemanticDisclosureCountdown(
  countdown: SemanticDisclosureCountdown,
  nowMs: number,
): SemanticDisclosureCountdown {
  if (countdown.remainingMs <= 0 || countdown.startedAtMs !== null) return countdown
  return { ...countdown, startedAtMs: nowMs }
}

export function getSemanticDisclosureCountdownRemainingMs(
  countdown: SemanticDisclosureCountdown,
  nowMs: number,
) {
  return countdown.startedAtMs === null
    ? countdown.remainingMs
    : Math.max(0, countdown.remainingMs - (nowMs - countdown.startedAtMs))
}

export function getSemanticDisclosureCountdownSeconds(
  countdown: SemanticDisclosureCountdown,
  nowMs: number,
) {
  return Math.max(1, Math.ceil(getSemanticDisclosureCountdownRemainingMs(countdown, nowMs) / 1_000))
}
