import fs from "fs";

const file = "src/pages/endgames/PhilidorTrainer.tsx";
let s = fs.readFileSync(file, "utf8");

s = s.replace(
/function userMoveCompletesGoal\([\s\S]*?\n  async function playEngineReplyIfNeeded/m,
`function userMoveCompletesGoal(
    nextGame: Chess,
    engineResult?: EngineResult | null,
  ) {
    // Philidor: if the defender made the engine-best move and eval is drawable,
    // we stop. No need to play until mate/end.
    if (typeof engineResult?.eval === "number" && Math.abs(engineResult.eval) <= 2) {
      return true;
    }

    if (typeof engineResult?.mate === "number") {
      return false;
    }

    return defenseMoves >= 1;
  }

  async function playEngineReplyIfNeeded`
);

fs.writeFileSync(file, s);
console.log("DONE: Philidor finishes after one successful drawing defense.");
