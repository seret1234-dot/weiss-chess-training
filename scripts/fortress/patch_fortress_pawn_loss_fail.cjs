const fs = require("fs");

const path = "src/pages/endgames/FortressTrainer.tsx";
let s = fs.readFileSync(path, "utf8");

const needle = `if (!moveObj) return false;

 const userMoveUci = moveToUci({
 from: moveObj.from,
 to: moveObj.to,
 promotion: moveObj.promotion,
 });`;

const patch = `if (!moveObj) return false;

 if (!blackPawnStillExists(nextGame)) {
 showWrongAndReset(
 nextGame,
 { from: moveObj.from, to: moveObj.to, promotion: moveObj.promotion },
 "Wrong - fortress broken",
 "You lost the pawn. In this fortress the defender must keep the pawn protected."
 );
 return true;
 }

 const userMoveUci = moveToUci({
 from: moveObj.from,
 to: moveObj.to,
 promotion: moveObj.promotion,
 });`;

if (!s.includes(needle)) {
 console.log("Could not find insert point.");
 process.exit(1);
}

s = s.replace(needle, patch);

fs.writeFileSync(path, s);
console.log("DONE: Losing the fortress pawn is now a fail.");
