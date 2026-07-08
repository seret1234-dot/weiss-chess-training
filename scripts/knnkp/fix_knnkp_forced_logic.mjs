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

const oldBlock = `const moveIsBest = before.bestMove === attemptedUci;

    if (moveIsBest) {
      return { ok: true, reason: "", afterUser };
    }

    if (isClearlyWinningForWhite(afterUser)) {
      return { ok: true, reason: "", afterUser };
    }`

const newBlock = `// Mate-based validation for forced mate training.
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

if (!code.includes(oldBlock)) {
  console.error("Could not find target validation block.")
  process.exit(1)
}

code = code.replace(oldBlock, newBlock)

fs.writeFileSync(filePath, code)

console.log("DONE")
console.log(filePath)