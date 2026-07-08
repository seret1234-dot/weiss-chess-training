import fs from "fs";
import path from "path";

const file = path.join(
  process.cwd(),
  "src",
  "pages",
  "endgames",
  "KPKTrainer.tsx"
);

if (!fs.existsSync(file)) throw new Error(`Missing file:\n${file}`);

const backup = file.replace(/\.tsx$/, `.before_hint_unlock_${Date.now()}.tsx`);
fs.copyFileSync(file, backup);

let code = fs.readFileSync(file, "utf8");

// Make sure hint does not leave the board locked.
code = code.replace(
  /setStatus\("Hint"\);\s*setMessage\(\s*`Best move: \$\{parsed\.from\} → \$\{parsed\.to\}\$\{parsed\.promotion \? ` \(\$\{parsed\.promotion\}\)` : ""\}`,\s*\);/,
  `setStatus("Hint");
    setMessage(
      \`Best move: \${parsed.from} → \${parsed.to}\${parsed.promotion ? \` (\${parsed.promotion})\` : ""}\`,
    );
    setInputLocked(false);`
);

// Safety: whenever a position starts, unlock board.
code = code.replace(
  /setInputLocked\(false\);\s*setStatus\(getInstructionText\(position, currentThemeConfig\)\);/,
  `setInputLocked(false);
    setStatus(getInstructionText(position, currentThemeConfig));`
);

// Safety: remove hint blocking from onDrop if it accidentally remained.
code = code.replace(
  /loadingChunk \|\|\s*loadError \|\|\s*inputLocked \|\|\s*allComplete \|\|\s*phase === "classify"/,
  `loadingChunk ||
      loadError ||
      inputLocked ||
      allComplete ||
      phase === "classify"`
);

fs.writeFileSync(file, code, "utf8");

console.log("DONE");
console.log("Backup:");
console.log(backup);
console.log("Updated:");
console.log(file);