import fs from "fs";

const file = "src/KQKP7Trainer.tsx";
let s = fs.readFileSync(file, "utf8");

const helpers = `
  function whiteKingMovesCloserToBlackKing(beforeFen: string, afterFen: string, attemptedUci: string) {
    const parsed = parseUciMove(attemptedUci)
    if (!parsed) return false

    const beforeGame = new Chess(beforeFen)
    const afterGame = new Chess(afterFen)

    const beforeWhiteKing = getPieceSquare(beforeGame, 'k', 'w')
    const beforeBlackKing = getPieceSquare(beforeGame, 'k', 'b')
    const afterWhiteKing = getPieceSquare(afterGame, 'k', 'w')
    const afterBlackKing = getPieceSquare(afterGame, 'k', 'b')

    if (!beforeWhiteKing || !beforeBlackKing || !afterWhiteKing || !afterBlackKing) return false
    if (parsed.from !== beforeWhiteKing) return false

    return kingDistance(afterWhiteKing, afterBlackKing) < kingDistance(beforeWhiteKing, beforeBlackKing)
  }

  function blackKingBlocksOrProtectsPawn(gameToCheck: Chess) {
    const blackPawnSquare = getPieceSquare(gameToCheck, 'p', 'b')
    const blackKingSquare = getPieceSquare(gameToCheck, 'k', 'b')

    if (!blackPawnSquare || !blackKingSquare) return false
    return kingDistance(blackKingSquare, blackPawnSquare) <= 1
  }
`;

if (!s.includes("function whiteKingMovesCloserToBlackKing(")) {
  const insertPoint =
    s.indexOf("  function userMoveCompletesGoal(") !== -1
      ? s.indexOf("  function userMoveCompletesGoal(")
      : s.indexOf("  async function playEngineReplyIfNeeded(");

  if (insertPoint === -1) {
    throw new Error("Could not find helper insertion point.");
  }

  s = s.slice(0, insertPoint) + helpers + "\n" + s.slice(insertPoint);
}

const kingRule = `
    // KQKP7 rule: when the black king blocks/protects the pawn,
    // the correct move can be only bringing the white king closer.
    if (
      whiteKingMovesCloserToBlackKing(beforeFen, afterFen, attemptedUci)
      && blackKingBlocksOrProtectsPawn(new Chess(beforeFen))
      && isClearlyWinningForWhite(afterUser)
    ) {
      return {
        ok: true,
        reason: 'Bring the king closer. The black king blocks the pawn.',
        afterUser,
      }
    }

`;

if (!s.includes("Bring the king closer. The black king blocks the pawn.")) {
  const returnFalsePattern =
    /(\n\s*return\s*\{\s*\n\s*ok:\s*false,\s*\n\s*reason:\s*['"`]This move may let the position become drawn\.)/;

  if (!returnFalsePattern.test(s)) {
    throw new Error("Could not find final false return in validateByEngine.");
  }

  s = s.replace(returnFalsePattern, "\n" + kingRule + "$1");
}

fs.writeFileSync(file, s);
console.log("Fixed KQKP7 king approach rule in:", file);