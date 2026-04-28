export type PatternMatePageConfigEntry = {
  title: string
  manifestPath: string
  progressKey?: string
  allowChunkNavigation?: boolean
}

export const patternMatePageConfigs = {
  anastasiaMate1: {
    title: "Anastasia Mate in 1",
    manifestPath: "/data/pattern-mates/anastasia/mate-in-1/manifest.json",
    progressKey: "anastasia-mate-1",
  },

  anastasiaMate2: {
    title: "Anastasia Mate in 2",
    manifestPath: "/data/pattern-mates/anastasia/mate-in-2/manifest.json",
    progressKey: "anastasia-mate-2",
  },

  backRankMate1: {
    title: "Back Rank Mate in 1",
    manifestPath: "/data/pattern-mates/back-rank/mate-in-1/manifest.json",
    progressKey: "back-rank-mate-1",
  },

  backRankMate2: {
    title: "Back Rank Mate in 2",
    manifestPath: "/data/pattern-mates/back-rank/mate-in-2/manifest.json",
    progressKey: "back-rank-mate-2",
  },

  bishopKnightMate: {
    title: "Bishop and Knight Mate",
    manifestPath: "/data/pattern-mates/bishop-knight/manifest.json",
    progressKey: "bishop-knight-mate",
  },

  twoBishopsMate: {
    title: "Two Bishops Mate",
    manifestPath: "/data/pattern-mates/two-bishops/manifest.json",
    progressKey: "two-bishops-mate",
  },
} satisfies Record<string, PatternMatePageConfigEntry>

export type PatternMatePageConfigKey = keyof typeof patternMatePageConfigs

export function getPatternMatePageConfig(key: PatternMatePageConfigKey) {
  return patternMatePageConfigs[key]
}