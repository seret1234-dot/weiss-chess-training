import fs from "fs";

const file = "src/pages/endgames/PhilidorTrainer.tsx";
let s = fs.readFileSync(file, "utf8");

s = s.replace(
/function userMoveCompletesGoal\([\s\S]*?\n  async function playEngineReplyIfNeeded/m,
`function userMoveCompletesGoal(
    nextGame: Chess,
    engineResult?: EngineResult | null,
  ) {
    // Philidor trainer:
    // one correct defensive move is enough.

    return true;
  }

  async function playEngineReplyIfNeeded`
);

s = s.replace(
`setStatus(
      nextGame.isCheckmate()
        ? "CHECKMATE!"
        : "Correct."
    );`,
`setStatus("Draw defended!");`
);

fs.writeFileSync(file, s);
console.log("DONE: Philidor now ends after one correct defensive move.");
