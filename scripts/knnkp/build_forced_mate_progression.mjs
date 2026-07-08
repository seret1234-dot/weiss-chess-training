import fs from "fs"
import path from "path"

const ROOT = "C:\\Users\\Ariel\\chess-trainer\\public\\data\\endgames\\knnkp\\forced-mate"
const CHUNKS_DIR = path.join(ROOT, "chunks")

const files = fs
  .readdirSync(CHUNKS_DIR)
  .filter((f) => f.startsWith("mate_") && f.endsWith(".json"))

// extract mate distance
function getDistance(file) {
  const m = file.match(/mate_(\d+)/)
  return m ? Number(m[1]) : 999
}

// sort by mate distance
files.sort((a, b) => getDistance(a) - getDistance(b))

const order = []
const themes = {}

files.forEach((file) => {
  const d = getDistance(file)
  const themeId = `mate-${String(d).padStart(3, "0")}`

  order.push(themeId)

  themes[themeId] = {
    id: themeId,
    label: `Mate in ${d}`,
    chunkFiles: [file],
    masteryFastSolves: 5,
    maxSecondsPerMove: 3,
    goal: "checkmate",
    mode: "convert",
  }
})

const progression = {
  order,
  themes,
  masteryFastSolves: 5,
  maxSecondsPerMove: 3,
  chunkSize: 30,
}

fs.writeFileSync(
  path.join(ROOT, "progression.json"),
  JSON.stringify(progression, null, 2)
)

console.log("DONE")
console.log(`themes: ${order.length}`)