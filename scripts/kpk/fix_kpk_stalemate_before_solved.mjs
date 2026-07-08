import fs from "fs";

const file = "C:/Users/Ariel/chess-trainer/src/trainers/KPKTrainer.tsx";
const backup =
  "C:/Users/Ariel/chess-trainer/src/trainers/KPKTrainer.before_stalemate_before_solved.tsx";

let text = fs.readFileSync(file, "utf8");
fs.writeFileSync(backup, text);

if (text.includes("Stalemate — fail")) {
  console.log("Stalemate fail already exists. No change.");
  process.exit(0);
}

const pattern =
  /if\s*\(\s*nextGame\.isGameOver\(\)\s*\)\s*{\s*await\s+markSolved\(\);\s*return\s+true;\s*}/m;

const replacement = `if (nextGame.isStalemate()) {
      showWrong("Stalemate — fail. You let the defender escape.");
      return true;
    }

    if (nextGame.isGameOver()) {
      await markSolved();
      return true;
    }`;

if (!pattern.test(text)) {
  throw new Error("Could not find game-over solved block with regex.");
}

text = text.replace(pattern, replacement);

fs.writeFileSync(file, text);

console.log("DONE - stalemate fails before game-over solved");
console.log("Backup saved:", backup);