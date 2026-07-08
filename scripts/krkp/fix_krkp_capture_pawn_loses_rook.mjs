import fs from "fs";

const file = "src/pages/endgames/KRKPTrainer.tsx";
let s = fs.readFileSync(file, "utf8");

const helpers = `
function krkpGetPieceSquare(gameToCheck: Chess, type: "k" | "q" | "r" | "p", color: "w" | "b") {
  const board = gameToCheck.board();

  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      const piece = board[rank][file];
      if (piece?.type === type && piece.color === color) {
        return \`\${"abcdefgh"[file]}\${8 - rank}\`;
      }
    }
  }

  return null;
}

function krkpBlackCanCaptureWhiteRookNow(gameToCheck: Chess) {
  const whiteRookSquare = krkpGetPieceSquare(gameToCheck, "r", "w");
  if (!whiteRookSquare) return false;
  if (gameToCheck.turn() !== "b") return false;

  const moves = gameToCheck.moves({ verbose: true }) as Array<{
    to: string;
    color: string;
  }>;

  return moves.some((m) => m.color === "b" && m.to === whiteRookSquare);
}

function krkpMoveLeavesRookHanging(gameBeforeMove: Chess, uci: string) {
  const parsed = parseUciMove(uci);
  if (!parsed) return true;

  const next = new Chess(gameBeforeMove.fen());
  const moveObj = next.move({
    from: parsed.from,
    to: parsed.to,
    promotion: parsed.promotion,
  });

  if (!moveObj) return true;
  if (next.isCheckmate()) return false;

  return krkpBlackCanCaptureWhiteRookNow(next);
}
`;

if (!s.includes("function krkpBlackCanCaptureWhiteRookNow")) {
  s = s.replace("function chooseHintMove(", helpers + "\nfunction chooseHintMove(");
}

s = s.replace(
/function userMoveCompletesGoal\(nextGame: Chess\) \{[\s\S]*?^\s*\}/m,
`function userMoveCompletesGoal(nextGame: Chess) {
    if (nextGame.isCheckmate()) return true;

    // Never mark solved if Black can capture the rook next.
    if (krkpBlackCanCaptureWhiteRookNow(nextGame)) return false;

    if (!blackPawnStillExists(nextGame)) return true;
    return false;
  }`
);

s = s.replace(
/\s*if \(whiteCanCaptureBlackPawn\(nextGame\)\) \{\s*return \{ ok: true, reason: "", afterUser: null \};\s*\}/,
`
    if (whiteCanCaptureBlackPawn(nextGame)) {
      if (krkpBlackCanCaptureWhiteRookNow(nextGame)) {
        return {
          ok: false,
          reason: "This wins the pawn but loses the rook next move.",
          afterUser: null,
        };
      }

      return { ok: true, reason: "", afterUser: null };
    }`
);

s = s.replace(
/\s*if \(!blackPawnStillExists\(nextGame\)\) \{\s*return \{ ok: true, reason: "", afterUser: null \};\s*\}/,
`
    if (!blackPawnStillExists(nextGame)) {
      if (krkpBlackCanCaptureWhiteRookNow(nextGame)) {
        return {
          ok: false,
          reason: "This captures the pawn but loses the rook next move.",
          afterUser: null,
        };
      }

      return { ok: true, reason: "", afterUser: null };
    }`
);

s = s.replace(
`  if (strictChunk && legalAllowedMoves.length > 0) return legalAllowedMoves[0];
  if (engineBestMove && legalMoves.has(engineBestMove)) return engineBestMove;
  if (legalAllowedMoves.length > 0) return legalAllowedMoves[0];
  return null;`,
`  const safeAllowedMoves = legalAllowedMoves.filter(
    (uci) => !krkpMoveLeavesRookHanging(game, uci),
  );

  if (strictChunk && safeAllowedMoves.length > 0) return safeAllowedMoves[0];

  if (
    engineBestMove &&
    legalMoves.has(engineBestMove) &&
    !krkpMoveLeavesRookHanging(game, engineBestMove)
  ) {
    return engineBestMove;
  }

  if (safeAllowedMoves.length > 0) return safeAllowedMoves[0];

  return null;`
);

fs.writeFileSync(file, s);
console.log("DONE: KRKP pawn capture no longer counts if Black can take the rook.");
