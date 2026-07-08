import fs from "fs";

const file = "src/pages/endgames/LucenaTrainer.tsx";
let s = fs.readFileSync(file, "utf8");

const oldBlock = `function userMoveCompletesGoal(
    nextGame: Chess,
    engineResult?: EngineResult | null,
  ) {
    // Lucena should finish only when the pawn actually promotes, or checkmate.
    // Do not finish just because engine eval is high.
    // Only finish on White's move. If it is Black to move, White just made the bridge/promotion.
    if (nextGame.turn() !== "b") return false;
    return nextGame.isCheckmate() || whiteHasQueen(nextGame) || lucenaBridgeAchieved(nextGame);
  }`;

const newBlock = `function userMoveCompletesGoal(
    nextGame: Chess,
    engineResult?: EngineResult | null,
  ) {
    // Only finish after actual promotion or mate.
    // Bridge positions must continue playing.

    if (nextGame.turn() !== "b") return false;

    return nextGame.isCheckmate() || whiteHasQueen(nextGame);
  }`;

if (!s.includes("lucenaBridgeAchieved")) {
  console.log("Could not find Lucena section.");
  process.exit(1);
}

s = s.replace(oldBlock, newBlock);

fs.writeFileSync(file, s);

console.log("DONE: Lucena only finishes on promotion or mate.");
