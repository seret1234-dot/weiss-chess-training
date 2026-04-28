export type StudyType = "chunk" | "line" | "game" | "vision"
export type TrainerCategory =
  | "mates"
  | "endgames"
  | "board-vision"
  | "master-games"
  | "openings"

export type TrainerCatalogEntry = {
  trainerKey: string
  route: string
  title: string
  category: TrainerCategory
  studyType: StudyType
  autoEnabled: boolean
  sortOrder: number
}

export const TRAINER_CATALOG: TrainerCatalogEntry[] = [
  // =====================
  // MATES - ANASTASIA
  // =====================
  {
    trainerKey: "anastasia-mate-in-1",
    route: "/pattern/anastasia/mate-in-1",
    title: "Anastasia Mate in 1",
    category: "mates",
    studyType: "chunk",
    autoEnabled: true,
    sortOrder: 10,
  },
  {
    trainerKey: "anastasia-mate-in-2",
    route: "/pattern/anastasia/mate-in-2", // ✅ FIXED
    title: "Anastasia Mate in 2",
    category: "mates",
    studyType: "chunk",
    autoEnabled: true,
    sortOrder: 20,
  },

  // =====================
  // TEST VARIANTS (important for AUTO randomness)
  // =====================
  {
    trainerKey: "anastasia-mate-in-1-copy",
    route: "/pattern/anastasia/mate-in-1",
    title: "Anastasia Mate in 1 (Alt)",
    category: "mates",
    studyType: "chunk",
    autoEnabled: true,
    sortOrder: 30,
  },
  {
    trainerKey: "anastasia-mate-in-2-copy",
    route: "/pattern/anastasia/mate-in-2",
    title: "Anastasia Mate in 2 (Alt)",
    category: "mates",
    studyType: "chunk",
    autoEnabled: true,
    sortOrder: 40,
  },

  // =====================
  // ENDGAMES (example)
  // =====================
  {
    trainerKey: "kqk-basic",
    route: "/endgames/kqk",
    title: "King + Queen vs King",
    category: "endgames",
    studyType: "chunk",
    autoEnabled: true,
    sortOrder: 100,
  },
  {
    trainerKey: "krk-basic",
    route: "/endgames/krk",
    title: "King + Rook vs King",
    category: "endgames",
    studyType: "chunk",
    autoEnabled: true,
    sortOrder: 110,
  },

  // =====================
  // BOARD VISION
  // =====================
  {
    trainerKey: "board-vision-basic",
    route: "/board-vision",
    title: "Board Vision",
    category: "board-vision",
    studyType: "vision",
    autoEnabled: true,
    sortOrder: 200,
  },

  // =====================
  // MASTER GAMES
  // =====================
  {
    trainerKey: "master-games-basic",
    route: "/master-games",
    title: "Master Games",
    category: "master-games",
    studyType: "game",
    autoEnabled: true,
    sortOrder: 300,
  },
]

export const AUTO_TRAINERS = TRAINER_CATALOG
  .filter((trainer) => trainer.autoEnabled)
  .sort((a, b) => a.sortOrder - b.sortOrder)

export const TRAINER_BY_KEY = Object.fromEntries(
  TRAINER_CATALOG.map((trainer) => [trainer.trainerKey, trainer])
) as Record<string, TrainerCatalogEntry>

export function getTrainerByKey(
  trainerKey: string
): TrainerCatalogEntry | undefined {
  return TRAINER_BY_KEY[trainerKey]
}