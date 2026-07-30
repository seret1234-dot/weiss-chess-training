import { Chess } from "chess.js"

const HISTORY_LIMIT = 120
const PLAN_STORAGE_PREFIX = "weissChess:mixed-session-plan:"
const HISTORY_STORAGE_PREFIX = "weissChess:mixed-session-history:"

export type MixedSessionCandidate<T> = {
  item: T
  theme: string
  canonicalIdentity: string
  stableId: string
}

export type MixedSessionPlanOptions = {
  sessionId: string
  eligibleThemes?: readonly string[]
  recentlySeenCanonicalIdentities?: readonly string[]
  /** A mixed chunk is a session, not the entire source pool. */
  sessionSize?: number
}

export type MixedSessionPlan<T> = {
  items: T[]
  orderedCandidates: MixedSessionCandidate<T>[]
  themeCounts: Record<string, number>
}

type HistoryEntry = {
  sessionId: string
  canonicalIdentity: string
}

function stableHash(value: string) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function stableCompare(seed: string, left: string, right: string) {
  const leftHash = stableHash(`${seed}|${left}`)
  const rightHash = stableHash(`${seed}|${right}`)
  return leftHash - rightHash || left.localeCompare(right)
}

function normaliseTheme(theme: string | null | undefined) {
  return String(theme ?? "other").trim().toLowerCase() || "other"
}

function displayedFen(fen: string, preMove?: string) {
  try {
    const game = new Chess(fen)
    if (preMove) {
      const move = preMove.trim().toLowerCase()
      game.move({
        from: move.slice(0, 2),
        to: move.slice(2, 4),
        promotion: move.slice(4, 5) || undefined,
      })
    }
    return game.fen().split(/\s+/).slice(0, 4).join(" ")
  } catch {
    return fen.trim().split(/\s+/).slice(0, 4).join(" ")
  }
}

/**
 * Canonical identity is intentionally independent of generated chunk/index
 * metadata. The source identity remains part of the key for provenance.
 */
export function createCanonicalExerciseIdentity(input: {
  fen: string
  preMove?: string
  objective: string
  solutionLine: string[]
  sourceIdentity: string
}) {
  const solution = input.solutionLine.map((move) => move.trim().toLowerCase()).filter(Boolean).join(",")
  return `${displayedFen(input.fen, input.preMove)}|${input.objective}|${solution}|${input.sourceIdentity}`
}

function validStoredOrder<T>(
  storedIds: unknown,
  candidates: MixedSessionCandidate<T>[],
  expectedSize: number,
) {
  if (!Array.isArray(storedIds) || storedIds.length !== expectedSize) return null
  const byId = new Map(candidates.map((candidate) => [candidate.canonicalIdentity, candidate]))
  const selected = storedIds.map((identity) => byId.get(String(identity)))
  return selected.every(Boolean) && new Set(storedIds).size === candidates.length
    ? selected as MixedSessionCandidate<T>[]
    : null
}

function selectionCandidates<T>(
  candidates: MixedSessionCandidate<T>[],
  options: MixedSessionPlanOptions,
) {
  const allowedThemes = options.eligibleThemes
    ? new Set(options.eligibleThemes.map(normaliseTheme))
    : null
  const seenCanonical = new Set<string>()

  return candidates
    .map((candidate) => ({ ...candidate, theme: normaliseTheme(candidate.theme) }))
    .filter((candidate) => !allowedThemes || allowedThemes.has(candidate.theme))
    .sort((left, right) => stableCompare(options.sessionId, left.stableId, right.stableId))
    .filter((candidate) => {
      if (seenCanonical.has(candidate.canonicalIdentity)) return false
      seenCanonical.add(candidate.canonicalIdentity)
      return true
    })
}

/**
 * Creates a balanced deterministic order. It prioritises unseen themes, then
 * themes outside the last-three queue, then the least-used eligible theme.
 * Constraints relax only when source availability makes them impossible.
 */
export function planMixedSession<T>(
  candidates: MixedSessionCandidate<T>[],
  options: MixedSessionPlanOptions,
): MixedSessionPlan<T> {
  const remaining = selectionCandidates(candidates, options)
  const eligibleThemes = [...new Set(remaining.map((candidate) => candidate.theme))]
  const themeCounts: Record<string, number> = Object.fromEntries(eligibleThemes.map((theme) => [theme, 0]))
  const recentThemes: string[] = []
  const recentlySeen = new Set(options.recentlySeenCanonicalIdentities ?? [])
  const orderedCandidates: MixedSessionCandidate<T>[] = []
  const targetSize = Math.min(Math.max(0, options.sessionSize ?? remaining.length), remaining.length)
  const maxPerTheme = Math.ceil(targetSize / Math.max(1, eligibleThemes.length)) + 1

  while (remaining.length > 0 && orderedCandidates.length < targetSize) {
    const availableThemes = [...new Set(remaining.map((candidate) => candidate.theme))]
    const chooseFrom = (themes: string[]) => themes.filter((theme) => remaining.some((candidate) => candidate.theme === theme))
    let themePool = availableThemes

    const unseen = chooseFrom(availableThemes.filter((theme) => themeCounts[theme] === 0))
    if (unseen.length > 0) {
      themePool = unseen
    } else {
      const recentWindow = Math.min(3, Math.max(0, availableThemes.length - 1))
      const notRecent = chooseFrom(availableThemes.filter((theme) => !recentThemes.slice(-recentWindow).includes(theme)))
      if (notRecent.length > 0) themePool = notRecent
    }

    const belowCap = chooseFrom(themePool.filter((theme) => themeCounts[theme] < maxPerTheme))
    if (belowCap.length > 0) themePool = belowCap

    themePool.sort((left, right) =>
      themeCounts[left] - themeCounts[right] || stableCompare(`${options.sessionId}|theme`, left, right),
    )
    const selectedTheme = themePool[0] ?? availableThemes[0]
    const themed = remaining.filter((candidate) => candidate.theme === selectedTheme)
    const notRecentlySeen = themed.filter((candidate) => !recentlySeen.has(candidate.canonicalIdentity))
    const selected = (notRecentlySeen.length > 0 ? notRecentlySeen : themed)
      .sort((left, right) => stableCompare(`${options.sessionId}|${selectedTheme}|${orderedCandidates.length}`, left.stableId, right.stableId))[0]

    orderedCandidates.push(selected)
    themeCounts[selectedTheme] += 1
    recentThemes.push(selectedTheme)
    if (recentThemes.length > 3) recentThemes.shift()
    recentlySeen.add(selected.canonicalIdentity)
    remaining.splice(remaining.indexOf(selected), 1)
  }

  return {
    items: orderedCandidates.map((candidate) => candidate.item),
    orderedCandidates,
    themeCounts,
  }
}

export function getOrCreateMixedSessionPlan<T>(
  candidates: MixedSessionCandidate<T>[],
  options: MixedSessionPlanOptions,
) {
  const prepared = selectionCandidates(candidates, options)
  const expectedSize = Math.min(Math.max(0, options.sessionSize ?? prepared.length), prepared.length)
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(`${PLAN_STORAGE_PREFIX}${options.sessionId}`)
      const stored = raw ? JSON.parse(raw) : null
      const orderedCandidates = validStoredOrder<T>(stored?.canonicalIdentities, prepared, expectedSize)
      if (orderedCandidates) {
        return {
          items: orderedCandidates.map((candidate) => candidate.item),
          orderedCandidates,
          themeCounts: orderedCandidates.reduce<Record<string, number>>((counts, candidate) => {
            counts[candidate.theme] = (counts[candidate.theme] ?? 0) + 1
            return counts
          }, {}),
        } satisfies MixedSessionPlan<T>
      }
    } catch {
      // Local history is an optional optimisation, never a selection failure.
    }
  }

  const plan = planMixedSession(prepared, options)
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(`${PLAN_STORAGE_PREFIX}${options.sessionId}`, JSON.stringify({
        canonicalIdentities: plan.orderedCandidates.map((candidate) => candidate.canonicalIdentity),
      }))
    } catch {
      // Storage may be unavailable in private browser modes.
    }
  }
  return plan
}

export function getRecentMixedCanonicalIdentities(sessionId: string) {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_PREFIX)
    const entries = raw ? JSON.parse(raw) : []
    if (!Array.isArray(entries)) return []
    return entries
      .filter((entry): entry is HistoryEntry => typeof entry?.canonicalIdentity === "string")
      .filter((entry) => entry.sessionId !== sessionId)
      .map((entry) => entry.canonicalIdentity)
      .slice(-HISTORY_LIMIT)
  } catch {
    return []
  }
}

export function recordMixedCanonicalIdentity(sessionId: string, canonicalIdentity: string) {
  if (typeof window === "undefined" || !canonicalIdentity) return
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_PREFIX)
    const entries: HistoryEntry[] = raw && Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : []
    const next = [...entries, { sessionId, canonicalIdentity }].slice(-HISTORY_LIMIT)
    window.localStorage.setItem(HISTORY_STORAGE_PREFIX, JSON.stringify(next))
  } catch {
    // History is optional and must never interrupt a trainer session.
  }
}
