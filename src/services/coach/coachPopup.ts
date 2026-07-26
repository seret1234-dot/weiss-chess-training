import type {
  MistakeExplainInput,
  MistakeExplanation,
} from "./types"
import { composeCoachExplanation, type CoachQuota } from "./aiComposer"
import { explainMistake } from "./mistakeExplainer"

export type CoachMistakeNotice = {
  id: number
  createdAt: number
  input: MistakeExplainInput
  explanation: MistakeExplanation
  status: "loading" | "ready" | "fallback"
  source: "ai" | "deterministic"
  reason?: string
  code?: string
  quota?: CoachQuota
  cached?: boolean
}

type CoachMistakeListener = (
  notice: CoachMistakeNotice | null
) => void

const listeners = new Set<CoachMistakeListener>()
let nextNoticeId = 1
let activeNoticeId: number | null = null

function publish(notice: CoachMistakeNotice | null) {
  listeners.forEach((listener) => listener(notice))
}

export function subscribeCoachMistakes(
  listener: CoachMistakeListener
): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function hideCoachMistake() {
  activeNoticeId = null
  publish(null)
}

export function showCoachMistake(
  input: MistakeExplainInput
): CoachMistakeNotice {
  const deterministic = explainMistake(input)
  const notice: CoachMistakeNotice = {
    id: nextNoticeId++,
    createdAt: Date.now(),
    input,
    explanation: deterministic,
    status:
      deterministic.confidence === "low"
        ? "fallback"
        : "loading",
    source: "deterministic",
  }

  activeNoticeId = notice.id
  publish(notice)

  if (deterministic.confidence !== "low") {
    void composeCoachExplanation(input, deterministic).then(
      (result) => {
        if (activeNoticeId !== notice.id) return

        publish({
          ...notice,
          explanation: result.explanation,
          status:
            result.source === "ai" ? "ready" : "fallback",
          source: result.source,
          reason: result.reason,
          code: result.code,
          quota: result.quota,
          cached: result.cached,
        })
      },
    )
  }

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
