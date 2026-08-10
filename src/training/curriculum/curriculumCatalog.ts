import { AUTO_TRAINERS } from "../trainerCatalog"
import type { CurriculumArea, CurriculumItem } from "./curriculumTypes"

export const CURRICULUM_AREAS: CurriculumArea[] = [
  "mates",
  "tactics",
  "endgame-piece-mates",
  "endgame-studies",
  "openings",
  "master-games",
  "board-vision",
]

const MATE_STAGE_BY_ROUTE_LEVEL: Record<string, number> = { m1: 1, m2: 2, m3: 3, m4: 4, m5: 4 }

export const MATE_THEMES = ["anastasia", "back-rank", "arabian", "boden", "smothered", "hook", "kill-box", "dovetail", "double-bishop"] as const

/**
 * These mappings deliberately classify motifs, not merely the existing m1–m4
 * route suffix. Route distance remains variantLevel metadata for later selection.
 */
function parseRoute(route: string) {
  return route.split("/").filter(Boolean)
}

function mateItems(): CurriculumItem[] {
  return AUTO_TRAINERS
    .filter((trainer) => trainer.category === "mates")
    .map((trainer) => {
      const [, level, theme] = parseRoute(trainer.route)
      const stageOrder = MATE_STAGE_BY_ROUTE_LEVEL[level]
      return {
        id: `mates:${trainer.trainerKey}`,
        area: "mates" as const,
        stage: stageOrder === 4 ? "mates-m4plus" : `mates-m${stageOrder}`,
        stageOrder,
        route: trainer.route,
        trainerKey: trainer.trainerKey,
        chunkIndex: null,
        theme,
        variantLevel: Number(level.slice(1)),
        isMixed: theme === "mixed",
        available: true,
      }
    })
}

function tacticItems(): CurriculumItem[] {
  return AUTO_TRAINERS
    .filter((trainer) => trainer.category === "tactics")
    .flatMap((trainer) => {
      const [, level, theme] = parseRoute(trainer.route)
      const variantLevel = Number(level.slice(1))
      const stageOrder = variantLevel
      return [{
        id: `tactics:${trainer.trainerKey}`,
        area: "tactics" as const,
        stage: `tactics-stage-${stageOrder}`,
        stageOrder,
        route: trainer.route,
        trainerKey: trainer.trainerKey,
        chunkIndex: null,
        theme,
        variantLevel,
        isMixed: theme === "mixed",
        available: true,
      }]
    })
}

const pieceMateItems: CurriculumItem[] = [
  ["kqk", "King + Queen vs King", "/endgame/piece-mates/kqk"],
  ["k2r", "King + Two Rooks vs King", "/endgame/piece-mates/k2r"],
  ["krk", "King + Rook vs King", "/endgame/piece-mates/krk"],
  ["k2b", "King + Two Bishops vs King", "/endgame/piece-mates/two-bishops"],
  ["kbn", "King + Bishop and Knight vs King", "/endgame/piece-mates/bn"],
].map(([id, title, route], index) => ({
  id: `piece-mates:${id}`,
  area: "endgame-piece-mates" as const,
  stage: `piece-mates-${id}`,
  stageOrder: index + 1,
  route,
  trainerKey: `piece-mates-${id}`,
  chunkIndex: null,
  theme: id,
  available: true,
  tags: [title],
}))

const endgameStudyItems: CurriculumItem[] = [
  [1, "kpk", "/endgame-studies/kpk"],
  [1, "stalemate", "/endgame-studies/stalemate"],
  [1, "pawn-races", "/endgame-studies/pawns"],
  [2, "krkp", "/endgame-studies/krkp"],
  [2, "lucena", "/endgame-studies/lucena"],
  [2, "philidor", "/endgame-studies/philidor"],
  [2, "kqkp7", "/endgame-studies/kqkp7"],
  [3, "kqkr", "/endgame-studies/kqkr"],
  [3, "knnkp", "/endgame-studies/knnkp"],
  [3, "knnkp-forced", "/endgame-studies/knnkp-forced"],
  [3, "zugzwang", "/endgame-studies/zugzwang"],
  [3, "shouldering", "/endgame-studies/shouldering"],
  [3, "fortress", "/endgame-studies/fortress"],
].map(([stageOrder, theme, route]) => ({
  id: `endgame-studies:${theme}`,
  area: "endgame-studies" as const,
  stage: `endgame-studies-${stageOrder}`,
  stageOrder: Number(stageOrder),
  route: String(route),
  trainerKey: `endgame-studies-${theme}`,
  chunkIndex: null,
  theme: String(theme),
  available: true,
}))

/** Real phases in BoardVisionPage's private COURSE_CHUNKS order. Future requested stages remain unavailable. */
const boardVisionItems: CurriculumItem[] = [
  [1, "files", "Files recognition"],
  [2, "ranks", "Ranks recognition"],
  [3, "colors", "Square colors"],
  [4, "halves-quadrants", "Halves and quadrants"],
  [5, "diagonals", "Diagonal recognition"],
  [6, "geometry", "Board geometry"],
  [7, "mixed-review", "Mixed square review"],
  [8, "final-full-board", "Full-board speed review"],
  [9, "attacked-squares", "Attacked squares"],
  [10, "legal-destinations", "Legal destinations"],
  [11, "pgn-reading", "PGN reading"],
  [12, "blind-sequences", "Blind multi-move visualization"],
].map(([stageOrder, theme, label]) => ({
  id: `board-vision:${theme}`,
  area: "board-vision" as const,
  stage: `board-vision-${stageOrder}`,
  stageOrder: Number(stageOrder),
  route: "/board-vision",
  trainerKey: "board-vision-basic",
  chunkIndex: null,
  theme: String(theme),
  available: Number(stageOrder) <= 8,
  tags: [String(label)],
}))

/**
 * Phase 1 interfaces only. They are deliberately unavailable until the later
 * repertoire/game matcher can attach a real line or game identity; a generic
 * /openings or /master-games route would violate relevance requirements.
 */
const openingAndMasterGameInterfaces: CurriculumItem[] = [
  {
    id: "openings:repertoire-placeholder",
    area: "openings",
    stage: "openings-beginner",
    stageOrder: 1,
    route: "/openings",
    trainerKey: "openings-repertoire",
    chunkIndex: null,
    available: false,
    tags: ["requires-opening-profile", "beginner-depth-ceiling", "weak-line-relevance", "repertoire-match"],
  },
  {
    id: "master-games:relevance-placeholder",
    area: "master-games",
    stage: "master-games-beginner",
    stageOrder: 1,
    route: "/master-games",
    trainerKey: "master-games-relevance",
    chunkIndex: null,
    available: false,
    tags: ["requires-opening-relevance", "move-count-ceiling", "complexity-band", "short-game-eligible"],
  },
]

export const CURRICULUM_CATALOG: CurriculumItem[] = [
  ...mateItems(),
  ...tacticItems(),
  ...pieceMateItems,
  ...endgameStudyItems,
  ...boardVisionItems,
  ...openingAndMasterGameInterfaces,
]

export function getCurriculumItems(area?: CurriculumArea) {
  return CURRICULUM_CATALOG.filter((item) => !area || item.area === area)
}

export function getStageThemes(area: "mates" | "tactics", stageOrder: number) {
  if (area === "mates") return [...MATE_THEMES]
  // The semantic catalog is fail-closed. Mastery and mixed-unlock evidence
  // must therefore be based only on courses that can actually be scheduled;
  // a raw, unavailable source theme may never block a learner's progress or
  // force a fallback into the next stage.
  return CURRICULUM_CATALOG
    .filter((item) => item.area === "tactics" && item.stageOrder === stageOrder && !item.isMixed && item.available && item.theme)
    .map((item) => item.theme as string)
}
