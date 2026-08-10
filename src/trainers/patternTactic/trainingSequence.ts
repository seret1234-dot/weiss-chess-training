export type TacticTrainingSequenceInput = {
 sourceSolutionLine: string[]
 userMoveIndexes: number[]
 stage?: string
}

export type InteractiveTrainingSequence = {
 requiredLearnerMoves: number
 moves: string[]
 userMoveIndexes: number[]
}

function requiredMovesForStage(stage: string | undefined, fallback: number) {
 if (stage === 'M1') return 1
 if (stage === 'M2') return 2
 if (stage === 'M3') return 3
 if (stage === 'M4') return 4
 return fallback
}

/**
 * Separates retained source/validation continuation from the learner-facing
 * training sequence. Verified stage metadata is authoritative: M1â€“M4 end on
 * their respective final learner move, without exposing source continuation.
 */
export function createInteractiveTrainingSequence({
 sourceSolutionLine,
 userMoveIndexes,
 stage,
}: TacticTrainingSequenceInput): InteractiveTrainingSequence {
 const requiredLearnerMoves = requiredMovesForStage(stage, userMoveIndexes.length || 1)
 const interactiveUserMoveIndexes = userMoveIndexes.slice(0, requiredLearnerMoves)
 const finalLearnerMoveIndex = interactiveUserMoveIndexes.at(-1)

 if (
  finalLearnerMoveIndex == null ||
  finalLearnerMoveIndex < 0 ||
  finalLearnerMoveIndex >= sourceSolutionLine.length
 ) {
  throw new Error(`Invalid interactive tactic sequence for ${stage ?? 'legacy tactic'}`)
 }

 return {
  requiredLearnerMoves,
  moves: sourceSolutionLine.slice(0, finalLearnerMoveIndex + 1),
  userMoveIndexes: interactiveUserMoveIndexes,
 }
}

export function getOpponentMovesBeforeNextRequiredLearnerMove(
 sequence: InteractiveTrainingSequence,
 completedLearnerMoves: number,
) {
 if (completedLearnerMoves >= sequence.requiredLearnerMoves) return []

 const previousLearnerMoveIndex = sequence.userMoveIndexes[completedLearnerMoves - 1]
 const nextLearnerMoveIndex = sequence.userMoveIndexes[completedLearnerMoves]
 const start = previousLearnerMoveIndex == null ? 0 : previousLearnerMoveIndex + 1

 return sequence.moves.slice(start, nextLearnerMoveIndex)
}
