const fs = require("fs");

const path = "src/pages/endgames/FortressTrainer.tsx";
let s = fs.readFileSync(path, "utf8");

// Fortress should not solve because of checkmate/promotion/KPK goal logic.
s = s.replace(
 /function userMoveCompletesGoal\([\s\S]*?\n \}/,
 `function userMoveCompletesGoal(nextGame: Chess) {
 return false;
 }`
);

// Remove the direct promotion/checkmate solve path inside onDrop.
s = s.replace(
 /if \(move\.promotion \|\| moveObj\.promotion \|\| hasWhiteQueenExact\(nextGame\)\) \{[\s\S]*?return true;\s*\}\s*/,
 ``
);

// Make side-to-move check black/white aware.
s = s.replace(
 'if (game.turn() !== "w") return false;',
 'if (game.turn() !== (currentPosition?.sideToMove === "black" ? "b" : "w")) return false;'
);

fs.writeFileSync(path, s);
console.log("DONE: Fortress no longer auto-solves after one move.");
