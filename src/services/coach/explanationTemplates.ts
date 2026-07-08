import type {
 BoardFactResult,
 MistakeExplainInput,
 MistakeExplanation,
 MistakeSeverity,
 MistakeTag,
} from "./types"
import { cpToPawns } from "./scoring"

function firstUsefulTag(tags: MistakeTag[]): MistakeTag {
 const priority: MistakeTag[] = [
 "missed_mate",
 "allowed_mate",
 "hung_piece",
 "missed_capture",
 "missed_check",
 "missed_forcing_move",
 "endgame_technique",
 "opening_memory",
 "king_safety",
 "generic",
 ]

 return priority.find((tag) => tags.includes(tag)) || "generic"
}

function titleFor(tag: MistakeTag, severity: MistakeSeverity): string {
 if (tag === "missed_mate") return "Missed checkmate"
 if (tag === "allowed_mate") return "You allowed checkmate"
 if (tag === "hung_piece") return "A piece was left loose"
 if (tag === "missed_capture") return "You missed a strong capture"
 if (tag === "missed_check") return "You missed a forcing check"
 if (tag === "missed_forcing_move") return "You missed a forcing move"
 if (tag === "endgame_technique") return "Endgame technique mistake"
 if (tag === "opening_memory") return "Opening memory problem"

 if (severity === "blunder") return "This was a serious blunder"
 if (severity === "mistake") return "This was a mistake"
 if (severity === "inaccuracy") return "This was an inaccuracy"
 return "Move explanation"
}

function trainerFor(tag: MistakeTag): string | undefined {
 if (tag === "missed_mate") return "Mate patterns"
 if (tag === "allowed_mate") return "Defensive mate patterns"
 if (tag === "hung_piece") return "Board vision and loose pieces"
 if (tag === "missed_capture") return "Checks, captures, and threats"
 if (tag === "missed_check") return "Forcing moves"
 if (tag === "missed_forcing_move") return "Forcing moves"
 if (tag === "endgame_technique") return "Endgame trainer"
 if (tag === "opening_memory") return "Opening trainer"
 if (tag === "king_safety") return "King safety"
 return undefined
}

function lessonFor(tag: MistakeTag): string {
 if (tag === "missed_mate") {
 return "Before playing a normal move, always check whether you have forcing checks or mate threats."
 }

 if (tag === "allowed_mate") {
 return "When your king is exposed, first ask what forcing checks your opponent will have after your move."
 }

 if (tag === "hung_piece") {
 return "Before moving, check which of your pieces are undefended and what your opponent can capture next."
 }

 if (tag === "missed_capture") {
 return "Use the forcing-move scan: checks, captures, threats. Captures often reveal the tactical point."
 }

 if (tag === "missed_check" || tag === "missed_forcing_move") {
 return "Forcing moves should be checked first because they limit the opponent's replies."
 }

 if (tag === "endgame_technique") {
 return "In endgames, small inaccuracies matter more. Look for activity, passed pawns, king position, and simple conversions."
 }

 if (tag === "opening_memory") {
 return "The goal is not only memorizing the move, but knowing the plan that belongs to the position."
 }

 return "Compare your candidate move with the opponent's strongest reply before committing."
}

function explanationFor(
 tag: MistakeTag,
 severity: MistakeSeverity,
 evalLossCp: number,
 facts: BoardFactResult,
 input: MistakeExplainInput
): string {
 const played = facts.userMoveLabel || "your move"
 const best = facts.bestMoveLabel || "the engine move"
 const lossText =
 evalLossCp > 0
 ? `The evaluation dropped by about ${cpToPawns(evalLossCp)} pawns. `
 : ""

 if (tag === "missed_mate") {
 return `${lossText}${played} missed a direct mate. In this position, the first thing to check is forcing checks.`
 }

 if (tag === "allowed_mate") {
 return `${lossText}${played} allowed the opponent a mating continuation. The main problem is king safety after your move.`
 }

 if (tag === "hung_piece") {
 return `${lossText}${played} left material vulnerable. The opponent gets an immediate chance to win material instead of letting you continue your plan.`
 }

 if (tag === "missed_capture") {
 return `${lossText}${played} missed a stronger forcing capture. The position required looking at checks and captures before quiet moves.`
 }

 if (tag === "missed_check" || tag === "missed_forcing_move") {
 return `${lossText}${played} was too quiet. ${best} was more forcing and gave the opponent fewer good replies.`
 }

 if (tag === "endgame_technique") {
 return `${lossText}${played} made the conversion harder. In the endgame, the best move is often the one that improves king activity, keeps pawns safe, or wins a tempo.`
 }

 if (input.phase === "opening") {
 return `${lossText}${played} led to a worse opening position. This should probably become a small opening-memory item in the training plan.`
 }

 if (severity === "blunder") {
 return `${lossText}${played} changed the position too much in the opponent's favor. The important habit is to check the opponent's strongest reply before moving.`
 }

 return `${lossText}${played} was less accurate than ${best}. The position needed a more forcing or more stable move.`
}

function whyBestMoveWorks(facts: BoardFactResult, input: MistakeExplainInput): string {
 const best = facts.bestMoveLabel || "The best move"

 if (input.bestLineSan && input.bestLineSan.length > 0) {
 return `${best} works because of this line: ${input.bestLineSan.join(" ")}.`
 }

 const fact = facts.facts.find((item) => item.includes(best))

 if (fact) {
 return fact
 }

 return `${best} keeps more control of the position and avoids the tactical problem from the played move.`
}

export function buildTemplateExplanation(args: {
 input: MistakeExplainInput
 boardFacts: BoardFactResult
 severity: MistakeSeverity
 evalLossCp: number
}): MistakeExplanation {
 const tag = firstUsefulTag(args.boardFacts.tags)
 const trainerGoal = args.input.trainerGoal?.trim()

 if (trainerGoal) {
 const played = args.boardFacts.userMoveLabel || "your move"
 const best = args.boardFacts.bestMoveLabel || args.input.bestMoveUci || "the target move"
 const lowerGoal = trainerGoal.toLowerCase()
 const isFork = lowerGoal.includes("fork")
 const isQueenVsPawn = lowerGoal.includes("queen vs pawn") || lowerGoal.includes("pawn conversion")
 const isRookWin = !isQueenVsPawn && lowerGoal.includes("rook")

 return {
 title: isFork ? "Missed the fork" : isQueenVsPawn ? "Missed the king approach" : isRookWin ? "Missed the rook-winning move" : "Missed the exercise idea",
 severity: args.severity,
 mistakeType: "missed_forcing_move",
 evalLossCp: args.evalLossCp,
 explanation: isQueenVsPawn ? `${played} does not make progress against the rook-pawn fortress. In queen vs rook-pawn positions, checks are not always the answer. Black wants to hide with the king in the corner and keep the pawn on the 7th rank. White must keep the pawn stopped and bring the king closer.` : `This exercise target is: ${trainerGoal}. ${played} did not solve that target. Look for the forcing move that wins the rook or keeps the tactical win.`,
 whyBestMoveWorks: isQueenVsPawn ? `${best} is the target move because White starts bringing the king closer. The queen already controls the pawn well enough, so the winning plan is to keep the pawn stopped, approach with the king, and then force the black king away or win the pawn.` : `${best} is the target idea for this exercise. It should force the tactical result instead of only making a normal endgame move.`,
 lesson: isFork
 ? "In fork exercises, first look for checks and queen moves that attack the king and rook at the same time."
 : isQueenVsPawn
 ? "When the defender has a rook pawn on the 7th, do not give random queen checks. First ask whether your king needs to come closer. If the queen already stops the pawn, king approach is often the real winning move."
 : "In target exercises, do not just improve the position. Find the move that solves the stated tactical or endgame goal.",
 recommendedTrainer: "Forcing moves and endgame tactics",
 facts: args.boardFacts.facts,
 }
 }

 return {
 title: titleFor(tag, args.severity),
 severity: args.severity,
 mistakeType: tag,
 evalLossCp: args.evalLossCp,
 explanation: explanationFor(
 tag,
 args.severity,
 args.evalLossCp,
 args.boardFacts,
 args.input
 ),
 whyBestMoveWorks: whyBestMoveWorks(args.boardFacts, args.input),
 lesson: lessonFor(tag),
 recommendedTrainer: trainerFor(tag),
 facts: args.boardFacts.facts,
 }
}