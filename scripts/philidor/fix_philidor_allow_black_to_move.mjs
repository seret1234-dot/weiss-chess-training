import fs from "fs";

const file = "src/pages/endgames/PhilidorTrainer.tsx";
let s = fs.readFileSync(file, "utf8");

s = s.replace(
  'if (game.turn() !== "w") return false;',
  '// Philidor is defensive training, often Black to move.\n    // Allow the side to move from the FEN.\n    if (game.turn() !== "b" && game.turn() !== "w") return false;'
);

s = s.replaceAll(
  "Promote the pawn. Build the bridge against checks.",
  "Defend the position. Hold the draw with accurate rook defense."
);

s = s.replaceAll(
  "Try again. The goal is to promote the pawn.",
  "Try again. The goal is to hold the draw."
);

fs.writeFileSync(file, s);
console.log("DONE: Philidor now allows Black-to-move positions.");
