const fs = require("fs");

const path = "src/pages/endgames/FortressTrainer.tsx";
let s = fs.readFileSync(path, "utf8");

const pattern = /const userMoveUci = moveToUci\(\{\s*from: moveObj\.from,\s*to: moveObj\.to,\s*promotion: moveObj\.promotion,\s*\}\);/m;

const insert = `if (!blackPawnStillExists(nextGame)) {
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

if (!pattern.test(s)) {
 console.log("Could not find userMoveUci block.");
 process.exit(1);
}

s = s.replace(pattern, insert);

fs.writeFileSync(path, s);
console.log("DONE: Losing the fortress pawn is now a fail.");
