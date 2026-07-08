import fs from "fs";

const file = "C:/Users/Ariel/chess-trainer/src/pages/endgames/KPKTrainer.tsx";
const backup =
  "C:/Users/Ariel/chess-trainer/src/pages/endgames/KPKTrainer.before_stalemate_live_fix.tsx";

let text = fs.readFileSync(file, "utf8");
fs.writeFileSync(backup, text);

if (!text.includes("Stalemate — fail")) {
  text = text.replace(
    /if\s*\(\s*afterUserGame\.isGameOver\(\)\s*\)\s*{/,
    `if (afterUserGame.isStalemate()) {
      setGame(afterUserGame);
      setStatus("Stalemate — fail.");
      setMessage("You let the defender escape. Restarting position.");
      setInputLocked(true);

      window.setTimeout(() => {
        loadPosition(currentIndex);
      }, WRONG_DELAY_MS);

      return;
    }

    if (afterUserGame.isGameOver()) {`,
  );

  text = text.replace(
    /if\s*\(\s*nextGame\.isGameOver\(\)\s*\)\s*{/,
    `if (nextGame.isStalemate()) {
      showWrongAndReset(
        nextGame,
        userMove,
        "Stalemate — fail.",
        "You let the defender escape.",
      );
      return true;
    }

    if (nextGame.isGameOver()) {`,
  );
}

fs.writeFileSync(file, text);

console.log("DONE - fixed stalemate in LIVE KPK trainer");
console.log("Backup saved:", backup);