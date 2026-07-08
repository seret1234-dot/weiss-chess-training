import fs from "fs"
import path from "path"

const ROOT = "C:\\Users\\Ariel\\chess-trainer"

// source (your working trainer)
const sourcePath = path.join(ROOT, "src", "pages", "endgames", "KRKPTrainer.tsx")

// target (correct folder for router)
const targetPath = path.join(ROOT, "src", "pages", "endgames", "KNNKPTrainer.tsx")

let code = fs.readFileSync(sourcePath, "utf8")

code = code
  // rename component
  .replace(/export default function KRKPTrainer\(\)/, "export default function KNNKPTrainer()")

  // core identifiers
  .replace(/const trainerId = "krkp";/, 'const trainerId = "knnkp";')
  .replace(/const title = "KR vs KP";/, 'const title = "KNN vs KP";')
  .replace(/const dataPath = "\/data\/endgames\/krkp";/, 'const dataPath = "/data/endgames/knnkp";')
  .replace(/const boardId = "KRKPTrainerBoard";/, 'const boardId = "KNNKPTrainerBoard";')

  // CRITICAL RULE: cannot win after capturing pawn
  .replace(
`function userMoveCompletesGoal(nextGame: Chess) {
    if (!blackPawnStillExists(nextGame)) return true;
    return nextGame.isCheckmate();
  }`,
`function userMoveCompletesGoal(nextGame: Chess) {
    // KNN vs KP: capturing the pawn leads to drawn KNN vs K
    // Only success condition is checkmate
    return nextGame.isCheckmate();
  }`
  )

  // CRITICAL VALIDATION FIX
  .replace(
`if (!blackPawnStillExists(nextGame)) {
      return { ok: true, reason: "", afterUser: null };
    }

    if (whiteCanCaptureBlackPawn(nextGame)) {
      return { ok: true, reason: "", afterUser: null };
    }`,
`if (!blackPawnStillExists(nextGame)) {
      return {
        ok: false,
        reason: "Do not capture the pawn — KNN vs K is a theoretical draw.",
        afterUser: null,
      };
    }

    // In KNNKP we do NOT allow free pawn capture logic
    // Pawn must be kept as a tempo resource`
  )

  // rename all labels
  .replaceAll("KRKP", "KNNKP")
  .replaceAll("KR vs KP", "KNN vs KP")
  .replaceAll("krkp", "knnkp")

fs.mkdirSync(path.dirname(targetPath), { recursive: true })
fs.writeFileSync(targetPath, code)

console.log("DONE")
console.log("Created:", targetPath)