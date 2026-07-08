const fs = require("fs");

const path = "src/pages/endgames/FortressTrainer.tsx";
let s = fs.readFileSync(path, "utf8");

const needle = ` if (!moveObj) return false;

 const move = {`;

const patch = ` if (!moveObj) return false;

 if (!blackPawnStillExists(nextGame)) {
 showWrongAndReset(
 nextGame,
 { from: moveObj.from, to: moveObj.to, promotion: moveObj.promotion },
 "Wrong - fortress broken",
 "You lost the pawn. Keep the pawn protected to hold the fortress."
 );
 return true;
 }

 const move = {`;

if (!s.includes(needle)) {
 console.log("Could not find insert point.");
 process.exit(1);
}

s = s.replace(needle, patch);

fs.writeFileSync(path, s);
console.log("DONE: Pawn loss after user move now fails immediately.");
