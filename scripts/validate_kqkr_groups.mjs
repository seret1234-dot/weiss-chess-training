import fs from "fs"

const data = JSON.parse(fs.readFileSync("src/kqkr_positions.json", "utf8"))

const map = new Map()

for (const g of data.groups) {
  for (const p of g.positions) {
    if (!map.has(p.fen)) map.set(p.fen, [])
    map.get(p.fen).push(g.key)
  }
}

let duplicates = 0

for (const [fen, groups] of map.entries()) {
  if (groups.length > 1) {
    console.log("DUPLICATE:", fen, groups)
    duplicates++
  }
}

console.log("Total duplicates:", duplicates)