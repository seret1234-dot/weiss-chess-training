import fs from "fs"
import path from "path"

const ROOT = "C:\\Users\\Ariel\\chess-trainer"

const filePath = path.join(
  ROOT,
  "src",
  "pages",
  "endgames",
  "KNNKPForcedMateTrainer.tsx"
)

let code = fs.readFileSync(filePath, "utf8")

const pattern =
  /const moveIsBest = before\.bestMove === attemptedUci;[\s\S]*?if \(isClearlyWinningForWhite\(afterUser\)\) \{[\s\S]*?return \{ ok: true, reason: "", afterUser \};[\s\S]*?\}/

const replacement = `// Mate-based validation for forced mate training.
    // Accept only moves that keep or reduce mate distance.
    if (typeof before?.mate === "number" && typeof afterUser?.mate === "number") {
      const beforeMate = Math.abs(before.mate);
      const afterMate = Math.abs(afterUser.mate);

      if (afterMate <= beforeMate) {
        return { ok: true, reason: "", afterUser };
      }

      return {
        ok: false,
        reason: \`Wrong: mate increased (\${beforeMate} → \${afterMate}).\`,
        afterUser,
      };
    }

    const moveIsBest = before.bestMove === attemptedUci;

    if (moveIsBest) {
      return { ok: true, reason: "", afterUser };
    }

    if (isClearlyWinningForWhite(afterUser)) {
      return { ok: true, reason: "", afterUser };
    }`

if (!pattern.test(code)) {
  console.error("Could not find flexible validation block.")
  process.exit(1)
}

code = code.replace(pattern, replacement)

fs.writeFileSync(filePath, code)

console.log("DONE")
console.log(filePath)