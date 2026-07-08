import fs from "fs";

const file = "src/pages/endgames/PhilidorTrainer.tsx";
let s = fs.readFileSync(file, "utf8");

// Add state for defensive move count
s = s.replace(
  'const [phase, setPhase] = useState<"classify" | "play">("classify");',
  'const [phase, setPhase] = useState<"classify" | "play">("classify");\n  const [defenseMoves, setDefenseMoves] = useState(0);'
);

// Reset count on loading/restarting position
s = s.replaceAll(
  'setJustMated(false);\n    moveStartedAtRef.current = Date.now();',
  'setJustMated(false);\n    setDefenseMoves(0);\n    moveStartedAtRef.current = Date.now();'
);

// Replace finish rule
s = s.replace(
/function userMoveCompletesGoal\([\s\S]*?\n  async function playEngineReplyIfNeeded/m,
`function userMoveCompletesGoal(
    nextGame: Chess,
    engineResult?: EngineResult | null,
  ) {
    // Philidor: solve after proving the draw, not by playing until mate.
    if (defenseMoves >= 2) return true;

    if (typeof engineResult?.eval === "number") {
      return Math.abs(engineResult.eval) <= 1 && defenseMoves >= 1;
    }

    return false;
  }

  async function playEngineReplyIfNeeded`
);

// After a successful user move, count it
s = s.replace(
  'setGame(nextGame);\n    setLastMove({ from: move.from, to: move.to });',
  'setDefenseMoves((n) => n + 1);\n    setGame(nextGame);\n    setLastMove({ from: move.from, to: move.to });'
);

fs.writeFileSync(file, s);
console.log("DONE: Philidor now stops after successful defensive proof.");
