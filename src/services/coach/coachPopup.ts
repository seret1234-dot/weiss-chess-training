import type { MistakeExplainInput, MistakeExplanation } from "./types"
import { explainMistake } from "./mistakeExplainer"

export type CoachMistakeNotice = {
 id: number
 createdAt: number
 input: MistakeExplainInput
 explanation: MistakeExplanation
}

type CoachMistakeListener = (notice: CoachMistakeNotice | null) => void

const listeners = new Set<CoachMistakeListener>()
let nextNoticeId = 1

export function subscribeCoachMistakes(listener: CoachMistakeListener): () => void {
 listeners.add(listener)
 return () => {
 listeners.delete(listener)
 }
}

export function hideCoachMistake() {
 listeners.forEach((listener) => listener(null))
}

export function showCoachMistake(input: MistakeExplainInput): CoachMistakeNotice {
 const notice: CoachMistakeNotice = {
 id: nextNoticeId++,
 createdAt: Date.now(),
 input,
 explanation: explainMistake(input),
 }

 listeners.forEach((listener) => listener(notice))
 return notice
}

export function showSimpleCoachMistake(args: {
 fenBefore: string
 userMoveSan?: string
 userMoveUci?: string
 bestMoveSan?: string
 bestMoveUci?: string
 evalLossCp?: number
 phase?: MistakeExplainInput["phase"]
 source?: MistakeExplainInput["source"]
}): CoachMistakeNotice {
 return showCoachMistake({
 fenBefore: args.fenBefore,
 userMoveSan: args.userMoveSan,
 userMoveUci: args.userMoveUci,
 bestMoveSan: args.bestMoveSan,
 bestMoveUci: args.bestMoveUci,
 evalLossCp: args.evalLossCp ?? 150,
 phase: args.phase,
 source: args.source,
 })
}