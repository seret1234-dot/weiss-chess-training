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

  // promotion or mate completes the puzzle
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

  // overlay trigger
  s = s.replace(
    `setJustMated(nextGame.isCheckmate());`,
    `setJustMated(nextGame.isCheckmate() || hasWhiteQueenExact(nextGame));`
  );

  // status text
  s = s.replace(
    `setStatus(nextGame.isCheckmate() ? "CHECKMATE!" : "Correct — result preserved.");`,
    `setStatus(nextGame.isCheckmate() ? "CHECKMATE!" : "PROMOTION!");`
  );

  // message text
  s = s.replace(
    `setMessage(
      nextGame.isCheckmate()
        ? wasFast
          ? \`KPK result preserved. Fast solve \${nextFastSolves}/\${POSITION_FAST_SOLVES_TO_MASTER} for this puzzle.\`
          : \`Correct result, but slower than \${maxSecondsPerMove} seconds.\`
        : wasFast
          ? \`Fast solve \${nextFastSolves}/\${POSITION_FAST_SOLVES_TO_MASTER} for this puzzle.\`
          : \`Solved, but slower than \${maxSecondsPerMove} seconds.\`,
    );`,
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

  if (s !== original) {
    fs.writeFileSync(file, s, "utf8");
    console.log(`Patched: ${file}`);
  } else {
    console.log(`No changes: ${file}`);
  }
}

console.log("DONE");