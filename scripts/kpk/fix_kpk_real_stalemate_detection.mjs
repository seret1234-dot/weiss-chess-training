import fs from "fs";

const file = "src/pages/endgames/KPKTrainer.tsx";

let s = fs.readFileSync(file, "utf8");

s = s.replace(
`function userMoveCompletesGoal(nextGame: Chess) {
    return nextGame.isCheckmate() || hasWhiteQueenExact(nextGame);
}`,
`function isRealStalemate(gameToCheck: Chess) {
    return !gameToCheck.isCheckmate() && gameToCheck.moves().length === 0;
  }

  function userMoveCompletesGoal(nextGame: Chess) {
    return nextGame.isCheckmate() || hasWhiteQueenExact(nextGame);
}`
);

s = s.replaceAll(
`afterUserGame.isStalemate()`,
`isRealStalemate(afterUserGame)`
);

s = s.replace(
`setStatus(getInstructionText(position, currentThemeConfig));
    setMessage(
      position.explanation ||
        "Use opposition, key squares, king activity, and correct pawn timing.",
    );
    setInputLocked(false);`,
`if (isRealStalemate(nextGame)) {
      setLastMove({});
      setMarkedSquare(getBlackKingSquare(nextGame));
      setCorrectSquares([]);
      setHintSquares([]);
      setEscapeSquares([]);
      setJustMated(false);
      setJustStalemated(true);
      setStatus("STALEMATE — FAIL");
      setMessage("This position is already stalemate. Restarting position.");
      setInputLocked(true);

      feedbackTimeoutRef.current = window.setTimeout(() => {
        loadRandomNextPosition(progress ?? createEmptyTrainerProgress([]), position.id);
      }, WRONG_DELAY_MS);

      return;
    }

    setStatus(getInstructionText(position, currentThemeConfig));
    setMessage(
      position.explanation ||
        "Use opposition, key squares, king activity, and correct pawn timing.",
    );
    setInputLocked(false);`
);

fs.writeFileSync(file, s, "utf8");
console.log("Patched real stalemate detection:", file);