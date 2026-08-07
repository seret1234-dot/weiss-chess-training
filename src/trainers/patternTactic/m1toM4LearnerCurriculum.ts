export const PATTERN_TACTIC_LEARNER_CHUNK_SIZE = 20

export type PatternTacticLearnerCurriculum = {
  trainerKey: string
  theme: string
  canonicalThemeKey: string
  canonicalThemeLabel: string
  tacticDistance: 1 | 2 | 3 | 4
  version: string
  sourceDataBasePath: string
  learnerDataBasePath: string
  legacyChunkCount: number
  activeChunkCount: number
  activeChunkSize: number
  unavailableReason?: string
}

export type LegacyChunkProgressLike = {
  trainer_key?: string | null
  chunk_index?: number | null
  is_mastered?: boolean | null
  mastered_puzzles_count?: number | null
}

const ALL_STANDARD_THEMES = [
  "advanced-pawn", "attacking-f2-f7", "bishop-fork", "bishop-pin", "bishop-sacrifice", "bishop-skewer", "bishop-xray", "clearance", "clearance-sacrifice", "decoy-attraction", "decoy-deflection", "defense", "deflection", "diagonal-clearance", "discovered-attack", "discovered-check", "double-check", "en-passant", "file-clearance", "hanging-piece", "interference", "interference-sacrifice", "king-fork", "king-sacrifice", "kingside-attack", "knight-fork", "knight-sacrifice", "knight-underpromotion", "other-pin", "other-skewer", "other-xray", "pawn-fork", "pawn-sacrifice", "promotion", "queen-fork", "queen-pin", "queen-sacrifice", "queen-skewer", "queen-xray", "queenside-attack", "quiet-move", "rank-clearance", "remove-the-defender", "rook-fork", "rook-pin", "rook-sacrifice", "rook-skewer", "rook-xray", "trapped-piece", "underpromotion", "vulnerable-king", "zugzwang", "zwischencheck", "zwischenzug",
] as const

const THEMES_BY_DISTANCE: Record<1 | 2 | 3 | 4, readonly string[]> = {
  1: ALL_STANDARD_THEMES,
  2: ALL_STANDARD_THEMES.filter((theme) => theme !== "king-fork" && theme !== "vulnerable-king"),
  3: ALL_STANDARD_THEMES,
  4: ALL_STANDARD_THEMES,
}

const LEGACY_CHUNK_COUNTS: Record<string, number> = {
  "bishop-xray-m2": 7,
  "bishop-xray-m4": 6,
  "interference-sacrifice-m1": 6,
  "interference-sacrifice-m2": 2,
  "king-fork-m1": 8,
  "knight-underpromotion-m1": 9,
  "knight-underpromotion-m2": 9,
  "underpromotion-m2": 9,
}

// The only source-size exception discovered in the active catalog: 56 source
// records cannot form the normal eight 20-exercise M2 chunks.
const ACTIVE_CHUNK_COUNT_OVERRIDES: Record<string, number> = {
  "interference-sacrifice-m2": 2,
}

// Semantic-v2 uses only strict VALID source records for machine-verifiable
// Tier A themes. Original source pools and v1 overlays remain immutable.
const TIER_A_SEMANTIC_CHUNKS: Record<string, number> = {
  "bishop-fork-m1": 5, "bishop-fork-m2": 8, "bishop-fork-m3": 5, "bishop-fork-m4": 3,
  "knight-fork-m1": 5, "knight-fork-m2": 8, "knight-fork-m3": 8, "knight-fork-m4": 6,
  "rook-fork-m1": 5, "rook-fork-m2": 8, "rook-fork-m3": 2, "rook-fork-m4": 3,
  "queen-fork-m1": 5, "queen-fork-m2": 8, "queen-fork-m3": 8, "queen-fork-m4": 7,
  "pawn-fork-m1": 5, "pawn-fork-m2": 8, "pawn-fork-m3": 6, "pawn-fork-m4": 4,
  "king-fork-m1": 4, "king-fork-m3": 0, "king-fork-m4": 0,
  "bishop-pin-m1": 5, "bishop-pin-m2": 8, "bishop-pin-m3": 7, "bishop-pin-m4": 4,
  "queen-pin-m1": 5, "queen-pin-m2": 6, "queen-pin-m3": 5, "queen-pin-m4": 4,
  "rook-pin-m1": 5, "rook-pin-m2": 8, "rook-pin-m3": 4, "rook-pin-m4": 4,
  "bishop-skewer-m1": 5, "bishop-skewer-m2": 8, "bishop-skewer-m3": 6, "bishop-skewer-m4": 3,
  "queen-skewer-m1": 5, "queen-skewer-m2": 8, "queen-skewer-m3": 6, "queen-skewer-m4": 4,
  "rook-skewer-m1": 5, "rook-skewer-m2": 8, "rook-skewer-m3": 5, "rook-skewer-m4": 5,
  "discovered-attack-m1": 5, "discovered-attack-m2": 8, "discovered-attack-m3": 6, "discovered-attack-m4": 4,
  "discovered-check-m1": 5, "discovered-check-m2": 8, "discovered-check-m3": 4, "discovered-check-m4": 3,
  "double-check-m1": 5, "double-check-m2": 8, "double-check-m3": 5, "double-check-m4": 4,
  "promotion-m1": 2, "promotion-m2": 8, "promotion-m3": 8, "promotion-m4": 8,
  "underpromotion-m1": 4, "underpromotion-m2": 8, "underpromotion-m3": 8, "underpromotion-m4": 8,
  "knight-underpromotion-m1": 5, "knight-underpromotion-m2": 8, "knight-underpromotion-m3": 8, "knight-underpromotion-m4": 8,
  "en-passant-m1": 5, "en-passant-m2": 8, "en-passant-m3": 8, "en-passant-m4": 8,
}

const FORK_SOUND_V3_THEMES = new Set(["pawn-fork", "bishop-fork", "knight-fork", "rook-fork", "queen-fork", "king-fork"])
const FORK_SOUND_V3_CHUNKS: Record<string, number> = { "pawn-fork-m1": 2, "pawn-fork-m2": 5, "pawn-fork-m3": 1, "pawn-fork-m4": 1, "bishop-fork-m1": 3, "bishop-fork-m2": 8, "bishop-fork-m3": 1, "bishop-fork-m4": 1, "knight-fork-m1": 5, "knight-fork-m2": 8, "knight-fork-m3": 5, "knight-fork-m4": 4, "rook-fork-m1": 2, "rook-fork-m2": 8, "rook-fork-m3": 1, "rook-fork-m4": 1, "queen-fork-m1": 4, "queen-fork-m2": 8, "queen-fork-m3": 3, "queen-fork-m4": 3, "king-fork-m1": 2, "king-fork-m3": 0, "king-fork-m4": 0 }
const FORK_SOUND_V3_RECORD_COUNTS: Record<string, number> = {
  "pawn-fork-m1": 32, "pawn-fork-m2": 89, "pawn-fork-m3": 15, "pawn-fork-m4": 8,
  "bishop-fork-m1": 42, "bishop-fork-m2": 160, "bishop-fork-m3": 20, "bishop-fork-m4": 13,
  "knight-fork-m1": 100, "knight-fork-m2": 160, "knight-fork-m3": 93, "knight-fork-m4": 67,
  "rook-fork-m1": 37, "rook-fork-m2": 160, "rook-fork-m3": 12, "rook-fork-m4": 11,
  "queen-fork-m1": 77, "queen-fork-m2": 160, "queen-fork-m3": 54, "queen-fork-m4": 46,
  "king-fork-m1": 34, "king-fork-m3": 0, "king-fork-m4": 0,
}

// Batch 1 is deliberately fail-closed. The dedicated fixed-depth semantic
// audit restored only courses with at least one normal learner chunk; all
// other Batch 1 source collections remain unavailable instead of falling
// back to unreviewed v1 material.
const BATCH1_SEMANTIC_V5_THEMES = new Set([
  "bishop-xray", "queen-xray", "rook-xray", "other-xray",
  "hanging-piece", "trapped-piece", "remove-the-defender", "attacking-f2-f7",
])
const BATCH1_SEMANTIC_V5_CHUNKS: Record<string, number> = {
  "hanging-piece-m4": 2,
}
const BATCH1_SEMANTIC_V5_RECORD_COUNTS: Record<string, number> = {
  "hanging-piece-m4": 23,
}

export const TIER_A_SEMANTIC_THEME_KEYS = new Set(Object.keys(TIER_A_SEMANTIC_CHUNKS).map((key) => key.replace(/-m[1-4]$/, "")))

export type PatternTacticSemanticStatus = {
  version: "semantic-v2" | "semantic-v3" | "semantic-v4" | "semantic-v5" | "verified-final-v1"
  active: boolean
  validator: string
}

// The verified final corpus is the sole runtime source for focused tactics.
// Anything absent from this immutable approved matrix is deliberately
// unavailable; no older learner overlay may be used as a fallback.
const VERIFIED_FINAL_COUNTS: Record<string, number> = {
  "bishop-fork-m1": 100, "bishop-fork-m2": 37,
  "bishop-pin-m1": 100, "bishop-pin-m2": 160,
  "bishop-skewer-m1": 100,
  "diagonal-clearance-m1": 100,
  "file-clearance-m1": 96, "file-clearance-m2": 84,
  "rank-clearance-m1": 61, "rank-clearance-m2": 23,
  "deflection-m1": 100,
  "discovered-attack-m1": 100,
  "discovered-check-m1": 100, "discovered-check-m2": 160,
  "double-check-m1": 100,
  "en-passant-m1": 100, "en-passant-m2": 160,
  "hanging-piece-m1": 100,
  "knight-fork-m1": 100, "knight-fork-m2": 83,
  "knight-underpromotion-m1": 100, "knight-underpromotion-m2": 160,
  "pawn-fork-m1": 100,
  "promotion-m1": 100, "promotion-m2": 160,
  "queen-fork-m1": 100, "queen-fork-m2": 103,
  "queen-pin-m1": 100, "queen-pin-m2": 160,
  "queen-skewer-m1": 100,
  "remove-the-defender-m1": 100,
  "rook-fork-m1": 100,
  "rook-pin-m1": 100, "rook-pin-m2": 160,
  "rook-skewer-m1": 100,
  "zwischencheck-m1": 100,
  "zwischenzug-m1": 100,
}

export function getPatternTacticSemanticStatus(theme: string, tacticDistance: 1 | 2 | 3 | 4): PatternTacticSemanticStatus {
  const sourceKey = `${theme}-m${tacticDistance}`
  const verifiedCount = VERIFIED_FINAL_COUNTS[sourceKey] ?? 0
  return {
    version: "verified-final-v1",
    active: verifiedCount >= PATTERN_TACTIC_LEARNER_CHUNK_SIZE,
    validator: verifiedCount >= PATTERN_TACTIC_LEARNER_CHUNK_SIZE
      ? "verified-final-candidate-corpus"
      : "verified-final-candidate-corpus-unavailable",
  }
}

export function formatPatternTacticThemeLabel(theme: string) {
  const special: Record<string, string> = {
    "attacking-f2-f7": "Attacking f2/f7",
    "en-passant": "En passant",
    "other-pin": "Other Pin",
    "other-skewer": "Other Skewer",
    "other-xray": "Other X-Ray",
    "queen-xray": "Queen X-Ray",
    "rook-xray": "Rook X-Ray",
    "bishop-xray": "Bishop X-Ray",
  }
  return special[theme] ?? theme.split("-").map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join(" ")
}

function definition(theme: string, tacticDistance: 1 | 2 | 3 | 4): PatternTacticLearnerCurriculum {
  const sourceKey = `${theme}-m${tacticDistance}`
  const semantic = getPatternTacticSemanticStatus(theme, tacticDistance)
  const activeChunkCount = semantic.active
    ? semantic.version === "verified-final-v1"
      ? Math.ceil((VERIFIED_FINAL_COUNTS[sourceKey] ?? 0) / PATTERN_TACTIC_LEARNER_CHUNK_SIZE)
      : semantic.version === "semantic-v3"
      ? FORK_SOUND_V3_CHUNKS[sourceKey] ?? 0
      : semantic.version === "semantic-v5"
        ? BATCH1_SEMANTIC_V5_CHUNKS[sourceKey] ?? 0
      : TIER_A_SEMANTIC_CHUNKS[sourceKey] ?? 0
    : 0
  const version = `m${tacticDistance}-${semantic.version}`
  return {
    trainerKey: `tactic-${sourceKey}`,
    theme,
    canonicalThemeKey: theme,
    canonicalThemeLabel: formatPatternTacticThemeLabel(theme),
    tacticDistance,
    version,
    sourceDataBasePath: `/data/pattern-tactics/${theme}/m${tacticDistance}`,
    learnerDataBasePath: semantic.version === "verified-final-v1"
      ? `/data/verified-lichess-tactics-v1/final-v5/${theme}-m${tacticDistance}`
      : `/data/learner-curricula/pattern-tactics/${theme}-m${tacticDistance}-${semantic.version}`,
    legacyChunkCount: LEGACY_CHUNK_COUNTS[sourceKey] ?? 10,
    activeChunkCount,
    activeChunkSize: PATTERN_TACTIC_LEARNER_CHUNK_SIZE,
    unavailableReason: activeChunkCount === 0 ? "Not enough reviewed material is available for this course yet." : undefined,
  }
}

export const PATTERN_TACTIC_M1_TO_M4_LEARNER_CURRICULA = ([1, 2, 3, 4] as const)
  .flatMap((tacticDistance) => THEMES_BY_DISTANCE[tacticDistance].map((theme) => definition(theme, tacticDistance)))

export function getPatternTacticLearnerCurriculum(trainerKey: string) {
  return PATTERN_TACTIC_M1_TO_M4_LEARNER_CURRICULA.find((entry) => entry.trainerKey === trainerKey) ?? null
}

export function getPatternTacticLearnerCurriculaForDistance(tacticDistance: number) {
  return PATTERN_TACTIC_M1_TO_M4_LEARNER_CURRICULA.filter((entry) => entry.tacticDistance === tacticDistance)
}

export function getPatternTacticLearnerProgressTrainerKey(definitionOrTrainerKey: PatternTacticLearnerCurriculum | string) {
  const definition = typeof definitionOrTrainerKey === "string"
    ? getPatternTacticLearnerCurriculum(definitionOrTrainerKey)
    : definitionOrTrainerKey
  return definition ? `${definition.trainerKey}:${definition.version}` : String(definitionOrTrainerKey)
}

// semantic-v2 supersedes (but never overwrites) the original learner overlay.
// Retain a stable key for deterministic, proportional completion credit.
export function getPatternTacticPriorLearnerProgressTrainerKey(definition: PatternTacticLearnerCurriculum) {
  const priorVersion = definition.version.includes("verified-final")
    ? "semantic-v5"
    : definition.version.includes("semantic-v5")
    ? "semantic-v4"
    : definition.version.includes("semantic-v3")
      ? "semantic-v2"
      : "v1"
  return `${definition.trainerKey}:m${definition.tacticDistance}-${priorVersion}`
}

function priorLearnerActiveChunkCount(definition: PatternTacticLearnerCurriculum) {
  const sourceKey = `${definition.theme}-m${definition.tacticDistance}`
  if (definition.version.includes("verified-final")) return ACTIVE_CHUNK_COUNT_OVERRIDES[sourceKey] ?? (definition.tacticDistance === 1 ? 5 : 8)
  if (definition.version.includes("semantic-v5")) return 0
  if (definition.version.includes("semantic-v3")) return TIER_A_SEMANTIC_CHUNKS[sourceKey] ?? 0
  return ACTIVE_CHUNK_COUNT_OVERRIDES[sourceKey] ?? (definition.tacticDistance === 1 ? 5 : 8)
}

export function mapLegacyPatternTacticChunkIndexToLearnerChunk(
  legacyChunkIndex: number,
  definition: Pick<PatternTacticLearnerCurriculum, "legacyChunkCount" | "activeChunkCount">,
) {
  const legacyIndex = Math.max(0, Math.min(definition.legacyChunkCount - 1, Math.floor(legacyChunkIndex)))
  return Math.min(definition.activeChunkCount - 1, Math.floor((legacyIndex * definition.activeChunkCount) / definition.legacyChunkCount))
}

export function resolvePatternTacticLearnerFacingChunkIndex(
  requestedChunkIndex: number,
  definition: PatternTacticLearnerCurriculum | null,
  isLearnerFacingRequest = false,
) {
  if (!definition) return Math.max(0, Math.floor(requestedChunkIndex))
  if (definition.activeChunkCount <= 0) return 0
  const requested = Math.max(0, Math.floor(requestedChunkIndex))
  return isLearnerFacingRequest
    ? Math.min(definition.activeChunkCount - 1, requested)
    : mapLegacyPatternTacticChunkIndexToLearnerChunk(requested, definition)
}

export function getPatternTacticLegacyCompletionCredit(rows: LegacyChunkProgressLike[], definition: PatternTacticLearnerCurriculum) {
  if (definition.activeChunkCount <= 0) return { completedActiveChunks: 0, complete: false, legacyPuzzleCredit: 0 }
  const completed = rows.filter((row) => {
    const chunk = Number(row.chunk_index)
    return row.is_mastered === true && Number.isInteger(chunk) && chunk >= 1 && chunk <= definition.legacyChunkCount
  })
  const legacyPuzzleCredit = completed.reduce((total, row) => total + Math.max(Math.floor(Number(row.mastered_puzzles_count) || 0), 30), 0)
  const volumeCredit = Math.min(definition.activeChunkCount, Math.floor(legacyPuzzleCredit / definition.activeChunkSize))
  const bandCredit = new Set(completed.map((row) => mapLegacyPatternTacticChunkIndexToLearnerChunk(Number(row.chunk_index) - 1, definition))).size
  const completedActiveChunks = Math.min(definition.activeChunkCount, Math.max(volumeCredit, bandCredit))
  return { completedActiveChunks, complete: completedActiveChunks >= definition.activeChunkCount, legacyPuzzleCredit }
}

export function isPatternTacticLearnerCourseAvailable(trainerKey: string) {
  if (/^tactic-mixed-m[12]$/.test(trainerKey)) return true
  if (/^tactic-mixed-m[34]$/.test(trainerKey)) return false
  const curriculum = getPatternTacticLearnerCurriculum(trainerKey)
  return curriculum?.activeChunkCount > 0
}

export function getPatternTacticLearnerCompletionByTrainer(rows: Array<LegacyChunkProgressLike & { trainer_key?: string | null }>) {
  return Object.fromEntries(PATTERN_TACTIC_M1_TO_M4_LEARNER_CURRICULA.map((definition) => {
    const legacy = getPatternTacticLegacyCompletionCredit(rows.filter((row) => row.trainer_key === definition.trainerKey), definition)
    const learnerTrainerKey = getPatternTacticLearnerProgressTrainerKey(definition)
    const activeCompletedChunks = new Set(rows
      .filter((row) => row.trainer_key === learnerTrainerKey && row.is_mastered === true)
      .map((row) => Number(row.chunk_index))
      .filter((chunk) => Number.isInteger(chunk) && chunk >= 1 && chunk <= definition.activeChunkCount)).size
    const priorLearnerCompleted = (definition.version.includes("semantic") || definition.version.includes("verified-final"))
      ? new Set(rows
        .filter((row) => row.trainer_key === getPatternTacticPriorLearnerProgressTrainerKey(definition) && row.is_mastered === true)
        .map((row) => Number(row.chunk_index))
        .filter((chunk) => Number.isInteger(chunk) && chunk >= 1 && chunk <= priorLearnerActiveChunkCount(definition))).size
      : 0
    const priorChunkCount = priorLearnerActiveChunkCount(definition)
    const priorLearnerCredit = (definition.version.includes("semantic") || definition.version.includes("verified-final")) && priorChunkCount > 0
      ? Math.min(definition.activeChunkCount, Math.floor((priorLearnerCompleted * definition.activeChunkCount) / priorChunkCount))
      : 0
    const completedActiveChunks = Math.max(legacy.completedActiveChunks, activeCompletedChunks, priorLearnerCredit)
    return [definition.trainerKey, { ...legacy, completedActiveChunks, complete: completedActiveChunks >= definition.activeChunkCount }]
  })) as Record<string, ReturnType<typeof getPatternTacticLegacyCompletionCredit>>
}
