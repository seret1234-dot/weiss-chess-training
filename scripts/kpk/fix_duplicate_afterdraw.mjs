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

const backup = file.replace(/\.tsx$/, `.before_afterdraw_cleanup_${Date.now()}.tsx`);
fs.copyFileSync(file, backup);

let code = fs.readFileSync(file, "utf8");

// Remove every standalone afterDraw declaration first
code = code.replace(
  /\n\s*\/\/ Draw = NOT winning with margin\s*\n\s*const afterDraw = !afterWinning;/g,
  ""
);

code = code.replace(
  /\n\s*const afterDraw = !afterWinning;/g,
  ""
);

// Add exactly one afterDraw after each afterWinning declaration
code = code.replace(
  /const afterWinning = isWhiteWinning\(afterUser\);/g,
  `const afterWinning = isWhiteWinning(afterUser);
    const afterDraw = !afterWinning;`
);

// Safety: collapse accidental duplicate blocks
code = code.replace(
  /(const afterWinning = isWhiteWinning\(afterUser\);\s*const afterDraw = !afterWinning;\s*)+/g,
  `const afterWinning = isWhiteWinning(afterUser);
    const afterDraw = !afterWinning;
`
);

fs.writeFileSync(file, code, "utf8");

console.log("DONE");
console.log("Backup:");
console.log(backup);
console.log("Updated:");
console.log(file);