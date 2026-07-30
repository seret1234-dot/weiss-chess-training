import type { CurriculumArea, CurriculumState } from "./curriculum/curriculumTypes"

export const MIXED_SESSION_SIZE = 30
export const MIXED_SCOPE_STORAGE_PREFIX = "weissChess:mixed-session-scope:"

export type MixedSessionScope = "unlocked" | "all"

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
