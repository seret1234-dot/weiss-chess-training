import type { MistakeExplanation, MistakeExplainInput } from "./types"
import { collectBoardFacts } from "./boardFacts"
import { classifySeverity, estimateEvalLossCp } from "./scoring"
import { buildTemplateExplanation } from "./explanationTemplates"

function explainKqkrForkMistake(input: MistakeExplainInput): MistakeExplanation | null {
  if (input.source !== "trainer" || input.phase !== "endgame") return null
  if (input.trainerId !== "kqkr") return null

  const theme = (input.theme ?? "").toLowerCase()
  const goal = (input.goal ?? "").toLowerCase()
  const isFork = theme.includes("fork") || goal.includes("fork")

  if (!isFork) return null

  const played = input.userMoveSan || input.userMoveUci || "Your move"
  const best = input.bestMoveSan || input.bestMoveUci || "the correct move"
  const isForkInOne = theme === "fork-1" || goal.includes("fork in 1")

  return {
    title: isForkInOne ? "You missed the fork" : "You left the forcing fork line",
    severity: "mistake",
    mistakeType: "endgame_technique",
    evalLossCp: input.evalLossCp ?? 180,
    explanation: isForkInOne
      ? `${played} is not the queen fork. In Fork in 1, the move must do two things at once: give check to the king and attack the rook.`
      : `${played} does not keep the forcing queen-vs-rook line. The move must keep control and continue the exact path to win the rook.`,
    whyBestMoveWorks: isForkInOne
      ? `${best} works because it checks the king and attacks the rook at the same time. After the king moves, the rook is lost.`
      : `${best} keeps the forcing line. In queen vs rook, random checks are not enough; the queen must keep the king restricted and create a fork or forced win of the rook.`,
    lesson: isForkInOne
      ? "Before moving in this drill, ask: does my queen check the king and also hit the rook? If not, it is not the fork."
      : "In queen vs rook, do not just check. Use checks that improve control, restrict the king, or force a fork on the rook.",
    recommendedTrainer: "K + Q vs K + R forks",
    facts: [
      "Pattern: queen fork",
      "Target: win the rook",
      "Required idea: check the king and attack the rook"
    ],
  }
}
export function explainMistake(input: MistakeExplainInput): MistakeExplanation {
  const kqkrForkMistake = explainKqkrForkMistake(input)
  if (kqkrForkMistake) return kqkrForkMistake

 const evalLossCp = estimateEvalLossCp(input)
 const severity = classifySeverity(evalLossCp)
 const boardFacts = collectBoardFacts(input)

 return buildTemplateExplanation({
 input,
 boardFacts,
 severity,
 evalLossCp,
 })
}

export function explainMoveIfMistake(
 input: MistakeExplainInput,
 minEvalLossCp = 70
): MistakeExplanation | null {
 const evalLossCp = estimateEvalLossCp(input)

 if (evalLossCp < minEvalLossCp) {
 return null
 }

 return explainMistake({
 ...input,
 evalLossCp,
 })
}