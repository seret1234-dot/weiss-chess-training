import fs from "fs";

const file = "src/pages/endgames/KPKTrainer.tsx";
let s = fs.readFileSync(file, "utf8");

// Fix any showWrongAndReset(nextGame, userMove, ...) inside onDrop.
// userMove is undefined there; the actual move object is called move.
s = s.replace(
  /showWrongAndReset\(\s*nextGame,\s*userMove,/g,
  "showWrongAndReset(\n        nextGame,\n        move,"
);

// Fix broken dash encoding in status text
s = s.replaceAll("STALEMATE ? FAIL", "STALEMATE — FAIL");

fs.writeFileSync(file, s, "utf8");
console.log("DONE: fixed remaining userMove crash");
