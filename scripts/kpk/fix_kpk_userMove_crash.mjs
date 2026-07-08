import fs from "fs";

const file = "src/pages/endgames/KPKTrainer.tsx";
let s = fs.readFileSync(file, "utf8");

s = s.replaceAll(
  `showWrongAndReset(
        nextGame,
        userMove,
        "Stalemate — fail.",
        "You let the defender escape.",
      );`,
  `showWrongAndReset(
        nextGame,
        move,
        "STALEMATE — FAIL",
        "Stalemate is a failed conversion. Try again from the beginning.",
      );`
);

fs.writeFileSync(file, s, "utf8");
console.log("DONE: fixed userMove crash");
