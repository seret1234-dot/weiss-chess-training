export type PlayerColor = 'white' | 'black'
export type ColorChoice = PlayerColor | 'random'

export type EngineStrengthPreset =
  | 'beginner'
  | 'intermediate'
  | 'strong'
  | 'max'

export type EvalInfo = {
  scoreCp?: number
  mate?: number
  depth?: number
  bestMove?: string
}

export type PlayedMove = {
  from: string
  to: string
  san: string
  fen: string
  ply: number
  by: 'user' | 'engine'
  evaluation?: EvalInfo
  moveTimeMs?: number
}

export type GameSummary = {
  result: '1-0' | '0-1' | '1/2-1/2' | '*'
  termination:
    | 'checkmate'
    | 'stalemate'
    | 'threefold'
    | 'insufficient-material'
    | 'fifty-move'
    | 'resignation'
    | 'timeout'
    | 'unknown'
  finalFen: string
  totalMoves: number
}

export type PlayRouteState = {
  fen?: string
  suggestedColor?: PlayerColor
  source?: string
}

export type PlaySetup = {
  initialFen: string
  userColor: PlayerColor
  strength: EngineStrengthPreset
  evaluationEnabled: boolean
}