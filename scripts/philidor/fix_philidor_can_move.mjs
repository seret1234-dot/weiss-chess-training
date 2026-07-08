import fs from "fs";

const file = "src/pages/endgames/PhilidorTrainer.tsx";
let s = fs.readFileSync(file, "utf8");

// remove any old White-only blocker
s = s.replaceAll('if (game.turn() !== "w") return false;', '');
s = s.replaceAll('if (game.turn() !== "b" && game.turn() !== "w") return false;', '');

// Philidor should always start in play mode, not classify lock
s = s.replace(
`const [phase, setPhase] = useState<"classify" | "play">("classify");`,
`const [phase, setPhase] = useState<"classify" | "play">("play");`
);

// make sure draw positions are not treated as quiz/classification
s = s.replace(
/function shouldAskWinDraw\([\s\S]*?\n  function startPositionState/m,
`function shouldAskWinDraw(position: TrainingPosition | null = currentPosition) {
    return false;
  }

  function startPositionState`
);

fs.writeFileSync(file, s);
console.log("DONE: Philidor now allows the side-to-move to play.");
