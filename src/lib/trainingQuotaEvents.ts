export type TrainingQuotaKind =
  | "puzzle"
  | "endgame"
  | "board_vision"
  | "opening"
  | "master_game"

export type TrainingItemCompletedDetail = {
  kind: TrainingQuotaKind
  itemKey: string
  eventId: string
}

export const TRAINING_ITEM_COMPLETED_EVENT =
  "weiss:training-item-completed"

function createEventId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
    /[xy]/g,
    (character) => {
      const random = Math.floor(Math.random() * 16)
      const value = character === "x" ? random : (random & 0x3) | 0x8
      return value.toString(16)
    },
  )
}

export function reportTrainingItemCompleted(
  kind: TrainingQuotaKind,
  itemKey: string,
) {
  if (typeof window === "undefined") return

  const detail: TrainingItemCompletedDetail = {
    kind,
    itemKey: itemKey || `${kind}:unknown`,
    eventId: createEventId(),
  }

  window.dispatchEvent(
    new CustomEvent<TrainingItemCompletedDetail>(
      TRAINING_ITEM_COMPLETED_EVENT,
      { detail },
    ),
  )
}
