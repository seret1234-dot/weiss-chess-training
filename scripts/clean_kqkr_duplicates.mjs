import fs from "fs"
import path from "path"

const FILE = path.join(process.cwd(), "src", "kqkr_positions.json")

const PRIORITY = [
  "fork-1",
  "fork-2",
  "fork-3",
  "second-rank-defense",
  "third-rank-defense",
  "rook-checking-defense",
  "mixed-conversion",
]

function main() {
  const raw = JSON.parse(fs.readFileSync(FILE, "utf8"))

  const seen = new Set()

  for (const key of PRIORITY) {
    const group = raw.groups.find((g) => g.key === key)
    if (!group) continue

    const filtered = []

    for (const p of group.positions) {
      if (seen.has(p.fen)) continue

      seen.add(p.fen)
      filtered.push(p)
    }

    group.positions = filtered
  }

  fs.writeFileSync(FILE, JSON.stringify(raw, null, 2))

  console.log("Duplicates cleaned")
}

main()