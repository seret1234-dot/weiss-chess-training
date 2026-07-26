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
  | "lost_queen"
  | "exchange_loss"
  | "hung_piece"
  | "bad_trade"
  | "missed_capture"
  | "missed_check"
  | "missed_forcing_move"
  | "fork"
  | "double_attack"
  | "promotion_threat"
  | "king_safety"
  | "development"
  | "center_control"
  | "piece_activity"
  | "pawn_structure"
  | "passed_pawn"
  | "king_activity"
  | "opening_memory"
  | "endgame_technique"
  | "generic"

export type EvidenceConfidence = "low" | "medium" | "high"

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
  trainerGoal?: string
}

export type MaterialSnapshot = {
  white: number
  black: number
  balanceForWhite: number
  whitePieces: Record<string, number>
  blackPieces: Record<string, number>
}

export type VerifiedLine = {
  suppliedMoves: string[]
  legalMoves: string[]
  complete: boolean
  finalFen?: string
  materialSwingForUser: number
  terminal: "ongoing" | "checkmate" | "draw"
  result?: "1-0" | "0-1" | "1/2-1/2"
}

export type TacticalEvidence = {
  tag: MistakeTag
  confidence: EvidenceConfidence
  summary: string
  proofMoves: string[]
  piece?: string
  square?: string
  targets?: string[]
}

export type PositionalEvidence = {
  tag: MistakeTag
  confidence: EvidenceConfidence
  summary: string
  proofMoves: string[]
  beforeValue?: number
  afterValue?: number
  squares?: string[]
}

export type MistakeEvidence = {
  confidence: EvidenceConfidence
  legalPosition: boolean
  userMoveLegal: boolean
  bestMoveLegal: boolean
  userColor: ChessColor
  materialBefore?: MaterialSnapshot
  materialAfterUserMove?: MaterialSnapshot
  bestLine?: VerifiedLine
  playedLine?: VerifiedLine
  opponentBestReply?: string
  tactical: TacticalEvidence[]
  positional: PositionalEvidence[]
  primaryTag: MistakeTag
}

export type BoardFactResult = {
  tags: MistakeTag[]
  facts: string[]
  userMoveLabel?: string
  bestMoveLabel?: string
  materialAtRisk?: string
  matingMove?: string
  evidence: MistakeEvidence
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
  confidence?: EvidenceConfidence
  evidence?: MistakeEvidence
  source?: "deterministic" | "ai"
}
