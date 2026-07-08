import fs from "fs";

const file = "src/pages/endgames/LucenaTrainer.tsx";
let s = fs.readFileSync(file, "utf8");

s = s.replace(
/function userMoveCompletesGoal\([\s\S]*?\n  async function playEngineReplyIfNeeded/m,
`function userMoveCompletesGoal(
    nextGame: Chess,
    engineResult?: EngineResult | null,
  ) {
    // Lucena should finish only when the pawn actually promotes, or checkmate.
    // Do not finish just because engine eval is high.
    return nextGame.isCheckmate() || whiteHasQueen(nextGame);
  }

  async function playEngineReplyIfNeeded`
);

s = s.replace(
`      setStatus(getInstructionText(currentPosition, currentThemeConfig));
      setMessage("Accepted move. No black reply available.");`,
`      setStatus("Engine reply unavailable");
      setMessage("No valid engine defense found. Position unlocked — not solved.");`
);

fs.writeFileSync(file, s);
console.log("DONE: Lucena no longer auto-solves on high eval. Promotion/mate only.");
