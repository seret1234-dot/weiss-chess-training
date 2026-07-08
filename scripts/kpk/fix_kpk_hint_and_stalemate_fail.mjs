import fs from "fs";

const file = "C:/Users/Ariel/chess-trainer/src/trainers/KPKTrainer.tsx";
const backup =
  "C:/Users/Ariel/chess-trainer/src/trainers/KPKTrainer.before_stalemate_position_ended_fix.tsx";

let text = fs.readFileSync(file, "utf8");
fs.writeFileSync(backup, text);

const target = `if (afterUserGame.isGameOver()) {
      setGame(afterUserGame);
      setLastMove({ from: userMove.from, to: userMove.to });
      setMessage("Position ended.");
      setInputLocked(false);
      return;
    }`;

const replacement = `if (afterUserGame.isStalemate()) {
      setGame(afterUserGame);
      setLastMove({ from: userMove.from, to: userMove.to });
      setHintSquares([]);
      setMessage("Stalemate — fail. Restarting position.");
      setInputLocked(true);

      window.setTimeout(() => {
        loadPosition(currentIndex);
      }, WRONG_DELAY_MS);

      return;
    }

    if (afterUserGame.isGameOver()) {
      setGame(afterUserGame);
      setLastMove({ from: userMove.from, to: userMove.to });
      setMessage("Position ended.");
      setInputLocked(false);
      return;
    }`;

if (!text.includes(target)) {
  throw new Error("Could not find the exact Position ended block.");
}

text = text.replace(target, replacement);

fs.writeFileSync(file, text);

console.log("DONE - stalemate now fails before generic Position ended");
console.log("Backup saved:", backup);