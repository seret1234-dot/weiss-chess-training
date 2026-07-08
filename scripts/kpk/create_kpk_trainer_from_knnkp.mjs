import fs from "fs";
import path from "path";

const root = process.cwd();

const source = path.join(
  root,
  "src",
  "pages",
  "endgames",
  "KNNKPForcedMateTrainer.tsx"
);

const target = path.join(
  root,
  "src",
  "pages",
  "endgames",
  "KPKTrainer.tsx"
);

const progressionPath = path.join(
  root,
  "public",
  "data",
  "endgames",
  "kpk",
  "progression.json"
);

if (!fs.existsSync(source)) {
  throw new Error(`Missing source file:\n${source}`);
}

if (!fs.existsSync(progressionPath)) {
  throw new Error(`Missing KPK progression:\n${progressionPath}`);
}

// backup existing KPK trainer if exists
if (fs.existsSync(target)) {
  const backup = target.replace(/\.tsx$/, `.backup_${Date.now()}.tsx`);
  fs.copyFileSync(target, backup);
  console.log(`Backup created:\n${backup}`);
}

// read source
let code = fs.readFileSync(source, "utf8");

// ===== BASIC REPLACEMENTS =====
code = code
  .replaceAll("KNNKPForcedMateTrainer", "KPKTrainer")
  .replaceAll('const trainerId = "knnkp_forced_mate";', 'const trainerId = "kpk";')
  .replaceAll('const title = "KNN vs KP — Forced Mate";', 'const title = "KPK — King and Pawn vs King";')
  .replaceAll('const dataPath = "/data/endgames/knnkp/forced-mate";', 'const dataPath = "/data/endgames/kpk";')
  .replaceAll('const boardId = "KNNKPForcedMateTrainerBoard";', 'const boardId = "KPKTrainerBoard";')
  .replaceAll("KNNKP", "KPK")
  .replaceAll("KNN vs KP", "KPK")
  .replaceAll("Forced Mate", "King and Pawn")
  .replaceAll("forced mate", "king and pawn");

// ===== TEXT FIXES =====
code = code
  .replaceAll(
    "Two knights alone cannot force mate against a bare king.",
    "King and pawn endings depend on opposition, key squares, and promotion races."
  )
  .replaceAll(
    "Convert the win. Keep the pawn as a tempo resource and force mate.",
    "Convert or hold the KPK result using opposition, key squares, and correct king placement."
  )
  .replaceAll("Finish the mate", "Convert the KPK result");

// ===== ADD KPK FIELDS =====
code = code.replace(
  'result?: "win" | "draw";',
  `result?: "win" | "draw" | "mixed";
  goal?: "win" | "draw" | "mixed";
  subjectId?: string;
  subjectName?: string;`
);

code = code.replace(
  'result: "win" | "draw";',
  `result: "win" | "draw" | "mixed";
  subjectId?: string;
  subjectName?: string;`
);

code = code.replace(
  'result: raw.result || raw.outcome || raw.evaluation || "win",',
  `result: raw.result || raw.outcome || raw.evaluation || raw.goal || "win",
    subjectId: raw.subjectId,
    subjectName: raw.subjectName,`
);

// ===== REPLACE VALIDATION (CORE FIX) =====
code = code.replace(
  /async function validateByEngine[\s\S]*?function onDrop/,
  `
function isWhiteWinning(info) {
  if (!info) return false;
  if (typeof info.mate === "number") return info.mate > 0;
  if (typeof info.eval === "number") return info.eval >= 2.0;
  return false;
}

async function validateByEngine(
  beforeFen,
  afterFen,
  attemptedUci,
  nextGame
) {
  const before = engineInfo ?? (await evaluatePosition(beforeFen));
  const afterUser = await evaluatePosition(afterFen);

  if (!before || !afterUser) {
    return {
      ok: false,
      reason: "Engine error evaluating KPK position.",
      afterUser,
    };
  }

  const target =
    currentPosition?.result === "mixed"
      ? isWhiteWinning(before)
        ? "win"
        : "draw"
      : currentPosition?.result || "win";

  const afterWinning = isWhiteWinning(afterUser);

  if (target === "win" && afterWinning) {
    return { ok: true, reason: "", afterUser };
  }

  if (target === "draw" && !afterWinning) {
    return { ok: true, reason: "", afterUser };
  }

  return {
    ok: false,
    reason:
      target === "win"
        ? "Wrong: this move loses the win. Use opposition/key squares."
        : "Wrong: this move loses the draw. Stay in the drawing zone.",
    afterUser,
  };
}

function onDrop`
);

// ===== REMOVE STRICT LOGIC =====
code = code.replaceAll("(strictChunk || hasPreparedRoute) &&", "false &&");
code = code.replaceAll("if (strictChunk || hasPreparedRoute)", "if (false)");

// ===== IMPROVE INSTRUCTION =====
code = code.replace(
  'return "Find an accepted move";',
  'return position.result === "draw" ? "Hold the draw" : "Find the winning plan";'
);

// ===== SHOW SUBJECT IN UI =====
code = code.replace(
  "footerLeft={currentThemeConfig.label ?? currentThemeId}",
  "footerLeft={currentPosition?.subjectName ?? currentThemeConfig.label ?? currentThemeId}"
);

// write trainer
fs.writeFileSync(target, code, "utf8");

// ===== FIX PROGRESSION STRUCTURE =====
const progression = JSON.parse(fs.readFileSync(progressionPath, "utf8"));

if (Array.isArray(progression.files)) {
  const order = [];
  const themes = {};

  for (const file of progression.files) {
    const subjectId = file.subjectId || "mixed";
    const label = file.subjectName || subjectId;

    if (!themes[subjectId]) {
      order.push(subjectId);
      themes[subjectId] = {
        id: subjectId,
        label,
        chunkFiles: [],
        masteryFastSolves: 5,
        maxSecondsPerMove: 3,
        goal: file.goal || "win",
        mode: "convert",
      };
    }

    themes[subjectId].chunkFiles.push(path.basename(file.path));
  }

  progression.order = order;
  progression.themes = themes;
  progression.masteryFastSolves = 5;
  progression.maxSecondsPerMove = 3;
  progression.goal = "kpk";
  progression.basePath = "/data/endgames/kpk";
}

fs.writeFileSync(progressionPath, JSON.stringify(progression, null, 2));

console.log("DONE");
console.log("Created KPK trainer:");
console.log(target);