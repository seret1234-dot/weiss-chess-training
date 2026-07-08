import fs from "fs";
import path from "path";

const file = path.join(process.cwd(), "src", "pages", "endgames", "KPKTrainer.tsx");

if (!fs.existsSync(file)) throw new Error(`Missing file:\n${file}`);

const backup = file.replace(/\.tsx$/, `.before_loosen_kpk_${Date.now()}.tsx`);
fs.copyFileSync(file, backup);

let code = fs.readFileSync(file, "utf8");

code = code.replace(
  /if \(target === "win" && afterOutcome === "win"\) \{\s*return \{ ok: true, reason: "", afterUser: null \};\s*\}/,
  `if (target === "win" && afterOutcome === "win") {
      return { ok: true, reason: "", afterUser: null };
    }

    if (
      target === "win" &&
      move?.piece === "p" &&
      move?.color === "w" &&
      whiteKingControlsPromotionPath(nextGame)
    ) {
      return { ok: true, reason: "", afterUser: null };
    }`
);

fs.writeFileSync(file, code, "utf8");

console.log("DONE");
console.log("Backup:");
console.log(backup);