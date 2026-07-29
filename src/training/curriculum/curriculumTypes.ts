export type CurriculumArea =
  | "mates"
  | "tactics"
  | "endgame-piece-mates"
  | "endgame-studies"
  | "openings"
  | "master-games"
  | "board-vision"

export type CurriculumRecommendationKind =
  | "review"
  | "current"
  | "preview"
  | "weakness"
  | "reinforcement"

export type CurriculumItem = {
  id: string
  area: CurriculumArea
  /** A stable, pedagogical stage id. It is deliberately separate from tactic m1–m4. */
  stage: string
  stageOrder: number
  route: string
  trainerKey: string
  chunkIndex: number | null
  theme?: string
  /** A current route's tactical/mating line length where the source catalog exposes one. */
  variantLevel?: number
  isMixed?: boolean
  available: boolean
  tags?: string[]
}

export type ThemeMastery = {
  attempts?: number
  recentAccuracy?: number
  averageSolveSeconds?: number
  hintRate?: number
  mastered?: boolean
}

export type StageMastery = {
  attempts?: number
  recentAccuracy?: number
  mixedAccuracy?: number
  sessionDays?: number
  overdueReviewCount?: number
  permanentlyMastered?: boolean
}

export type CurriculumState = {
  rating?: number | null
  /** Explicitly persisted stage state will be supplied in Phase 2. Phase 1 accepts it as pure input. */
  activeStages?: Partial<Record<CurriculumArea, number>>
  /** Persisted ceilings are authoritative: rating and imported weaknesses may never exceed them. */
  difficultyCeilings?: Partial<Record<CurriculumArea, number>>
  stageMastery?: Partial<Record<CurriculumArea, Record<number, StageMastery>>>
  themeMastery?: Partial<Record<CurriculumArea, Record<string, ThemeMastery>>>
  pieceMateMastery?: Partial<Record<"kqk" | "k2r" | "krk" | "k2b" | "kbn", boolean>>
  failedTransferTest?: boolean
  repeatedFailures?: number
  temporaryReinforcement?: Partial<Record<CurriculumArea, boolean>>
  importedWeakness?: CurriculumArea | null
  /** Phase 1 contracts only; actual repertoire-to-line mapping lands in a later phase. */
  openingRelevance?: {
    hasRepertoireMatch: boolean
    weakLineKeys?: string[]
    shallowDepthCeiling?: number
  }
  /** Phase 1 contracts only; actual master-game matching lands in a later phase. */
  masterGameRelevance?: {
    hasRelevantGame: boolean
    maxMoveCount?: number
    complexityBand?: "beginner" | "intermediate" | "advanced"
  }
}

export type CurriculumEvidence = {
  rating: number
  currentStage: number
  themeMasteryPercent?: number
  mixedUnlocked?: boolean
  stageMastered?: boolean
  reinforcementActive?: boolean
  importedWeaknessApplied?: boolean
}

export type CurriculumRecommendation = {
  area: CurriculumArea
  stage: string
  route: string
  trainerKey: string
  chunkIndex: number | null
  theme?: string | null
  kind: CurriculumRecommendationKind
  explanation: string
  evidence: CurriculumEvidence
  difficultyCeiling: number
}

export type CurriculumSelectionInput = {
  state: CurriculumState
  /** Omit to choose an area from the deterministic category allocation. */
  area?: CurriculumArea
  /** A deterministic session ordinal; callers can persist their own random/session seed later. */
  selectionIndex?: number
}
