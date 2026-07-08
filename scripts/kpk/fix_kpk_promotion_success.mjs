import fs from "fs";

const paths = [
  "src/pages/endgames/KPKTrainer.tsx",
  "src/trainers/KPKTrainer.tsx",
];

for (const file of paths) {
  if (!fs.existsSync(file)) {
    console.log(`Skip missing: ${file}`);
    continue;
  }

  let s = fs.readFileSync(file, "utf8");
  const original = s;

  // 1) promotion counts as success
  s = s.replace(
    `function userMoveCompletesGoal(nextGame: Chess) {
  // KPK king and pawn: only checkmate completes the drill.
  // Capturing the pawn is NOT success because KNN vs K is drawn.
  return nextGame.isCheckmate();
}`,
    `function userMoveCompletesGoal(nextGame: Chess) {
  return nextGame.isCheckmate() || hasWhiteQueenExact(nextGame);
}`
  );

  // 2) promotion shows success overlay
  s = s.replace(
    `setJustMated(nextGame.isCheckmate());`,
    `setJustMated(nextGame.isCheckmate() || hasWhiteQueenExact(nextGame));`
  );

  // 3) promotion text
  s = s.replace(
    `setStatus(nextGame.isCheckmate() ? "CHECKMATE!" : "Correct.");`,
    `setStatus(nextGame.isCheckmate() ? "CHECKMATE!" : "PROMOTION!");`
  );

  // older version fallback
  s = s.replace(
    `setStatus(nextGame.isCheckmate() ? "CHECKMATE!" : "Correct — result preserved.");`,
    `setStatus(nextGame.isCheckmate() ? "CHECKMATE!" : "PROMOTION!");`
  );

  // 4) promotion message
  s = s.replace(
    /setMessage\(\s*nextGame\.isCheckmate\(\)[\s\S]*?\);/m,
    `setMessage(
      nextGame.isCheckmate()
        ? wasFast
          ? \`Checkmate. Fast solve \${nextFastSolves}/\${POSITION_FAST_SOLVES_TO_MASTER}.\`
          : \`Checkmate, but slower than \${maxSecondsPerMove} seconds.\`
        : wasFast
          ? \`Pawn promoted. Fast solve \${nextFastSolves}/\${POSITION_FAST_SOLVES_TO_MASTER}.\`
          : \`Pawn promoted, but slower than \${maxSecondsPerMove} seconds.\`,
    );`
  );

  // 5) remove duplicate stalemate states if script created them
  s = s.replace(
    `const [justStalemated, setJustStalemated] = useState(false);
  const [justStalemated, setJustStalemated] = useState(false);`,
    `const [justStalemated, setJustStalemated] = useState(false);`
  );

  // 6) remove duplicated stalemate block if present
  const duplicateBlock =
`    if (afterUserGame.isStalemate()) {
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
      setMessage("Stalemate is a failed conversion. Restarting position.");
      setInputLocked(true);

      feedbackTimeoutRef.current = window.setTimeout(() => {
        loadPosition(currentIndex);
      }, WRONG_DELAY_MS);

      return;
    }`;

  const first = s.indexOf(duplicateBlock);
  const second = s.indexOf(duplicateBlock, first + 10);

  if (first !== -1 && second !== -1) {
    s =
      s.slice(0, second) +
      s.slice(second + duplicateBlock.length);
  }

  if (s !== original) {
    fs.writeFileSync(file, s, "utf8");
    console.log(`Patched: ${file}`);
  } else {
    console.log(`No changes: ${file}`);
  }
}

console.log("DONE");