import type { SiteExplanationKey } from "./siteExplanations"

export const MATE_THEME_EXPLANATION_KEYS = {
 anastasia: "anastasiaMate",
 "back-rank": "backRankMate",
 arabian: "arabianMate",
 boden: "bodenMate",
 smothered: "smotheredMate",
 hook: "hookMate",
 dovetail: "dovetailMate",
 "double-bishop": "doubleBishopMate",
 "kill-box-adjacent-rook": "killBoxMate",
 "kill-box-rook-rail": "killBoxMate",
 "kill-box-queen-fence": "killBoxMate",
 mixed: "mixedMate",
} as const satisfies Record<string, SiteExplanationKey>

export const TACTIC_THEME_EXPLANATION_KEYS = {
 defense: "tacticDefense",
 "advanced-pawn": "tacticAdvancedPawn",
 "quiet-move": "tacticQuietMove",
 "discovered-attack": "tacticDiscoveredAttack",
 "discovered-check": "tacticDiscoveredCheck",
 "double-check": "tacticDoubleCheck",
 "knight-fork": "tacticForkDoubleAttack",
 "queen-fork": "tacticForkDoubleAttack",
 "rook-fork": "tacticForkDoubleAttack",
 "bishop-fork": "tacticForkDoubleAttack",
 "pawn-fork": "tacticForkDoubleAttack",
 "king-fork": "tacticForkDoubleAttack",
 "rook-pin": "tacticPin",
 "queen-pin": "tacticPin",
 "bishop-pin": "tacticPin",
 "rook-skewer": "tacticSkewer",
 "queen-skewer": "tacticSkewer",
 "bishop-skewer": "tacticSkewer",
 "decoy-attraction": "tacticDecoyAttraction",
 deflection: "tacticDeflection",
 "decoy-deflection": "tacticDecoyDeflection",
 "hanging-piece": "tacticHangingPiece",
 "trapped-piece": "tacticTrappedPiece",
 "remove-the-defender": "tacticRemoveDefender",
 "vulnerable-king": "tacticVulnerableKing",
 "kingside-attack": "tacticKingsideAttack",
 "queenside-attack": "tacticQueensideAttack",
 "attacking-f2-f7": "tacticAttackingF2F7",
 "queen-sacrifice": "tacticSacrifice",
 "rook-sacrifice": "tacticSacrifice",
 "bishop-sacrifice": "tacticSacrifice",
 "knight-sacrifice": "tacticSacrifice",
 "pawn-sacrifice": "tacticSacrifice",
 clearance: "tacticClearance",
 "diagonal-clearance": "tacticClearance",
 "file-clearance": "tacticClearance",
 "rank-clearance": "tacticClearance",
 "clearance-sacrifice": "tacticClearanceSacrifice",
 interference: "tacticInterference",
 "interference-sacrifice": "tacticInterferenceSacrifice",
 "queen-xray": "tacticXRayAttack",
 "rook-xray": "tacticXRayAttack",
 "bishop-xray": "tacticXRayAttack",
 promotion: "tacticPromotion",
 underpromotion: "tacticUnderpromotion",
 "knight-underpromotion": "tacticKnightUnderpromotion",
 "en-passant": "tacticEnPassant",
 zugzwang: "tacticZugzwang",
 zwischencheck: "tacticZwischencheck",
 zwischenzug: "tacticZwischenzug",
 mixed: "tacticMixed",
} as const satisfies Record<string, SiteExplanationKey>

function normalizedTheme(theme: string) {
 return theme.trim().toLowerCase()
}

export function resolveMateExplanationKey(theme: string): SiteExplanationKey | undefined {
 return (MATE_THEME_EXPLANATION_KEYS as Record<string, SiteExplanationKey>)[normalizedTheme(theme)]
}

export function resolveTacticExplanationKey(theme: string): SiteExplanationKey | undefined {
 return (TACTIC_THEME_EXPLANATION_KEYS as Record<string, SiteExplanationKey>)[normalizedTheme(theme)]
}
