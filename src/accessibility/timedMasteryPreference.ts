export const TIMED_MASTERY_STORAGE_KEY = "weiss-chess-timed-mastery-enabled-v1"
export const DEFAULT_TIMED_MASTERY_ENABLED = true

export function resolveTimedMasteryEnabled(savedValue: string | null) {
  if (savedValue === "false") return false
  if (savedValue === "true") return true
  return DEFAULT_TIMED_MASTERY_ENABLED
}

export function readInitialTimedMasteryEnabled() {
  if (typeof window === "undefined") return DEFAULT_TIMED_MASTERY_ENABLED

  try {
    return resolveTimedMasteryEnabled(window.localStorage.getItem(TIMED_MASTERY_STORAGE_KEY))
  } catch {
    return DEFAULT_TIMED_MASTERY_ENABLED
  }
}
