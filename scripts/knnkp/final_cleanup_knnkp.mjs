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

// 1. Remove strictChunk + hasPreparedRoute declarations
code = code.replace(
  /\n\s*const strictChunk = false;\s*\n\s*const hasPreparedRoute = false;\s*\n/g,
  "\n"
)

// 2. Remove allowedMoves shortcut block
code = code.replace(
  /\n\s*if\s*\(\s*\(strictChunk\s*\|\|\s*hasPreparedRoute\)\s*&&[\s\S]*?return;\s*\}\n/g,
  "\n"
)

// 3. Remove fallback strict block inside validation failure
code = code.replace(
  /\n\s*if\s*\(\s*strictChunk\s*\|\|\s*hasPreparedRoute\s*\)\s*\{[\s\S]*?return;\s*\}\n/g,
  "\n"
)

// 4. Improve generic wrong message
code = code.replace(
  /"Wrong move\."/g,
  `"Wrong move — try to reduce mate distance."`
)

fs.writeFileSync(filePath, code)

console.log("DONE")
console.log("KNNKP trainer cleaned and finalized.")
console.log(filePath)