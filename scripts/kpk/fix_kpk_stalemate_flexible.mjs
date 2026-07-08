import fs from "fs";

const file = "C:/Users/Ariel/chess-trainer/src/trainers/KPKTrainer.tsx";
const backup =
  "C:/Users/Ariel/chess-trainer/src/trainers/KPKTrainer.before_stalemate_before_solved.tsx";

let text = fs.readFileSync(file, "utf8");
fs.writeFileSync(backup, text);

const target = `if (nextGame.isGameOver()) {
      await markSolved();
      return true;
    }`;

const replacement = `if (nextGame.isStalemate()) {
      showWrong("Stalemate — fail. You let the defender escape.");
      return true;
    }

    if (nextGame.isGameOver()) {
      await markSolved();
      return true;
    }`;

if (!text.includes(target)) {
  throw new Error("Could not find game-over solved block.");
}

text = text.replace(target, replacement);

fs.writeFileSync(file, text);

console.log("DONE - stalemate fails before game-over solved");
console.log("Backup saved:", backup);