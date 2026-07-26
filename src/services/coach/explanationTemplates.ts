import type {
  BoardFactResult,
  EvidenceConfidence,
  MistakeExplainInput,
  MistakeExplanation,
  MistakeSeverity,
  MistakeTag,
  PositionalEvidence,
  TacticalEvidence,
} from "./types"
import { cpToPawns } from "./scoring"

type AnyEvidence = TacticalEvidence | PositionalEvidence

function firstUsefulTag(boardFacts: BoardFactResult): MistakeTag {
  return boardFacts.evidence.primaryTag || "generic"
}

function titleFor(
  tag: MistakeTag,
  severity: MistakeSeverity
): string {
  if (tag === "missed_mate") return "Missed checkmate"
  if (tag === "allowed_mate") return "You allowed checkmate"
  if (tag === "lost_queen") return "The queen is lost"
  if (tag === "exchange_loss") return "You lost the exchange"
  if (tag === "hung_piece") return "A piece was left loose"
  if (tag === "bad_trade") return "This trade loses material"
  if (tag === "missed_capture") return "You missed a strong capture"
  if (tag === "missed_check") return "You missed a forcing check"
  if (tag === "fork") return "You missed a fork"
  if (tag === "double_attack") return "You missed a double attack"
  if (tag === "promotion_threat") return "You allowed promotion"
  if (tag === "king_safety") return "Your king became vulnerable"
  if (tag === "development") return "Development was neglected"
  if (tag === "center_control") return "You gave up the center"
  if (tag === "piece_activity") return "Your pieces lost activity"
  if (tag === "pawn_structure") return "The pawn structure was weakened"
  if (tag === "passed_pawn") return "You allowed a passed pawn"
  if (tag === "king_activity") return "The king became passive"
  if (tag === "endgame_technique") return "Endgame technique mistake"
  if (tag === "opening_memory") return "Opening plan problem"
  if (severity === "blunder") return "This was a serious blunder"
  if (severity === "mistake") return "This was a mistake"
  if (severity === "inaccuracy") return "This was an inaccuracy"
  return "Move explanation"
}

function trainerFor(tag: MistakeTag): string | undefined {
  if (tag === "missed_mate") return "Mate patterns"
  if (tag === "allowed_mate") return "Defensive mate patterns"
  if (tag === "lost_queen") return "Loose pieces and board vision"
  if (tag === "exchange_loss") return "Tactical exchanges"
  if (tag === "hung_piece") return "Board vision and loose pieces"
  if (tag === "bad_trade") return "Captures and exchanges"
  if (tag === "missed_capture") return "Checks, captures, and threats"
  if (tag === "missed_check") return "Forcing moves"
  if (tag === "fork" || tag === "double_attack") {
    return "Forks and double attacks"
  }
  if (tag === "promotion_threat" || tag === "passed_pawn") {
    return "Passed-pawn and promotion tactics"
  }
  if (tag === "king_safety") return "King safety"
  if (tag === "development") return "Opening development"
  if (tag === "center_control") return "Central control"
  if (tag === "piece_activity") return "Piece activity"
  if (tag === "pawn_structure") return "Pawn structures"
  if (tag === "king_activity") return "Endgame king activity"
  if (tag === "endgame_technique") return "Endgame trainer"
  if (tag === "opening_memory") return "Opening trainer"
  return undefined
}

function lessonFor(tag: MistakeTag): string {
  if (tag === "missed_mate") {
    return "Before playing a normal move, scan every legal check. A forced mate has priority over all positional plans."
  }
  if (tag === "allowed_mate") {
    return "Before moving, list the opponent's checks in the resulting position."
  }
  if (tag === "lost_queen") {
    return "After choosing a move, make one final scan of every enemy capture and attack on your queen."
  }
  if (tag === "exchange_loss") {
    return "Compare the values of the attacking and captured pieces before allowing an exchange."
  }
  if (tag === "hung_piece") {
    return "After imagining your move, inspect every opponent capture. Loose pieces must be defended, moved, or tactically protected."
  }
  if (tag === "bad_trade") {
    return "Do not stop after seeing your capture. Calculate the recapture and compare the full material exchange."
  }
  if (tag === "missed_capture") {
    return "Use the forcing-move scan: checks, captures, threats. Calculate forcing captures before quiet moves."
  }
  if (tag === "missed_check") {
    return "Checks deserve priority because they restrict the opponent's replies and often reveal tactics."
  }
  if (tag === "fork" || tag === "double_attack") {
    return "Look for one move that attacks two targets, especially a check that also attacks a loose major piece."
  }
  if (tag === "promotion_threat" || tag === "passed_pawn") {
    return "Treat advanced passed pawns as forcing threats and count their remaining moves to promotion."
  }
  if (tag === "king_safety") {
    return "Before weakening the king, list the opponent's checks, captures, and mating threats in the new position."
  }
  if (tag === "development") {
    return "Develop minor pieces, fight for the center, and avoid repeated queen moves unless there is a concrete reason."
  }
  if (tag === "center_control") {
    return "Before abandoning the center, compare how many central squares each side controls after the move."
  }
  if (tag === "piece_activity") {
    return "Prefer moves that improve the least active piece and increase coordination."
  }
  if (tag === "pawn_structure") {
    return "A pawn move cannot be taken back. Check whether it creates isolated, doubled, or permanently weak pawns."
  }
  if (tag === "king_activity") {
    return "In simplified positions, activate the king toward the center and the critical pawn breaks."
  }
  if (tag === "endgame_technique") {
    return "In endgames, calculate king activity, passed pawns, tempi, and the simplest conversion before moving."
  }
  if (tag === "opening_memory") {
    return "Learn the reason behind the opening move, not only the move itself."
  }
  return "Compare your candidate move with the opponent's strongest reply before committing."
}

function findEvidence(
  facts: BoardFactResult,
  tag: MistakeTag
): AnyEvidence | undefined {
  return (
    facts.evidence.tactical.find((item) => item.tag === tag) ||
    facts.evidence.positional.find((item) => item.tag === tag) ||
    facts.evidence.tactical[0] ||
    facts.evidence.positional[0]
  )
}

function lossText(
  input: MistakeExplainInput,
  evalLossCp: number,
  tag?: MistakeTag
): string {
  if (
    tag === "missed_mate" ||
    tag === "allowed_mate" ||
    evalLossCp <= 0
  ) {
    return ""
  }

  if (input.source === "analyze") {
    if (evalLossCp >= 700) return "The move caused a decisive evaluation drop. "
    if (evalLossCp >= 250) return "The move caused a major evaluation drop. "
    if (evalLossCp >= 100) return "The move caused a clear evaluation drop. "
    return "The move reduced your winning chances. "
  }

  return `The evaluation fell by about ${cpToPawns(evalLossCp)} pawns. `
}

function explanationFor(args: {
  tag: MistakeTag
  severity: MistakeSeverity
  evalLossCp: number
  facts: BoardFactResult
  input: MistakeExplainInput
}): string {
  const played = args.facts.userMoveLabel || "Your move"
  const best = args.facts.bestMoveLabel || "the engine move"
  const evidence = findEvidence(args.facts, args.tag)
  const prefix = lossText(args.input, args.evalLossCp, args.tag)

  if (evidence?.summary) {
    if (args.tag === "missed_mate") {
      const mateMove = evidence.proofMoves[0] || args.facts.matingMove
      return mateMove
        ? `${played} missed immediate checkmate with ${mateMove}.`
        : `${played} missed an immediate checkmate.`
    }

    if (args.tag === "allowed_mate") {
      return `${played} allowed a forced checkmate. ${evidence.summary}`
    }

    return `${prefix}${evidence.summary}`
  }

  if (args.tag === "endgame_technique") {
    return (
      `${prefix}${played} made the endgame harder. ` +
      `${best} better preserves activity, tempi, or control of the passed pawns.`
    )
  }

  if (args.input.phase === "opening") {
    return (
      `${prefix}${played} led to a worse opening position. ` +
      `The useful lesson is the plan behind ${best}, not only its notation.`
    )
  }

  if (args.severity === "blunder") {
    return (
      `${prefix}${played} allowed a concrete tactical reply. ` +
      `Calculate the opponent's most forcing response before committing.`
    )
  }

  return (
    `${prefix}${played} was less accurate than ${best}. ` +
    `The verified engine line requires a more forcing or more stable move.`
  )
}

function lineText(moves: string[]): string {
  return moves.slice(0, 8).join(" ")
}

function whyBestMoveWorks(
  facts: BoardFactResult,
  input: MistakeExplainInput
): string {
  const best = facts.bestMoveLabel || "The best move"
  const primary = facts.evidence.primaryTag
  const evidence = findEvidence(facts, primary)
  const verifiedLine = facts.evidence.bestLine?.legalMoves || []

  if (primary === "missed_mate") {
    const mateMove =
      evidence?.proofMoves[0] || facts.matingMove || best
    return `${mateMove} is legal checkmate, so the opponent has no reply.`
  }

  if (primary === "allowed_mate") {
    const consequence =
      facts.evidence.playedLine?.legalMoves ||
      evidence?.proofMoves ||
      []

    return consequence.length >= 2
      ? `The verified consequence is ${lineText(consequence)}, ending in checkmate.`
      : "The played move allows a forced checkmate."
  }

  if (verifiedLine.length >= 2) {
    return `The verified engine continuation is ${lineText(verifiedLine)}.`
  }

  if (evidence?.proofMoves && evidence.proofMoves.length >= 2) {
    return `The verified tactical sequence is ${lineText(evidence.proofMoves)}.`
  }

  if (verifiedLine.length === 1) {
    const evidenceStartsWithBest =
      evidence?.proofMoves?.[0] === verifiedLine[0]

    if (evidenceStartsWithBest && evidence?.summary) {
      return `${best} is the verified engine choice. ${evidence.summary}`
    }

    return `${best} is the verified engine choice and avoids the concrete problem created by the played move.`
  }

  if (input.bestLineSan && input.bestLineSan.length > 0) {
    return `${best} was recommended, but the supplied continuation could not be fully validated from this position.`
  }

  if (evidence?.summary) {
    return `${best} addresses the position more accurately. ${evidence.summary}`
  }

  return `${best} avoids the concrete problem created by the played move and keeps better control of the position.`
}

function confidenceLabel(
  confidence: EvidenceConfidence
): string {
  if (confidence === "high") return "high-confidence"
  if (confidence === "medium") return "medium-confidence"
  return "low-confidence"
}

function withEvidence(
  args: {
    input: MistakeExplainInput
    boardFacts: BoardFactResult
    severity: MistakeSeverity
    evalLossCp: number
  },
  explanation: Omit<
    MistakeExplanation,
    "facts" | "confidence" | "evidence" | "source"
  >
): MistakeExplanation {
  return {
    ...explanation,
    facts: [
      ...args.boardFacts.facts,
      `Evidence confidence: ${confidenceLabel(
        args.boardFacts.evidence.confidence
      )}.`,
    ],
    confidence: args.boardFacts.evidence.confidence,
    evidence: args.boardFacts.evidence,
    source: "deterministic",
  }
}

export function buildTemplateExplanation(args: {
  input: MistakeExplainInput
  boardFacts: BoardFactResult
  severity: MistakeSeverity
  evalLossCp: number
}): MistakeExplanation {
  const trainerContext = [
    args.input.trainerId,
    args.input.theme,
    args.input.goal,
    args.input.trainerGoal,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()

  const isDoubleCheckTrainer =
    args.input.source === "trainer" &&
    (trainerContext.includes("double-check") ||
      trainerContext.includes("double check"))

  if (isDoubleCheckTrainer) {
    const played =
      args.boardFacts.userMoveLabel ||
      args.input.userMoveSan ||
      args.input.userMoveUci ||
      "Your move"
    const best =
      args.boardFacts.bestMoveLabel ||
      args.input.bestMoveSan ||
      args.input.bestMoveUci ||
      "The correct move"
    const verifiedLine =
      args.boardFacts.evidence.bestLine?.legalMoves || []
    const continuation =
      verifiedLine.length > 1
        ? ` The verified continuation begins ${verifiedLine
            .slice(0, 6)
            .join(" ")}.`
        : ""

    return {
      title: "You missed the double check",
      severity: args.severity,
      mistakeType: "missed_forcing_move",
      evalLossCp: args.evalLossCp,
      explanation:
        `${played} does not solve the required double-check pattern. ` +
        "A double check means that two pieces attack the king at the same time.",
      whyBestMoveWorks:
        `${best} is the verified move. It checks with the moving piece ` +
        `while uncovering a second check from another piece.${continuation}`,
      lesson:
        "Look for a discovered check where the piece that moves also gives check. " +
        "In a double check, the king normally has to move.",
      recommendedTrainer: "Double Check",
      facts: [
        ...args.boardFacts.facts,
        "Trainer pattern: double check.",
        `Evidence confidence: ${confidenceLabel(
          args.boardFacts.evidence.confidence
        )}.`,
      ],
      confidence: args.boardFacts.evidence.confidence,
      evidence: args.boardFacts.evidence,
    }
  }

  const tag = firstUsefulTag(args.boardFacts)
  const trainerGoal = (
    args.input.trainerGoal ||
    args.input.goal ||
    ""
  ).trim()

  if (trainerGoal) {
    const played = args.boardFacts.userMoveLabel || "your move"
    const lowerGoal = trainerGoal.toLowerCase()
    const isFork = lowerGoal.includes("fork")
    const isQueenVsPawn =
      lowerGoal.includes("queen vs pawn") ||
      lowerGoal.includes("pawn conversion")
    const isRookWin =
      !isQueenVsPawn && lowerGoal.includes("rook")

    return withEvidence(args, {
      title: isFork
        ? "Missed the fork"
        : isQueenVsPawn
        ? "Missed the king approach"
        : isRookWin
        ? "Missed the rook-winning move"
        : "Missed the exercise idea",
      severity: args.severity,
      mistakeType: isFork ? "fork" : "missed_forcing_move",
      evalLossCp: args.evalLossCp,
      explanation: isQueenVsPawn
        ? `${played} does not make progress against the rook-pawn fortress. The queen already controls the pawn, so the king must approach.`
        : `The exercise target is: ${trainerGoal}. ${played} did not solve that concrete target.`,
      whyBestMoveWorks: whyBestMoveWorks(
        args.boardFacts,
        args.input
      ),
      lesson: isFork
        ? "Before moving, ask whether one queen move can check the king and attack the rook at the same time."
        : isQueenVsPawn
        ? "When the queen already stops the pawn, improve the king instead of giving random checks."
        : "In target exercises, find the move that solves the stated tactical or endgame goal.",
      recommendedTrainer: isFork
        ? "Forks and double attacks"
        : "Forcing moves and endgame tactics",
    })
  }

  return withEvidence(args, {
    title: titleFor(tag, args.severity),
    severity: args.severity,
    mistakeType: tag,
    evalLossCp: args.evalLossCp,
    explanation: explanationFor({
      tag,
      severity: args.severity,
      evalLossCp: args.evalLossCp,
      facts: args.boardFacts,
      input: args.input,
    }),
    whyBestMoveWorks: whyBestMoveWorks(
      args.boardFacts,
      args.input
    ),
    lesson: lessonFor(tag),
    recommendedTrainer: trainerFor(tag),
  })
}
