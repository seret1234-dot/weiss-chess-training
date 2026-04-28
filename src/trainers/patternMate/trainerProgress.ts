import { DEFAULT_PROGRESS_PREFIX } from "./constants"
import type { PatternMateProgressState } from "./types"

function buildStorageKey(progressKey?: string) {
  return progressKey
    ? `${DEFAULT_PROGRESS_PREFIX}:${progressKey}`
    : DEFAULT_PROGRESS_PREFIX
}

export function createEmptyProgressState(): PatternMateProgressState {
  return {
    currentChunkIndex: 0,
    currentPuzzleIndex: 0,
    solvedPuzzleIds: [],
    updatedAt: Date.now(),
  }
}

export function loadTrainerProgress(progressKey?: string): PatternMateProgressState {
  const storageKey = buildStorageKey(progressKey)

  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return createEmptyProgressState()

    const parsed = JSON.parse(raw) as Partial<PatternMateProgressState>

    return {
      currentChunkIndex:
        typeof parsed.currentChunkIndex === "number" ? parsed.currentChunkIndex : 0,
      currentPuzzleIndex:
        typeof parsed.currentPuzzleIndex === "number" ? parsed.currentPuzzleIndex : 0,
      solvedPuzzleIds: Array.isArray(parsed.solvedPuzzleIds)
        ? parsed.solvedPuzzleIds.filter((id): id is string => typeof id === "string")
        : [],
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    }
  } catch {
    return createEmptyProgressState()
  }
}

export function saveTrainerProgress(
  state: PatternMateProgressState,
  progressKey?: string,
) {
  const storageKey = buildStorageKey(progressKey)

  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        ...state,
        updatedAt: Date.now(),
      }),
    )
  } catch {
    // ignore storage failures
  }
}

export function clearTrainerProgress(progressKey?: string) {
  const storageKey = buildStorageKey(progressKey)

  try {
    localStorage.removeItem(storageKey)
  } catch {
    // ignore storage failures
  }
}