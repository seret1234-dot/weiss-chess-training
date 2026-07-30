import type { CurriculumArea, CurriculumState } from "./curriculum/curriculumTypes"

export const MIXED_SESSION_SIZE = 30
export const MIXED_SCOPE_STORAGE_PREFIX = "weissChess:mixed-session-scope:"
export const MIXED_PHASE_STORAGE_PREFIX = "weissChess:mixed-session-phase:"
export const MIXED_IDENTIFIED_EVIDENCE_PREFIX = "weissChess:mixed-identified-evidence:"
export const BLIND_MIXED_MIN_ACCURACY = 0.8
export const BLIND_MIXED_MIN_SESSIONS = 3
export const BLIND_MIXED_MIN_THEMES = 4

export type MixedSessionScope = "unlocked" | "all"
export type MixedSessionPhase = "identified" | "blind"

type IdentifiedMixedSessionEvidence = {
  sessionId: string
  completedAt: string
  accuracy: number
  themeCount: number
}

const MATE_THEME_ALIASES: Record<string, string> = {
  anastasia: "anastasia",
  anastasiamate: "anastasia",
  "back-rank": "back-rank",
  backrank: "back-rank",
  backrankmate: "back-rank",
  arabian: "arabian",
  arabianmate: "arabian",
  boden: "boden",
  bodenmate: "boden",
  smothered: "smothered",
  smotheredmate: "smothered",
  hook: "hook",
  hookmate: "hook",
  "kill-box": "kill-box",
  killbox: "kill-box",
  killboxmate: "kill-box",
  dovetail: "dovetail",
  dovetailmate: "dovetail",
  "double-bishop": "double-bishop",
  doublebishop: "double-bishop",
  doublebishopmate: "double-bishop",
}

function compact(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
}

/**
 * Normalises generator labels (for example, `Back Rank` and `backRankMate`)
 * to the stable curriculum keys used by progress and route provenance.
 */
export function normaliseMixedThemeKey(raw: string | null | undefined, area?: CurriculumArea) {
  const key = compact(String(raw ?? ""))
  if (area === "mates") return MATE_THEME_ALIASES[key] ?? (key.replace(/-mate$/, "") || "other")
  return key || "other"
}

export function readRememberedMixedScope(trainerKey: string): MixedSessionScope {
  if (typeof window === "undefined") return "unlocked"
  try {
    return window.localStorage.getItem(`${MIXED_SCOPE_STORAGE_PREFIX}${trainerKey}`) === "all"
      ? "all"
      : "unlocked"
  } catch {
    return "unlocked"
  }
}

export function rememberMixedScope(trainerKey: string, scope: MixedSessionScope) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(`${MIXED_SCOPE_STORAGE_PREFIX}${trainerKey}`, scope)
  } catch {
    // Persisting a preference is optional and must not prevent practice.
  }
}

export function readRememberedMixedPhase(trainerKey: string): MixedSessionPhase {
  if (typeof window === "undefined") return "identified"
  try {
    return window.localStorage.getItem(`${MIXED_PHASE_STORAGE_PREFIX}${trainerKey}`) === "blind"
      ? "blind"
      : "identified"
  } catch {
    return "identified"
  }
}

export function rememberMixedPhase(trainerKey: string, phase: MixedSessionPhase) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(`${MIXED_PHASE_STORAGE_PREFIX}${trainerKey}`, phase)
  } catch {
    // This preference is optional and never blocks a session.
  }
}

function readIdentifiedEvidence(trainerKey: string): IdentifiedMixedSessionEvidence[] {
  if (typeof window === "undefined") return []
  try {
    const parsed = JSON.parse(window.localStorage.getItem(`${MIXED_IDENTIFIED_EVIDENCE_PREFIX}${trainerKey}`) ?? "[]")
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is IdentifiedMixedSessionEvidence =>
        typeof entry?.sessionId === "string"
        && typeof entry?.accuracy === "number"
        && typeof entry?.themeCount === "number",
      )
      : []
  } catch {
    return []
  }
}

export function getBlindMixedUnlockStatus(trainerKey: string) {
  const qualifyingSessions = readIdentifiedEvidence(trainerKey)
    .filter((entry) => entry.accuracy >= BLIND_MIXED_MIN_ACCURACY && entry.themeCount >= BLIND_MIXED_MIN_THEMES)
  return {
    unlocked: qualifyingSessions.length >= BLIND_MIXED_MIN_SESSIONS,
    qualifyingSessions: qualifyingSessions.length,
    remainingSessions: Math.max(0, BLIND_MIXED_MIN_SESSIONS - qualifyingSessions.length),
  }
}

/**
 * Temporary Phase 3.1 device-local evidence. Only curriculum-scoped,
 * identified sessions are eligible; all-theme practice never reaches here.
 */
export function recordIdentifiedMixedSessionEvidence(input: {
  trainerKey: string
  sessionId: string
  scope: MixedSessionScope
  phase: MixedSessionPhase
  correct: number
  attempts: number
  representedThemes: readonly string[]
}) {
  if (typeof window === "undefined" || input.scope !== "unlocked" || input.phase !== "identified") return
  const accuracy = input.attempts > 0 ? input.correct / input.attempts : 0
  const nextEntry: IdentifiedMixedSessionEvidence = {
    sessionId: input.sessionId,
    completedAt: new Date().toISOString(),
    accuracy,
    themeCount: new Set(input.representedThemes).size,
  }
  try {
    const previous = readIdentifiedEvidence(input.trainerKey).filter((entry) => entry.sessionId !== input.sessionId)
    window.localStorage.setItem(
      `${MIXED_IDENTIFIED_EVIDENCE_PREFIX}${input.trainerKey}`,
      JSON.stringify([...previous, nextEntry].slice(-12)),
    )
  } catch {
    // Device-local evidence is an enhancement; normal training still works.
  }
}

export function shouldRevealMixedTheme(phase: MixedSessionPhase, answeredOrHinted: boolean) {
  return phase === "identified" || answeredOrHinted
}

export function themesForMixedScope(input: {
  area: CurriculumArea
  availableThemes: readonly string[]
  scope: MixedSessionScope
  curriculum: CurriculumState | null | undefined
}) {
  const available = [...new Set(input.availableThemes.map((theme) => normaliseMixedThemeKey(theme, input.area)).filter(Boolean))]
  if (input.scope === "all") return available

  const themeProgress = input.curriculum?.themeMastery?.[input.area] ?? {}
  return available.filter((theme) => themeProgress[theme]?.mastered === true)
}

export function formatMixedThemeName(theme: string) {
  return theme.split("-").map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : part).join(" ")
}
