import fs from "fs";

const file = "src/pages/endgames/KRKPTrainer.tsx";
let s = fs.readFileSync(file, "utf8");

const insertAfter = `  function whiteMajorPieceAttacksBlackPawn(gameToCheck: Chess) {
    const blackPawnSquare = getPieceSquare(gameToCheck, "p", "b");
    const whiteQueenSquare = getPieceSquare(gameToCheck, "q", "w");
    const whiteRookSquare = getPieceSquare(gameToCheck, "r", "w");
    const whiteKingSquare = getPieceSquare(gameToCheck, "k", "w");
    const blackKingSquare = getPieceSquare(gameToCheck, "k", "b");

    if (!blackPawnSquare) return true;

    const blockers = new Set<string>();
    if (whiteKingSquare) blockers.add(whiteKingSquare);
    if (blackKingSquare) blockers.add(blackKingSquare);

    if (whiteQueenSquare && queenAttacksSquare(whiteQueenSquare, blackPawnSquare, blockers)) {
      return true;
    }

    if (whiteRookSquare && queenAttacksSquare(whiteRookSquare, blackPawnSquare, blockers)) {
      return true;
    }

    return false;
  }
`;

const add = `
  function blackCanCaptureWhiteRook(gameToCheck: Chess) {
    const whiteRookSquare = getPieceSquare(gameToCheck, "r", "w");
    if (!whiteRookSquare) return false;
    if (gameToCheck.turn() !== "b") return false;

    const moves = gameToCheck.moves({ verbose: true }) as Array<{
      from: string;
      to: string;
      captured?: string;
      color: string;
    }>;

    return moves.some(
      (m) => m.color === "b" && m.to === whiteRookSquare && m.captured === "r",
    );
  }

  function moveLeavesRookHanging(gameBeforeMove: Chess, uci: string) {
    const result = applyUciMoveToGame(gameBeforeMove.fen(), uci);
    if (!result) return true;
    if (result.game.isCheckmate()) return false;
    return blackCanCaptureWhiteRook(result.game);
  }
`;

if (!s.includes("function blackCanCaptureWhiteRook")) {
  s = s.replace(insertAfter, insertAfter + add);
}

s = s.replace(
`  function userMoveCompletesGoal(nextGame: Chess) {
    if (!blackPawnStillExists(nextGame)) return true;
    return nextGame.isCheckmate();
  }`,
`  function userMoveCompletesGoal(nextGame: Chess) {
    if (nextGame.isCheckmate()) return true;
    if (blackCanCaptureWhiteRook(nextGame)) return false;
    if (!blackPawnStillExists(nextGame)) return true;
    return false;
  }`
);

s = s.replace(
`    if (!blackPawnStillExists(nextGame)) {
      return { ok: true, reason: "", afterUser: null };
    }

    if (whiteCanCaptureBlackPawn(nextGame)) {
      return { ok: true, reason: "", afterUser: null };
    }

    if (nextGame.isCheckmate()) {
      return { ok: true, reason: "", afterUser: null };
    }`,
`    if (nextGame.isCheckmate()) {
      return { ok: true, reason: "", afterUser: null };
    }

    if (blackCanCaptureWhiteRook(nextGame)) {
      return {
        ok: false,
        reason: "This loses the rook.",
        afterUser: null,
      };
    }

    if (!blackPawnStillExists(nextGame)) {
      return { ok: true, reason: "", afterUser: null };
    }

    if (whiteCanCaptureBlackPawn(nextGame)) {
      return { ok: true, reason: "", afterUser: null };
    }`
);

s = s.replace(
`  if (strictChunk && legalAllowedMoves.length > 0) return legalAllowedMoves[0];
  if (engineBestMove && legalMoves.has(engineBestMove)) return engineBestMove;
  if (legalAllowedMoves.length > 0) return legalAllowedMoves[0];
  return null;`,
`  const safeAllowedMoves = legalAllowedMoves.filter(
    (uci) => !moveLeavesRookHanging(game, uci),
  );

  if (strictChunk && safeAllowedMoves.length > 0) return safeAllowedMoves[0];

  if (
    engineBestMove &&
    legalMoves.has(engineBestMove) &&
    !moveLeavesRookHanging(game, engineBestMove)
  ) {
    return engineBestMove;
  }

  if (safeAllowedMoves.length > 0) return safeAllowedMoves[0];

  return null;`
);

fs.writeFileSync(file, s);
console.log("DONE: KRKP rook hanging fix applied.");
