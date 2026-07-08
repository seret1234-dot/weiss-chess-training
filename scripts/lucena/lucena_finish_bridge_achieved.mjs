import fs from "fs";

const file = "src/pages/endgames/LucenaTrainer.tsx";
let s = fs.readFileSync(file, "utf8");

const helper = `
  function lucenaBridgeAchieved(gameToCheck: Chess) {
    const wk = getPieceSquare(gameToCheck, "k", "w");
    const wr = getPieceSquare(gameToCheck, "r", "w");
    const wp = getPieceSquare(gameToCheck, "p", "w");
    const bk = getPieceSquare(gameToCheck, "k", "b");

    if (!wk || !wr || !wp || !bk) return false;

    const wpFile = wp[0];
    const wpRank = Number(wp[1]);
    const wkRank = Number(wk[1]);

    // Pawn is advanced and king is in front/supporting promotion.
    if (wpRank < 6) return false;
    if (wk[0] !== wpFile) return false;
    if (wkRank <= wpRank) return false;

    // Rook has moved away from pawn file and is giving bridge/cutoff support.
    if (wr[0] === wpFile) return false;

    // Black king is cut off far enough from the pawn.
    if (kingDistance(bk, wp) <= 2) return false;

    return true;
  }
`;

if (!s.includes("function lucenaBridgeAchieved")) {
  s = s.replace("  function userMoveCompletesGoal", helper + "\n  function userMoveCompletesGoal");
}

s = s.replace(
`    return nextGame.isCheckmate() || whiteHasQueen(nextGame);`,
`    return nextGame.isCheckmate() || whiteHasQueen(nextGame) || lucenaBridgeAchieved(nextGame);`
);

fs.writeFileSync(file, s);
console.log("DONE: Lucena now finishes when bridge is achieved.");
