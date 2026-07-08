import fs from "fs";

const file = "src/pages/endgames/LucenaTrainer.tsx";
let s = fs.readFileSync(file, "utf8");

s = s.replace(
`function userMoveCompletesGoal(nextGame: Chess) {
    return nextGame.isCheckmate() || whiteHasQueen(nextGame);
  }`,
`function userMoveCompletesGoal(
    nextGame: Chess,
    engineResult?: EngineResult | null,
  ) {
    if (nextGame.isCheckmate()) return true;
    if (whiteHasQueen(nextGame)) return true;

    if (engineResult?.mate !== null && engineResult?.mate !== undefined) {
      return true;
    }

    if (
      typeof engineResult?.eval === "number" &&
      engineResult.eval >= 8
    ) {
      return true;
    }

    return false;
  }`
);

s = s.replaceAll(
`userMoveCompletesGoal(afterUserGame)`,
`userMoveCompletesGoal(afterUserGame, afterUserInfo ?? replyInfo ?? null)`
);

s = s.replaceAll(
`userMoveCompletesGoal(nextGame)`,
`userMoveCompletesGoal(nextGame, afterUser)`
);

fs.writeFileSync(file, s);
console.log("DONE: Lucena now auto-finishes clearly won positions.");
