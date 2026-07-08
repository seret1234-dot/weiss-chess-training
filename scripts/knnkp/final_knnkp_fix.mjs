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

code = code.replace(
  /\n\s*if \(nextGame\.isCheckmate\(\)\) \{\s*handleSolved\(nextGame, move\);\s*return true;\s*\}\n/g,
  `\n    // Checkmate is validated by validateByEngine below.\n`
)

fs.writeFileSync(filePath, code)

console.log("DONE")
console.log("Removed direct checkmate auto-accept.")
console.log(filePath)