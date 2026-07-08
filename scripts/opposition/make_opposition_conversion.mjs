import fs from "fs";
import path from "path";

const file = path.join(
  process.cwd(),
  "src",
  "pages",
  "endgames",
  "OppositionTrainer.tsx"
);

if (!fs.existsSync(file)) {
  throw new Error("Could not find OppositionTrainer.tsx");
}

let s = fs.readFileSync(file, "utf8");

function replaceBlock(startText, endText, replacement) {
  const start = s.indexOf(startText);
  const end = s.indexOf(endText, start);

  if (start === -1 || end === -1) {
    throw new Error(`Could not find block: ${startText}`);
  }

  s = s.slice(0, start) + replacement + s.slice(end);
}

replaceBlock(
  "function chooseHintMove(",
  "\nasync function findFirstIncompleteChunk",
  `function chooseHintMove(
  game: Chess,
  currentPosition: TrainingPosition,
  currentChunkFile: string | null,
  engineInfo: EngineResult | null,
) {
  const legalMoves = new Set(getLegalUciMoves(game));
  const atStart = normalizeFen(game.fen()) === normalizeFen(currentPosition.startFen);

  if (atStart) {
    const legalAllowedMoves = currentPosition.allowedMoves.filter((uci) =>
      legalMoves.has(uci),
    );

    if (legalAllowedMoves.length > 0) return legalAllowedMoves[0];
  }

  if (engineInfo?.bestMove && legalMoves.has(engineInfo.bestMove)) {
    return engineInfo.bestMove;
  }

  const firstLegal = Array.from(legalMoves)[0];
  return firstLegal ?? null;
}
`
);

replaceBlock(
  "  function userMoveCompletesGoal(",
  "\n  function chooseLegalReplyFallback",
  `  function whitePromoted(gameToCheck: Chess) {
    return gameToCheck
      .board()
      .some((rank) =>
        rank.some((piece) => piece?.type === "q" && piece.color === "w"),
      );
  }

  function whitePawnReachedPromotionRank(gameToCheck: Chess) {
    return gameToCheck
      .board()[0]
      .some((piece) => piece?.type === "p" && piece.color === "w");
  }

  function userMoveCompletesGoal(nextGame: Chess) {
    return (
      nextGame.isCheckmate() ||
      whitePromoted(nextGame) ||
      whitePawnReachedPromotionRank(nextGame)
    );
  }
`
);

replaceBlock(
  "  async function validateByEngine(",
  "\nfunction onDrop(",
  `  async function validateByEngine(
    beforeFen: string,
    afterFen: string,
    attemptedUci: string,
    nextGame: Chess,
  ) {
    const atStart =
      currentPosition &&
      normalizeFen(beforeFen) === normalizeFen(currentPosition.startFen);

    if (atStart) {
      const allowedMoves = currentPosition?.allowedMoves ?? [];

      if (!allowedMoves.includes(attemptedUci)) {
        return {
          ok: false,
          reason:
            currentPosition?.explanation ||
            "Start with the opposition move first.",
          afterUser: null,
        };
      }

      const afterInfo = await evaluatePosition(afterFen);

      return {
        ok: true,
        reason: "",
        afterUser: afterInfo,
      };
    }

    const beforeInfo = engineInfo ?? (await evaluatePosition(beforeFen));
    const afterInfo = await evaluatePosition(afterFen);

    if (nextGame.isCheckmate() || whitePromoted(nextGame) || whitePawnReachedPromotionRank(nextGame)) {
      return {
        ok: true,
        reason: "",
        afterUser: afterInfo,
      };
    }

    const beforeScore = scoreForWhite(beforeInfo);
    const afterScore = scoreForWhite(afterInfo);

    if (afterScore === null) {
      return {
        ok: true,
        reason: "",
        afterUser: afterInfo,
      };
    }

    if (beforeScore === null) {
      return {
        ok: afterScore >= -0.5,
        reason: "Wrong: this move appears to lose the practical result.",
        afterUser: afterInfo,
      };
    }

    const allowedDrop = beforeScore >= 3 ? 2.0 : 1.0;

    if (afterScore >= beforeScore - allowedDrop || afterScore >= 2.0) {
      return {
        ok: true,
        reason: "",
        afterUser: afterInfo,
      };
    }

    return {
      ok: false,
      reason:
        "Wrong: this move lets the opposition/conversion slip. Keep the king active, support the pawn, and avoid giving the defender opposition.",
      afterUser: afterInfo,
    };
  }
`
);

fs.writeFileSync(file, s);

console.log("Opposition is now conversion mode: allowed first move, then play to promotion.");