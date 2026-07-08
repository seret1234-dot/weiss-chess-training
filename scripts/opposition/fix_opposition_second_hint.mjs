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

const start = s.indexOf("  async function validateByEngine(");
const end = s.indexOf("\nfunction onDrop(", start);

if (start === -1 || end === -1) {
  throw new Error("Could not find validateByEngine block.");
}

const replacement = `  async function validateByEngine(
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

    const freshBeforeInfo = await evaluatePosition(beforeFen);
    const afterInfo = await evaluatePosition(afterFen);

    // After the first opposition move, engine best move is accepted.
    // This keeps second/third hints consistent with validation.
    if (freshBeforeInfo?.bestMove && attemptedUci === freshBeforeInfo.bestMove) {
      return {
        ok: true,
        reason: "",
        afterUser: afterInfo,
      };
    }

    if (
      nextGame.isCheckmate() ||
      whitePromoted(nextGame) ||
      whitePawnReachedPromotionRank(nextGame)
    ) {
      return {
        ok: true,
        reason: "",
        afterUser: afterInfo,
      };
    }

    const beforeScore = scoreForWhite(freshBeforeInfo);
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
`;

s = s.slice(0, start) + replacement + s.slice(end);

fs.writeFileSync(file, s);

console.log("Fixed Opposition second-move hint validation.");