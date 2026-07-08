import fs from "fs";

const file = "src/pages/endgames/KPKTrainer.tsx";
let s = fs.readFileSync(file, "utf8");

const staleBlock = `
    if (
      afterUserGame.moves().length === 0 &&
      !afterUserGame.isCheckmate()
    ) {
      clearPendingFeedbackTimeout();

      setGame(afterUserGame);
      setLastMove({ from: userMove.from, to: userMove.to });
      setMarkedSquare(getBlackKingSquare(afterUserGame));
      setCorrectSquares([]);
      setHintSquares([]);
      setEscapeSquares([]);

      setJustMated(false);
      setJustStalemated(true);

      setStatus("STALEMATE — FAIL");
      setMessage("Stalemate is a failed conversion. Try again from the beginning.");
      setInputLocked(true);

      feedbackTimeoutRef.current = window.setTimeout(() => {
        loadPosition(currentIndex);
      }, WRONG_DELAY_MS);

      return;
    }
`;

if (!s.includes("afterUserGame.moves().length === 0")) {
  s = s.replace(
    /(\s*if\s*\(\s*afterUserGame\.isGameOver\(\)\s*\)\s*\{)/,
    `${staleBlock}\n$1`
  );
}

fs.writeFileSync(file, s, "utf8");
console.log("DONE: stalemate handled before generic game over");