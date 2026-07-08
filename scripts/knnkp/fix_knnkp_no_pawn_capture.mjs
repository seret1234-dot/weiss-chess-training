import fs from "fs"
import path from "path"

const ROOT = "C:\\Users\\Ariel\\chess-trainer"
const filePath = path.join(ROOT, "src", "pages", "endgames", "KNNKPTrainer.tsx")

let code = fs.readFileSync(filePath, "utf8")

code = code.replace(
  /function userMoveCompletesGoal\(nextGame: Chess\) \{[\s\S]*?return nextGame\.isCheckmate\(\);\s*\}/,
  `function userMoveCompletesGoal(nextGame: Chess) {
    // KNN vs KP: do NOT finish by taking the pawn.
    // Bare KNN vs K is a theoretical draw.
    return nextGame.isCheckmate();
  }`
)

code = code.replace(
  /if \(!blackPawnStillExists\(nextGame\)\) \{[\s\S]*?afterUser: null,\s*\};\s*\}/,
  `if (!blackPawnStillExists(nextGame)) {
      return {
        ok: false,
        reason:
          "Wrong: do not capture the pawn. Two knights alone cannot force mate against a bare king.",
        afterUser: null,
      };
    }`
)

code = code.replace(
  /if \(whiteCanCaptureBlackPawn\(nextGame\)\) \{[\s\S]*?afterUser: null,\s*\};\s*\}/,
  `// KNNKP: unlike KRKP, attacking the pawn is not enough.
    // Keep the pawn as a tempo/stalemate resource.`
)

fs.writeFileSync(filePath, code)

console.log("DONE")
console.log(filePath)