import type { ChessColor, MistakeSeverity } from "./types"

export function estimateEvalLossCp(input: {
 evalBeforeCp?: number
 evalAfterCp?: number
 evalLossCp?: number
 userColor?: ChessColor
}): number {
 if (typeof input.evalLossCp === "number") {
 return Math.max(0, Math.round(input.evalLossCp))
 }

 if (
 typeof input.evalBeforeCp !== "number" ||
 typeof input.evalAfterCp !== "number" ||
 !input.userColor
 ) {
 return 0
 }

 const beforeForUser =
 input.userColor === "white" ? input.evalBeforeCp : -input.evalBeforeCp

 const afterForUser =
 input.userColor === "white" ? input.evalAfterCp : -input.evalAfterCp

 return Math.max(0, Math.round(beforeForUser - afterForUser))
}

export function classifySeverity(evalLossCp: number): MistakeSeverity {
 if (evalLossCp >= 300) return "blunder"
 if (evalLossCp >= 150) return "mistake"
 if (evalLossCp >= 70) return "inaccuracy"
 return "none"
}

export function cpToPawns(cp: number): string {
 return (cp / 100).toFixed(1)
}