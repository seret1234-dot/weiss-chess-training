const fs = require("fs");

const p = "src/pages/endgames/ShoulderingTrainer.tsx";
let s = fs.readFileSync(p, "utf8");

const backup = p + ".bak_has_white_queen_exact";
fs.writeFileSync(backup, s);

if (!s.includes("function hasWhiteQueenExact(")) {
 s = s.replace(
 /function userMoveCompletesGoal\(/,
 `function hasWhiteQueenExact(gameToCheck: Chess) {
 return !!getPieceSquare(gameToCheck, "q", "w");
}

function userMoveCompletesGoal(`
 );
}

fs.writeFileSync(p, s);
console.log("DONE added hasWhiteQueenExact");
console.log("Backup:", backup);
