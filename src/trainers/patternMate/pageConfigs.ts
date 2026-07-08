import type { SiteExplanationKey } from "../../content/siteExplanations"

export type PatternMatePageConfigEntry = {
 title: string
 manifestPath: string
 progressKey?: string
 explanationKey?: SiteExplanationKey
 allowChunkNavigation?: boolean
}

export const patternMatePageConfigs = {
 anastasiaMate1: {
 title: "Anastasia Mate in 1",
 explanationKey: "anastasiaMate",
 manifestPath: "/data/lichess/mate_in_1/anastasia/manifest.json",
 progressKey: "anastasia-mate-1",
 },

 anastasiaMate2: {
 title: "Anastasia Mate in 2",
 explanationKey: "anastasiaMate",
 manifestPath: "/data/lichess/mate_in_2/anastasia/manifest.json",
 progressKey: "anastasia-mate-2",
 },
 anastasiaMate3: {
 title: "Anastasia Mate in 3",
 explanationKey: "anastasiaMate",
 manifestPath: "/data/lichess/mate_in_3/anastasia/manifest.json",
 progressKey: "anastasia-mate-in-3",
 },

 anastasiaMate4: {
 title: "Anastasia Mate in 4",
 explanationKey: "anastasiaMate",
 manifestPath: "/data/lichess/mate_in_4/anastasia/manifest.json",
 progressKey: "anastasia-mate-in-4",
 },

 anastasiaMate5: {
 title: "Anastasia Mate in 5",
 explanationKey: "anastasiaMate",
 manifestPath: "/data/lichess/mate_in_5/anastasia/manifest.json",
 progressKey: "anastasia-mate-in-5",
 },

 backRankMate1: {
 title: "Back Rank Mate in 1",
 explanationKey: "backRankMate",
 manifestPath: "/data/lichess/mate_in_1/back_rank/manifest.json",
 progressKey: "back-rank-mate-1",
 },

 backRankMate2: {
 title: "Back Rank Mate in 2",
 explanationKey: "backRankMate",
 manifestPath: "/data/pattern-mates/back-rank/mate-in-2/manifest.json",
 progressKey: "back-rank-mate-2",
 },
 backRankMate3: {
 title: "Back Rank Mate in 3",
 explanationKey: "backRankMate",
 manifestPath: "/data/pattern-mates/back-rank/mate-in-3/manifest.json",
 progressKey: "back-rank-mate-3",
 },
 backRankMate4: {
 title: "Back Rank Mate in 4",
 explanationKey: "backRankMate",
 manifestPath: "/data/pattern-mates/back-rank/mate-in-4/manifest.json",
 progressKey: "back-rank-mate-4",
 },
 backRankMate5: {
 title: "Back Rank Mate in 5",
 explanationKey: "backRankMate",
 manifestPath: "/data/pattern-mates/back-rank/mate-in-5/manifest.json",
 progressKey: "back-rank-mate-5",
 },
 arabianMate1: {
 title: "Arabian Mate in 1",
 explanationKey: "arabianMate",
 manifestPath: "/data/pattern-mates/arabian/mate-in-1/manifest.json",
 progressKey: "arabian-mate-1",
 },
 arabianMate2: {
 title: "Arabian Mate in 2",
 explanationKey: "arabianMate",
 manifestPath: "/data/pattern-mates/arabian/mate-in-2/manifest.json",
 progressKey: "arabian-mate-2",
 },
 arabianMate3: {
 title: "Arabian Mate in 3",
 explanationKey: "arabianMate",
 manifestPath: "/data/pattern-mates/arabian/mate-in-3/manifest.json",
 progressKey: "arabian-mate-3",
 },
 arabianMate4: {
 title: "Arabian Mate in 4",
 explanationKey: "arabianMate",
 manifestPath: "/data/pattern-mates/arabian/mate-in-4/manifest.json",
 progressKey: "arabian-mate-4",
 },
 arabianMate5: {
 title: "Arabian Mate in 5",
 explanationKey: "arabianMate",
 manifestPath: "/data/pattern-mates/arabian/mate-in-5/manifest.json",
 progressKey: "arabian-mate-5",
 },
 bodenMate1: {
 title: "Boden Mate in 1",
 explanationKey: "mates",
 manifestPath: "/data/pattern-mates/boden/mate-in-1/manifest.json",
 progressKey: "boden-mate-1",
 },
 bodenMate2: {
 title: "Boden Mate in 2",
 explanationKey: "mates",
 manifestPath: "/data/pattern-mates/boden/mate-in-2/manifest.json",
 progressKey: "boden-mate-2",
 },
 bodenMate3: {
 title: "Boden Mate in 3+",
 explanationKey: "mates",
 manifestPath: "/data/pattern-mates/boden/mate-in-3/manifest.json",
 progressKey: "boden-mate-3",
 },













 bishopKnightMate: {
 title: "Bishop and Knight Mate",
 explanationKey: "mates",
 manifestPath: "/data/pattern-mates/bishop-knight/manifest.json",
 progressKey: "bishop-knight-mate",
 },

 twoBishopsMate: {
 title: "Two Bishops Mate",
 explanationKey: "mates",
 manifestPath: "/data/pattern-mates/two-bishops/manifest.json",
 progressKey: "two-bishops-mate",
 },

 smotheredMate1: {
 title: "Smothered Mate in 1",
 explanationKey: "smotheredMate",
 manifestPath: "/data/pattern-mates/smothered/mate-in-1/manifest.json",
 progressKey: "smothered-mate-1",
 },
 smotheredMate2: {
 title: "Smothered Mate in 2",
 explanationKey: "smotheredMate",
 manifestPath: "/data/pattern-mates/smothered/mate-in-2/manifest.json",
 progressKey: "smothered-mate-2",
 },
 smotheredMate3: {
 title: "Smothered Mate in 3",
 explanationKey: "smotheredMate",
 manifestPath: "/data/pattern-mates/smothered/mate-in-3/manifest.json",
 progressKey: "smothered-mate-3",
 },
 smotheredMate4: {
 title: "Smothered Mate in 4",
 explanationKey: "smotheredMate",
 manifestPath: "/data/pattern-mates/smothered/mate-in-4/manifest.json",
 progressKey: "smothered-mate-4",
 },
 hookMate1: {
 title: "Hook Mate in 1",
 explanationKey: "hookMate",
 manifestPath: "/data/pattern-mates/hook/mate-in-1/manifest.json",
 progressKey: "hook-mate-1",
 },
 hookMate2: {
 title: "Hook Mate in 2",
 explanationKey: "hookMate",
 manifestPath: "/data/pattern-mates/hook/mate-in-2/manifest.json",
 progressKey: "hook-mate-2",
 },
 hookMate3: {
 title: "Hook Mate in 3",
 explanationKey: "hookMate",
 manifestPath: "/data/pattern-mates/hook/mate-in-3/manifest.json",
 progressKey: "hook-mate-3",
 },
 hookMate4: {
 title: "Hook Mate in 4",
 explanationKey: "hookMate",
 manifestPath: "/data/pattern-mates/hook/mate-in-4/manifest.json",
 progressKey: "hook-mate-4",
 },
 hookMate5: {
 title: "Hook Mate in 5",
 explanationKey: "hookMate",
 manifestPath: "/data/pattern-mates/hook/mate-in-5/manifest.json",
 progressKey: "hook-mate-5",
 },
 killBoxMate1: {
 title: "Kill Box Mate in 1",
 explanationKey: "killBoxMate",
 manifestPath: "/data/pattern-mates/kill-box/mate-in-1/manifest.json",
 progressKey: "kill-box-mate-1",
 },

 killBoxMate2: {
 title: "Kill Box Mate in 2",
 explanationKey: "killBoxMate",
 manifestPath: "/data/pattern-mates/kill-box/mate-in-2/manifest.json",
 progressKey: "kill-box-mate-2",
 },

 killBoxMate3: {
 title: "Kill Box Mate in 3",
 explanationKey: "killBoxMate",
 manifestPath: "/data/pattern-mates/kill-box/mate-in-3/manifest.json",
 progressKey: "kill-box-mate-3",
 },

 killBoxMate4: {
 title: "Kill Box Mate in 4",
 explanationKey: "killBoxMate",
 manifestPath: "/data/pattern-mates/kill-box/mate-in-4/manifest.json",
 progressKey: "kill-box-mate-4",
 },

 killBoxMate5: {
 title: "Kill Box Mate in 5",
 explanationKey: "killBoxMate",
 manifestPath: "/data/pattern-mates/kill-box/mate-in-5/manifest.json",
 progressKey: "kill-box-mate-5",
 },

 dovetailMate1: {
 title: "Dovetail Mate in 1",
 explanationKey: "dovetailMate",
 manifestPath: "/data/pattern-mates/dovetail/mate-in-1/manifest.json",
 progressKey: "dovetail-mate-1",
 },

 dovetailMate2: {
 title: "Dovetail Mate in 2",
 explanationKey: "dovetailMate",
 manifestPath: "/data/pattern-mates/dovetail/mate-in-2/manifest.json",
 progressKey: "dovetail-mate-2",
 },

 dovetailMate3: {
 title: "Dovetail Mate in 3",
 explanationKey: "dovetailMate",
 manifestPath: "/data/pattern-mates/dovetail/mate-in-3/manifest.json",
 progressKey: "dovetail-mate-3",
 },

 dovetailMate4: {
 title: "Dovetail Mate in 4",
 explanationKey: "dovetailMate",
 manifestPath: "/data/pattern-mates/dovetail/mate-in-4/manifest.json",
 progressKey: "dovetail-mate-4",
 },

 dovetailMate5: {
 title: "Dovetail Mate in 5",
 explanationKey: "dovetailMate",
 manifestPath: "/data/pattern-mates/dovetail/mate-in-5/manifest.json",
 progressKey: "dovetail-mate-5",
 },

 doubleBishopMate1: {
 title: "Double Bishop Mate in 1",
 explanationKey: "doubleBishopMate",
 manifestPath: "/data/pattern-mates/double-bishop/mate-in-1/manifest.json",
 progressKey: "double-bishop-mate-1",
 },

 doubleBishopMate2: {
 title: "Double Bishop Mate in 2",
 explanationKey: "doubleBishopMate",
 manifestPath: "/data/pattern-mates/double-bishop/mate-in-2/manifest.json",
 progressKey: "double-bishop-mate-2",
 },

 doubleBishopMate3: {
 title: "Double Bishop Mate in 3+",
 explanationKey: "doubleBishopMate",
 manifestPath: "/data/pattern-mates/double-bishop/mate-in-3/manifest.json",
 progressKey: "double-bishop-mate-3-plus",
 },

 mixedMate1: {
 title: "Mixed Mate in 1",
 explanationKey: "mixedMate",
 manifestPath: "/data/pattern-mates/mixed/mate-in-1/manifest.json",
 progressKey: "mixed-mate-1",
 },

 mixedMate2: {
 title: "Mixed Mate in 2",
 explanationKey: "mixedMate",
 manifestPath: "/data/pattern-mates/mixed/mate-in-2/manifest.json",
 progressKey: "mixed-mate-2",
 },

 mixedMate3: {
 title: "Mixed Mate in 3",
 explanationKey: "mixedMate",
 manifestPath: "/data/pattern-mates/mixed/mate-in-3/manifest.json",
 progressKey: "mixed-mate-3",
 },

 mixedMate4: {
 title: "Mixed Mate in 4",
 explanationKey: "mixedMate",
 manifestPath: "/data/pattern-mates/mixed/mate-in-4/manifest.json",
 progressKey: "mixed-mate-4",
 },

 mixedMate5: {
 title: "Mixed Mate in 5",
 explanationKey: "mixedMate",
 manifestPath: "/data/pattern-mates/mixed/mate-in-5/manifest.json",
 progressKey: "mixed-mate-5",
 },
 stalemateUnderpromotion: {
 title: "Stalemate Underpromotion",
 explanationKey: "stalemateUnderpromotion",
 manifestPath: "/data/pattern-mates/stalemate/underpromotion/manifest.json",
 progressKey: "stalemate-underpromotion",
 },
} satisfies Record<string, PatternMatePageConfigEntry>

export type PatternMatePageConfigKey = keyof typeof patternMatePageConfigs

export function getPatternMatePageConfig(key: PatternMatePageConfigKey) {
 return patternMatePageConfigs[key]
}