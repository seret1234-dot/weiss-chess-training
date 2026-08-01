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
  "advanced-pawn", "attacking-f2-f7", "bishop-fork", "bishop-pin", "bishop-sacrifice", "bishop-skewer", "bishop-xray", "clearance", "clearance-sacrifice", "decoy-attraction", "decoy-deflection", "defense", "deflection", "discovered-attack", "discovered-check", "double-check", "en-passant", "hanging-piece", "interference", "interference-sacrifice", "king-fork", "king-sacrifice", "kingside-attack", "knight-fork", "knight-sacrifice", "knight-underpromotion", "other-pin", "other-skewer", "other-xray", "pawn-fork", "pawn-sacrifice", "promotion", "queen-fork", "queen-pin", "queen-sacrifice", "queen-skewer", "queen-xray", "queenside-attack", "quiet-move", "remove-the-defender", "rook-fork", "rook-pin", "rook-sacrifice", "rook-skewer", "rook-xray", "trapped-piece", "underpromotion", "vulnerable-king", "zugzwang", "zwischenzug",
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

export const TIER_A_SEMANTIC_THEME_KEYS = new Set(Object.keys(TIER_A_SEMANTIC_CHUNKS).map((key) => key.replace(/-m[1-4]$/, "")))

function labelFor(theme: string) {
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
  const semanticTierA = TIER_A_SEMANTIC_CHUNKS[sourceKey] !== undefined
  const activeChunkCount = semanticTierA
    ? TIER_A_SEMANTIC_CHUNKS[sourceKey]
    : ACTIVE_CHUNK_COUNT_OVERRIDES[sourceKey] ?? (tacticDistance === 1 ? 5 : 8)
  const version = semanticTierA ? `m${tacticDistance}-semantic-v2` : `m${tacticDistance}-v1`
  return {
    trainerKey: `tactic-${sourceKey}`,
    theme,
    canonicalThemeKey: theme,
    canonicalThemeLabel: labelFor(theme),
    tacticDistance,
    version,
    sourceDataBasePath: `/data/pattern-tactics/${theme}/m${tacticDistance}`,
    learnerDataBasePath: `/data/learner-curricula/pattern-tactics/${theme}-m${tacticDistance}-${semanticTierA ? "semantic-v2" : "v1"}`,
    legacyChunkCount: LEGACY_CHUNK_COUNTS[sourceKey] ?? 10,
    activeChunkCount,
    activeChunkSize: PATTERN_TACTIC_LEARNER_CHUNK_SIZE,
    unavailableReason: activeChunkCount === 0 ? "Not enough semantically verified material is available for this course yet." : undefined,
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
  return `${definition.trainerKey}:m${definition.tacticDistance}-v1`
}

function priorLearnerActiveChunkCount(definition: PatternTacticLearnerCurriculum) {
  const sourceKey = `${definition.theme}-m${definition.tacticDistance}`
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
  const curriculum = getPatternTacticLearnerCurriculum(trainerKey)
  return !curriculum || curriculum.activeChunkCount > 0
}

export function getPatternTacticLearnerCompletionByTrainer(rows: Array<LegacyChunkProgressLike & { trainer_key?: string | null }>) {
  return Object.fromEntries(PATTERN_TACTIC_M1_TO_M4_LEARNER_CURRICULA.map((definition) => {
    const legacy = getPatternTacticLegacyCompletionCredit(rows.filter((row) => row.trainer_key === definition.trainerKey), definition)
    const learnerTrainerKey = getPatternTacticLearnerProgressTrainerKey(definition)
    const activeCompletedChunks = new Set(rows
      .filter((row) => row.trainer_key === learnerTrainerKey && row.is_mastered === true)
      .map((row) => Number(row.chunk_index))
      .filter((chunk) => Number.isInteger(chunk) && chunk >= 1 && chunk <= definition.activeChunkCount)).size
    const priorLearnerCompleted = definition.version.includes("semantic-v2")
      ? new Set(rows
        .filter((row) => row.trainer_key === getPatternTacticPriorLearnerProgressTrainerKey(definition) && row.is_mastered === true)
        .map((row) => Number(row.chunk_index))
        .filter((chunk) => Number.isInteger(chunk) && chunk >= 1 && chunk <= priorLearnerActiveChunkCount(definition))).size
      : 0
    const priorLearnerCredit = definition.version.includes("semantic-v2")
      ? Math.min(definition.activeChunkCount, Math.floor((priorLearnerCompleted * definition.activeChunkCount) / priorLearnerActiveChunkCount(definition)))
      : 0
    const completedActiveChunks = Math.max(legacy.completedActiveChunks, activeCompletedChunks, priorLearnerCredit)
    return [definition.trainerKey, { ...legacy, completedActiveChunks, complete: completedActiveChunks >= definition.activeChunkCount }]
  })) as Record<string, ReturnType<typeof getPatternTacticLegacyCompletionCredit>>
}
