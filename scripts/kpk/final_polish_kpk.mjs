import fs from "fs";
import path from "path";

const file = path.join(
  process.cwd(),
  "src",
  "pages",
  "endgames",
  "KPKTrainer.tsx"
);

if (!fs.existsSync(file)) {
  throw new Error(`Missing file:\n${file}`);
}

const backup = file.replace(/\.tsx$/, `.final_polish_backup_${Date.now()}.tsx`);
fs.copyFileSync(file, backup);

let code = fs.readFileSync(file, "utf8");

// Remove duplicate afterDraw declarations safely
code = code.replaceAll(
  `const afterWinning = isWhiteWinning(afterUser);

// Draw = NOT winning with margin
const afterDraw = !afterWinning;

const afterWinning = isWhiteWinning(afterUser);
const afterDraw = !afterWinning;`,
  `const afterWinning = isWhiteWinning(afterUser);
const afterDraw = !afterWinning;`
);

code = code.replaceAll(
  `const afterWinning = isWhiteWinning(afterUser);
const afterDraw = !afterWinning;

const afterWinning = isWhiteWinning(afterUser);
const afterDraw = !afterWinning;`,
  `const afterWinning = isWhiteWinning(afterUser);
const afterDraw = !afterWinning;`
);

// Replace isWhiteWinning only once
code = code.replace(
  /function isWhiteWinning\(info: EngineResult \| null\) \{[\s\S]*?return false;\s*\}/,
  `function isWhiteWinning(info: EngineResult | null) {
  if (!info) return false;

  if (typeof info.mate === "number") return info.mate > 0;

  if (typeof info.eval === "number") {
    return info.eval >= 1.2;
  }

  return false;
}`
);

// Ensure validateByEngine accepts hinted/best move only once
if (!code.includes("Always accept engine best move in KPK")) {
  code = code.replace(
    `const before = engineInfo ?? (await evaluatePosition(beforeFen));`,
    `const before = engineInfo ?? (await evaluatePosition(beforeFen));

    // Always accept engine best move in KPK.
    // This prevents Hint showing a move and validation rejecting it.
    if (before?.bestMove && attemptedUci === before.bestMove) {
      const afterUser = await evaluatePosition(afterFen);
      return { ok: true, reason: "", afterUser };
    }`
  );
}

// Add afterDraw if missing after afterWinning
code = code.replace(
  /const afterWinning = isWhiteWinning\(afterUser\);\s*(?!const afterDraw)/,
  `const afterWinning = isWhiteWinning(afterUser);
  const afterDraw = !afterWinning;
`
);

// Clean KNNKP wording
code = code
  .replaceAll("mate countdown", "result evaluation")
  .replaceAll("Mate countdown", "Result evaluation")
  .replaceAll("reduce mate distance", "preserve the KPK result")
  .replaceAll("forced mate", "endgame result")
  .replaceAll("Forced mate", "Endgame result")
  .replaceAll("Keep tightening the net.", "Use king position and pawn timing.")
  .replaceAll("Checkmate.", "KPK result preserved.")
  .replaceAll("Checkmate, but slower", "Correct result, but slower");

// Improve generic instruction
code = code.replace(
  `return "Find an accepted move";`,
  `if (position?.subjectName) {
    return position.result === "draw"
      ? \`Hold the draw — \${position.subjectName}\`
      : \`Win the position — \${position.subjectName}\`;
  }

  return position.result === "draw"
    ? "Hold the draw"
    : "Win the position";`
);

// Improve wrong feedback if old strings exist
code = code
  .replaceAll(
    "Wrong: this move loses the win. Use opposition/key squares.",
    "This move loses the win. Use opposition, improve king position, or delay the pawn push."
  )
  .replaceAll(
    "Wrong: this move loses the draw. Stay in the drawing zone.",
    "This move loses the draw. Keep the king in the drawing zone or aim for stalemate setups."
  )
  .replaceAll("Wrong move.", "Incorrect — result changed.")
  .replaceAll("Correct.", "Correct — result preserved.");

fs.writeFileSync(file, code, "utf8");

console.log("DONE");
console.log("Backup:");
console.log(backup);
console.log("Updated:");
console.log(file);