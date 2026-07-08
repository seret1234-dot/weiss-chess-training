import fs from "fs"
import path from "path"

const ROOT = "C:\\Users\\Ariel\\chess-trainer"

const sourcePath = path.join(
  ROOT,
  "src",
  "pages",
  "endgames",
  "KNNKPTrainer.tsx"
)

const targetPath = path.join(
  ROOT,
  "src",
  "pages",
  "endgames",
  "KNNKPForcedMateTrainer.tsx"
)

let code = fs.readFileSync(sourcePath, "utf8")

code = code
  .replace(
    /export default function KNNKPTrainer\(\)/,
    "export default function KNNKPForcedMateTrainer()"
  )
  .replace(/const trainerId = "knnkp";/, 'const trainerId = "knnkp_forced_mate";')
  .replace(/const title = "KNN vs KP";/, 'const title = "KNN vs KP — Forced Mate";')
  .replace(
    /const dataPath = "\/data\/endgames\/knnkp";/,
    'const dataPath = "/data/endgames/knnkp/forced-mate";'
  )
  .replace(/const boardId = "KNNKPTrainerBoard";/, 'const boardId = "KNNKPForcedMateTrainerBoard";')

fs.writeFileSync(targetPath, code)

console.log("DONE")
console.log(targetPath)