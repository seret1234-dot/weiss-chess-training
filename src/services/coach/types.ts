export type CoachSource =
 | "analyze"
 | "play-computer"
 | "trainer"
 | "opening"
 | "endgame"
 | "onboarding"

export type GamePhase = "opening" | "middlegame" | "endgame"

export type ChessColor = "white" | "black"

export type MistakeSeverity =
 | "none"
 | "inaccuracy"
 | "mistake"
 | "blunder"

export type MistakeTag =
 | "missed_mate"
 | "allowed_mate"
 | "hung_piece"
 | "missed_capture"
 | "missed_check"
 | "missed_forcing_move"
 | "king_safety"
 | "opening_memory"
 | "endgame_technique"
 | "generic"

export type MistakeExplainInput = {
 fenBefore: string

 userMoveSan?: string
 userMoveUci?: string

 bestMoveSan?: string
 bestMoveUci?: string

 evalBeforeCp?: number
 evalAfterCp?: number
 evalLossCp?: number

 bestLineSan?: string[]
 playedLineSan?: string[]

 phase?: GamePhase
 source?: CoachSource
 userColor?: ChessColor
 userRating?: number
 openingName?: string

  trainerId?: string
  theme?: string
  goal?: string
}

export type BoardFactResult = {
 tags: MistakeTag[]
 facts: string[]
 userMoveLabel?: string
 bestMoveLabel?: string
 materialAtRisk?: string
 matingMove?: string
}

export type MistakeExplanation = {
 title: string
 severity: MistakeSeverity
 mistakeType: MistakeTag
 evalLossCp: number
 explanation: string
 whyBestMoveWorks: string
 lesson: string
 recommendedTrainer?: string
 facts: string[]
}