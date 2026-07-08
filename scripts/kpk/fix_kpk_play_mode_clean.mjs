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

const backup = file.replace(/\.tsx$/, `.before_force_draggable_${Date.now()}.tsx`);
fs.copyFileSync(file, backup);

let code = fs.readFileSync(file, "utf8");

// 1. Force KPK to start in play mode.
code = code.replace(
  `const [phase, setPhase] = useState<"classify" | "play">("classify");`,
  `const [phase, setPhase] = useState<"classify" | "play">("play");`
);

// 2. Make board draggable unless loading/all complete.
code = code.replace(
  /arePiecesDraggable=\{\s*!loadingChunk && !inputLocked && !allComplete && phase === "play"\s*\}/g,
  `arePiecesDraggable={!loadingChunk && !allComplete}`
);

// 3. Remove phase/inputLocked blocking from onDrop.
code = code.replace(
  /if \(\s*loadingChunk \|\|\s*loadError \|\|\s*inputLocked \|\|\s*allComplete \|\|\s*phase === "classify"\s*\)\s*return false;/g,
  `if (loadingChunk || loadError || allComplete) return false;`
);

// 4. Hint must never lock board.
code = code.replaceAll(
  `setInputLocked(false);
  }`,
  `setInputLocked(false);
  }`
);

// 5. Ensure every loaded position is playable.
code = code.replaceAll(`setPhase("classify");`, `setPhase("play");`);
code = code.replaceAll(`setInputLocked(true);`, `setInputLocked(false);`);

fs.writeFileSync(file, code, "utf8");

console.log("DONE");
console.log("Backup:");
console.log(backup);
console.log("Updated:");
console.log(file);