import fs from "fs";
import path from "path";

const root = process.cwd();

const target = path.join(
  root,
  "src",
  "pages",
  "endgames",
  "KPKTrainer.tsx"
);

if (!fs.existsSync(target)) {
  throw new Error(`Missing KPK trainer:\n${target}`);
}

const backup = target.replace(/\.tsx$/, `.before_polish_${Date.now()}.tsx`);
fs.copyFileSync(target, backup);

let code = fs.readFileSync(target, "utf8");

// 1. Remove KNNKP-only pawn restriction leftovers.
code = code.replace(
  /if \(!blackPawnStillExists\(nextGame\)\) \{[\s\S]*?afterUser: null,\s*\};\s*\}/,
  ""
);

// 2. Replace KPK result check with safer threshold.
code = code.replace(
  /function isWhiteWinning\(info\) \{[\s\S]*?return false;\s*\}/,
  `function isWhiteWinning(info: EngineResult | null) {
  if (!info) return false;

  // Tablebase-like KPK handling through engine:
  // mate means clearly winning, high eval means practically winning.
  if (typeof info.mate === "number") return info.mate > 0;

  if (typeof info.eval === "number") {
    return info.eval >= 1.5;
  }

  return false;
}`
);

// 3. Add useful KPK feedback helpers before validateByEngine.
code = code.replace(
  /async function validateByEngine\(/,
  `function getKpkHintText(position: TrainingPosition | null) {
  const subject = (position?.subjectName || position?.theme || "").toLowerCase();

  if (subject.includes("opposition")) {
    return "Use opposition: put the kings facing each other with the correct side to move.";
  }

  if (subject.includes("key")) {
    return "Aim for the key squares in front of the pawn before pushing too early.";
  }

  if (subject.includes("rook")) {
    return "Rook-pawn endings often draw if the defender reaches the promotion corner.";
  }

  if (subject.includes("wrong")) {
    return "Tempo matters here. The same shape can win or draw depending on whose turn it is.";
  }

  return "Use king activity first, then push the pawn when the king position is ready.";
}

async function validateByEngine(`
);

// 4. Improve wrong messages inside validateByEngine.
code = code.replace(
  `"Wrong: this move loses the win. Use opposition/key squares."`,
  "`${getKpkHintText(currentPosition)} This move lets the win slip.`"
);

code = code.replace(
  `"Wrong: this move loses the draw. Stay in the drawing zone."`,
  "`${getKpkHintText(currentPosition)} This move loses the draw.`"
);

// 5. Improve instruction text.
code = code.replace(
  'return position.result === "draw" ? "Hold the draw" : "Find the winning plan";',
  `if (position.subjectName) {
    return position.result === "draw"
      ? \`Hold the draw — \${position.subjectName}\`
      : \`Win — \${position.subjectName}\`;
  }

  return position.result === "draw" ? "Hold the draw" : "Find the winning plan";`
);

// 6. Better startup message.
code = code.replaceAll(
  "Convert or hold the KPK result using opposition, key squares, and correct king placement.",
  "Use opposition, key squares, king activity, and correct pawn timing."
);

// 7. Make solved message KPK-specific.
code = code.replaceAll(
  "Checkmate.",
  "KPK result preserved."
);

code = code.replaceAll(
  "Checkmate, but slower",
  "Correct result, but slower"
);

// 8. Remove forced-mate wording.
code = code.replaceAll("mate countdown", "KPK result");
code = code.replaceAll("Mate countdown", "KPK result");
code = code.replaceAll("reduce mate distance", "preserve the KPK result");
code = code.replaceAll("Keep tightening the net.", "Use king position and pawn timing.");

// 9. Add subject line if TrainerShell title block has subtitle-like text available.
code = code.replaceAll(
  "Completed ${currentThemeConfig.label ?? currentThemeId}. Loading next theme...",
  "Completed ${currentPosition?.subjectName ?? currentThemeConfig.label ?? currentThemeId}. Loading next subject..."
);

// 10. Fix TypeScript accidental untyped patch if needed.
code = code.replaceAll("function isWhiteWinning(info) {", "function isWhiteWinning(info: EngineResult | null) {");

fs.writeFileSync(target, code, "utf8");

console.log("DONE");
console.log("Backup:");
console.log(backup);
console.log("Polished:");
console.log(target);