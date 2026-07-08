export type TacticDistanceId = "m1" | "m2" | "m3" | "m4"

export const tacticDistanceLabels: Record<TacticDistanceId, string> = {
 m1: "Tactic in 1",
 m2: "Tactic in 2",
 m3: "Tactic in 3",
 m4: "Tactic in 4+",
}

export const tacticThemeCatalog = [
 {
 "key": "defense",
 "title": "Defense",
 "slug": "defense",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "advanced-pawn",
 "title": "Advanced Pawn",
 "slug": "advanced-pawn",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "quiet-move",
 "title": "Quiet Move",
 "slug": "quiet-move",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "discovered-attack",
 "title": "Discovered Attack",
 "slug": "discovered-attack",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "discovered-check",
 "title": "Discovered Check",
 "slug": "discovered-check",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "double-check",
 "title": "Double Check",
 "slug": "double-check",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "fork-knight",
 "title": "Knight Fork / Double Attack",
 "slug": "knight-fork",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "fork-queen",
 "title": "Queen Fork / Double Attack",
 "slug": "queen-fork",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "fork-rook",
 "title": "Rook Fork / Double Attack",
 "slug": "rook-fork",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "fork-bishop",
 "title": "Bishop Fork / Double Attack",
 "slug": "bishop-fork",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "fork-pawn",
 "title": "Pawn Fork / Double Attack",
 "slug": "pawn-fork",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "fork-king",
 "title": "King Fork / Double Attack",
 "slug": "king-fork",
 "distances": [
 "m1",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "pin-rook",
 "title": "Rook Pin",
 "slug": "rook-pin",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "pin-queen",
 "title": "Queen Pin",
 "slug": "queen-pin",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "pin-bishop",
 "title": "Bishop Pin",
 "slug": "bishop-pin",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "pin-other",
 "title": "Other Pin",
 "slug": "other-pin",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "skewer-rook",
 "title": "Rook Skewer",
 "slug": "rook-skewer",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "skewer-queen",
 "title": "Queen Skewer",
 "slug": "queen-skewer",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "skewer-bishop",
 "title": "Bishop Skewer",
 "slug": "bishop-skewer",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "skewer-other",
 "title": "Other Skewer",
 "slug": "other-skewer",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "decoy-attraction",
 "title": "Decoy / Attraction",
 "slug": "decoy-attraction",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "deflection",
 "title": "Deflection",
 "slug": "deflection",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "decoy-deflection-combined",
 "title": "Decoy + Deflection",
 "slug": "decoy-deflection",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "hanging-piece",
 "title": "Hanging Piece",
 "slug": "hanging-piece",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "trapped-piece",
 "title": "Trapped Piece",
 "slug": "trapped-piece",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "remove-the-defender",
 "title": "Remove the Defender",
 "slug": "remove-the-defender",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "vulnerable-king",
 "title": "Vulnerable / Exposed King",
 "slug": "vulnerable-king",
 "distances": [
 "m1",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "kingside-attack",
 "title": "Kingside Attack",
 "slug": "kingside-attack",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "queenside-attack",
 "title": "Queenside Attack",
 "slug": "queenside-attack",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "attacking-f2-f7",
 "title": "Attacking f2/f7",
 "slug": "attacking-f2-f7",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "sacrifice-queen",
 "title": "Queen Sacrifice",
 "slug": "queen-sacrifice",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "sacrifice-rook",
 "title": "Rook Sacrifice",
 "slug": "rook-sacrifice",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "sacrifice-bishop",
 "title": "Bishop Sacrifice",
 "slug": "bishop-sacrifice",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "sacrifice-knight",
 "title": "Knight Sacrifice",
 "slug": "knight-sacrifice",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "sacrifice-pawn",
 "title": "Pawn Sacrifice",
 "slug": "pawn-sacrifice",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "sacrifice-king",
 "title": "King Sacrifice",
 "slug": "king-sacrifice",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "clearance",
 "title": "Clearance",
 "slug": "clearance",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "clearance-sacrifice",
 "title": "Clearance Sacrifice",
 "slug": "clearance-sacrifice",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "interference",
 "title": "Interference",
 "slug": "interference",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "interference-sacrifice",
 "title": "Interference Sacrifice",
 "slug": "interference-sacrifice",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 56,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "xray-queen",
 "title": "Queen X-Ray Attack",
 "slug": "queen-xray",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "xray-rook",
 "title": "Rook X-Ray Attack",
 "slug": "rook-xray",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "xray-bishop",
 "title": "Bishop X-Ray Attack",
 "slug": "bishop-xray",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 195,
 "m3": 300,
 "m4": 174
 }
 },
 {
 "key": "xray-other",
 "title": "Other X-Ray Attack",
 "slug": "other-xray",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 289
 }
 },
 {
 "key": "promotion",
 "title": "Promotion",
 "slug": "promotion",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "underpromotion",
 "title": "Underpromotion",
 "slug": "underpromotion",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 248,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "underpromotion-knight",
 "title": "Knight Underpromotion",
 "slug": "knight-underpromotion",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 269,
 "m2": 244,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "en-passant",
 "title": "En Passant",
 "slug": "en-passant",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "zugzwang",
 "title": "Zugzwang",
 "slug": "zugzwang",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "zwischenzug",
 "title": "Zwischenzug / Intermezzo",
 "slug": "zwischenzug",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 300,
 "m2": 300,
 "m3": 300,
 "m4": 300
 }
 },
 {
 "key": "mixed",
 "title": "Mixed",
 "slug": "mixed",
 "distances": [
 "m1",
 "m2",
 "m3",
 "m4"
 ],
 "countByDistance": {
 "m1": 600,
 "m2": 600,
 "m3": 600,
 "m4": 600
 }
 }
] as const

