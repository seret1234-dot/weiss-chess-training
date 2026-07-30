import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { Chess } from "chess.js"

const root = process.cwd()
const outputPath = resolve(root, "docs/reviews/pattern-mate-m1-curriculum-review.md")
const themes = [
  "back-rank",
  "anastasia",
  "arabian",
  "boden",
  "smothered",
  "hook",
]

function uciMove(game, uci) {
  return game.move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.slice(4, 5) || undefined,
  })
}

function displayedGame(puzzle) {
  const game = new Chess(puzzle.fen)
  if (puzzle.preMove) uciMove(game, puzzle.preMove)
  return game
}

function expectedLine(puzzle) {
  const moves = Array.isArray(puzzle.solutionLine)
    ? puzzle.solutionLine
    : Array.isArray(puzzle.moves)
      ? puzzle.moves
      : puzzle.solution ? [puzzle.solution] : []
  const preMove = String(puzzle.preMove ?? "").toLowerCase()
  return moves.map(String).map((move) => move.toLowerCase()).filter((move) => move && move !== preMove)
}

function region(square) {
  const file = square.charCodeAt(0) - 97
  const rank = Number(square[1])
  const fileBand = file <= 2 ? "queenside" : file <= 5 ? "center" : "kingside"
  const rankBand = rank <= 3 ? "low" : rank <= 6 ? "middle" : "high"
  return `${fileBand}-${rankBand}`
}

function findKingSquare(game, color) {
  for (const rank of "12345678") {
    for (const file of "abcdefgh") {
      const square = `${file}${rank}`
      const piece = game.get(square)
      if (piece?.type === "k" && piece.color === color) return square
    }
  }
  return "?"
}

function occupiedKingNeighbors(game, square) {
  if (square === "?") return 0
  const file = square.charCodeAt(0) - 97
  const rank = Number(square[1])
  let occupied = 0
  for (let fileOffset = -1; fileOffset <= 1; fileOffset += 1) {
    for (let rankOffset = -1; rankOffset <= 1; rankOffset += 1) {
      if (fileOffset === 0 && rankOffset === 0) continue
      const nextFile = file + fileOffset
      const nextRank = rank + rankOffset
      if (nextFile < 0 || nextFile > 7 || nextRank < 1 || nextRank > 8) continue
      if (game.get(`${String.fromCharCode(97 + nextFile)}${nextRank}`)) occupied += 1
    }
  }
  return occupied
}

function structuralTags(puzzle) {
  const game = displayedGame(puzzle)
  const expected = expectedLine(puzzle)[0] ?? ""
  const attacker = expected ? game.get(expected.slice(0, 2)) : null
  const defender = game.turn() === "w" ? "b" : "w"
  const kingSquare = findKingSquare(game, defender)
  const nonPawns = game.board()
    .flat()
    .filter(Boolean)
    .filter((piece) => piece.type !== "p")
    .map((piece) => `${piece.color}${piece.type.toUpperCase()}`)
    .sort()
    .join(",")
  const nearKing = occupiedKingNeighbors(game, kingSquare)
  return [
    `king:${kingSquare}`,
    `region:${region(kingSquare)}`,
    `attacker:${attacker ? `${attacker.color}${attacker.type.toUpperCase()}` : "?"}`,
    `key:${expected || "?"}`,
    `king-neighbor-occupancy:${nearKing}`,
    `nonpawns:${nonPawns}`,
  ]
}

function canonicalIdentity(puzzle) {
  const game = displayedGame(puzzle)
  const sourceIdentity = puzzle.lichessId ?? puzzle.puzzleId ?? puzzle.localId ?? puzzle.id
  return `${game.fen().split(/\s+/).slice(0, 4).join(" ")}|mate-in-1|${expectedLine(puzzle).join(",")}|${sourceIdentity}`
}

function markdownCell(value) {
  return String(value).replaceAll("|", "\\|")
}

const lines = [
  "# Pattern Mate M1 learner-curriculum review",
  "",
  "Generated deterministically from the committed `m1-v1` learner manifests. Source pools are unchanged; this report is a human curation aid.",
  "",
  "Canonical identity: displayed normalized FEN after `preMove` + objective + expected solution + source identity.",
  "",
]

for (const theme of themes) {
  const base = resolve(root, `public/data/learner-curricula/pattern-mates/${theme}-m1-v1`)
  const manifest = JSON.parse(await readFile(resolve(base, "manifest.json"), "utf8"))
  const records = []
  for (const file of manifest.files) {
    const chunk = JSON.parse(await readFile(resolve(base, file), "utf8"))
    for (const puzzle of chunk.puzzles ?? chunk) records.push({ puzzle, file })
  }

  lines.push(`## ${theme.replaceAll("-", " ")} M1`, "")
  lines.push(`- Retained: **${records.length}** exercises across **${manifest.files.length}** learner chunks.`)
  lines.push(`- Source manifest: \`${manifest.sourceManifest}\`.`)
  lines.push("")

  for (const file of manifest.files) {
    const chunk = JSON.parse(await readFile(resolve(base, file), "utf8"))
    const puzzles = chunk.puzzles ?? chunk
    const tagCounts = new Map()
    const attackerCounts = new Map()
    for (const puzzle of puzzles) {
      const tags = structuralTags(puzzle)
      const regionTag = tags.find((tag) => tag.startsWith("region:"))
      const attackerTag = tags.find((tag) => tag.startsWith("attacker:"))
      tagCounts.set(regionTag, (tagCounts.get(regionTag) ?? 0) + 1)
      attackerCounts.set(attackerTag, (attackerCounts.get(attackerTag) ?? 0) + 1)
    }
    const summary = (counts) => [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([tag, count]) => `${tag.replace(/^[^:]+:/, "")}: ${count}`).join("; ")
    lines.push(`### Learner chunk ${Number(file.match(/\d+/)?.[0] ?? 0)}`, "")
    lines.push(`- Exercises: ${puzzles.length}; regions: ${summary(tagCounts)}; attackers: ${summary(attackerCounts)}.`, "")
    lines.push("| # | Source chunk / index | Starting FEN | Expected move / solution | Canonical identity | Structural-diversity tags |", "|---:|---|---|---|---|---|")
    puzzles.forEach((puzzle, index) => {
      const source = `${puzzle.chunk ?? "?"} / ${(puzzle.chunkIndex ?? puzzle.positionInChunk ?? "?") + (puzzle.chunkIndex == null ? 0 : 1)}`
      lines.push(`| ${index + 1} | ${markdownCell(source)} | \`${markdownCell(puzzle.fen)}\` | \`${markdownCell(expectedLine(puzzle).join(" "))}\` | \`${markdownCell(canonicalIdentity(puzzle))}\` | ${markdownCell(structuralTags(puzzle).join("; "))} |`)
    })
    lines.push("")
  }
}

await mkdir(dirname(outputPath), { recursive: true })
await writeFile(outputPath, `${lines.join("\n").trimEnd()}\n`, "utf8")
console.log(`Generated ${outputPath}`)
