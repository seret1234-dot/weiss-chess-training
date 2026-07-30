import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { Chess } from "chess.js"

const root = process.cwd()
const outputRoot = resolve(root, "public/data/learner-curricula/pattern-mates")
const CHUNK_COUNT = 5
const CHUNK_SIZE = 24

const themes = [
  ["back-rank", "public/data/lichess/mate_in_1/back_rank"],
  ["anastasia", "public/data/lichess/mate_in_1/anastasia"],
  ["arabian", "public/data/pattern-mates/arabian/mate-in-1"],
  ["boden", "public/data/pattern-mates/boden/mate-in-1"],
  ["smothered", "public/data/pattern-mates/smothered/mate-in-1"],
  ["hook", "public/data/pattern-mates/hook/mate-in-1"],
]

const asUci = (value) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, "")
const moveLine = (raw) => {
  if (Array.isArray(raw.solutionLine)) return raw.solutionLine.map(asUci).filter(Boolean)
  if (Array.isArray(raw.moves)) return raw.moves.map(asUci).filter(Boolean)
  if (Array.isArray(raw.solution)) return raw.solution.map(asUci).filter(Boolean)
  if (typeof raw.full_solution === "string") return raw.full_solution.split(/\s+/).map(asUci).filter(Boolean)
  if (typeof raw.solution === "string") return [asUci(raw.solution)].filter(Boolean)
  return []
}

function applyPreMove(fen, preMove) {
  const game = new Chess(fen)
  if (!preMove) return game.fen()
  const uci = asUci(preMove)
  const move = game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || undefined })
  if (!move) throw new Error("Illegal preMove")
  return game.fen()
}

function canonical(raw, displayedFen, solution) {
  const fen = displayedFen.trim().split(/\s+/).slice(0, 4).join(" ")
  const source = raw.lichessId ?? raw.lichess_id ?? raw.PuzzleId ?? raw.localId ?? raw.id ?? ""
  return {
    canonicalIdentity: `${fen}|mate-in-1|${solution.join(",")}|${source}`,
    exactExerciseIdentity: `${fen}|mate-in-1|${solution.join(",")}`,
  }
}

function features(fen, solution, sourceIndex) {
  const [placement] = fen.split(" ")
  const ranks = placement.split("/")
  let blackKing = "?"
  const pieces = []
  ranks.forEach((rank, rankIndex) => {
    let file = 0
    for (const token of rank) {
      if (/\d/.test(token)) file += Number(token)
      else {
        const square = `${"abcdefgh"[file]}${8 - rankIndex}`
        if (token === "k") blackKing = square
        if (!/[pP]/.test(token)) pieces.push(`${token}@${square}`)
        file += 1
      }
    }
  })
  const region = blackKing === "?" ? "?" : `${blackKing[0] < "e" ? "queen" : "king"}-${Number(blackKing[1]) <= 4 ? "low" : "high"}`
  return {
    firstMove: solution[0] ?? "",
    blackKing,
    region,
    geometry: pieces.sort().join(","),
    sourceBand: Math.min(CHUNK_COUNT - 1, Math.floor(sourceIndex * CHUNK_COUNT)),
  }
}

function stableHash(value) {
  let hash = 2166136261
  for (const char of value) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function pickCurated(candidates, theme) {
  const remaining = [...candidates].sort((a, b) => stableHash(`${theme}:${a.canonical}`).toString().localeCompare(stableHash(`${theme}:${b.canonical}`).toString()))
  const selected = []
  const seen = new Set()
  const counts = { firstMove: new Map(), blackKing: new Map(), region: new Map(), geometry: new Map(), sourceBand: new Map() }
  const increment = (key, value) => counts[key].set(value, (counts[key].get(value) ?? 0) + 1)

  while (selected.length < CHUNK_SIZE && remaining.length) {
    const desiredBand = selected.length % CHUNK_COUNT
    let bestIndex = -1
    let bestScore = -Infinity
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index]
      if (seen.has(candidate.canonical)) continue
      const f = candidate.features
      const score =
        (f.sourceBand === desiredBand ? 80 : 0) +
        40 / (1 + (counts.firstMove.get(f.firstMove) ?? 0)) +
        30 / (1 + (counts.blackKing.get(f.blackKing) ?? 0)) +
        24 / (1 + (counts.region.get(f.region) ?? 0)) +
        20 / (1 + (counts.geometry.get(f.geometry) ?? 0)) +
        12 / (1 + (counts.sourceBand.get(f.sourceBand) ?? 0))
      if (score > bestScore) {
        bestScore = score
        bestIndex = index
      }
    }
    if (bestIndex < 0) break
    const [next] = remaining.splice(bestIndex, 1)
    selected.push(next)
    seen.add(next.canonical)
    increment("firstMove", next.features.firstMove)
    increment("blackKing", next.features.blackKing)
    increment("region", next.features.region)
    increment("geometry", next.features.geometry)
    increment("sourceBand", next.features.sourceBand)
  }
  return selected
}

for (const [theme, relativeSource] of themes) {
  const sourceRoot = resolve(root, relativeSource)
  const manifest = JSON.parse(await readFile(resolve(sourceRoot, "manifest.json"), "utf8"))
  const raw = []
  for (let sourceChunkIndex = 0; sourceChunkIndex < manifest.files.length; sourceChunkIndex += 1) {
    const file = manifest.files[sourceChunkIndex]
    const source = JSON.parse(await readFile(resolve(sourceRoot, file), "utf8"))
    const rows = Array.isArray(source) ? source : source.puzzles ?? []
    rows.forEach((row, sourcePuzzleIndex) => raw.push({ row, sourceChunkIndex, sourcePuzzleIndex }))
  }
  const unique = new Map()
  for (let sourceIndex = 0; sourceIndex < raw.length; sourceIndex += 1) {
    const entry = raw[sourceIndex]
    try {
      const fen = entry.row.fen ?? entry.row.FEN
      const solution = moveLine(entry.row)
      if (!fen || !solution.length) continue
      const displayedFen = applyPreMove(fen, entry.row.preMove)
      const identities = canonical(entry.row, displayedFen, solution)
      if (!unique.has(identities.exactExerciseIdentity)) unique.set(identities.exactExerciseIdentity, {
        ...entry,
        canonical: identities.canonicalIdentity,
        features: features(displayedFen, solution, sourceIndex / Math.max(1, raw.length)),
      })
    } catch {
      // Existing source data remains untouched; malformed entries are excluded
      // from this learner-facing projection and remain in the legacy pool.
    }
  }
  const candidates = [...unique.values()]
  const used = new Set()
  const rebuilt = []
  for (let chunkIndex = 0; chunkIndex < CHUNK_COUNT; chunkIndex += 1) {
    const available = candidates.filter((candidate) => !used.has(candidate.canonical))
    const chosen = pickCurated(available, `${theme}:${chunkIndex}`)
    chosen.forEach((candidate) => used.add(candidate.canonical))
    rebuilt.push(chosen)
  }
  const target = resolve(outputRoot, `${theme}-m1-v1`)
  await rm(target, { recursive: true, force: true })
  await mkdir(target, { recursive: true })
  const files = []
  for (let chunkIndex = 0; chunkIndex < rebuilt.length; chunkIndex += 1) {
    const file = `chunk-${String(chunkIndex + 1).padStart(3, "0")}.json`
    files.push(file)
    await writeFile(resolve(target, file), `${JSON.stringify({ puzzles: rebuilt[chunkIndex].map((candidate) => candidate.row) }, null, 2)}\n`)
  }
  await writeFile(resolve(target, "manifest.json"), `${JSON.stringify({
    schemaVersion: 1,
    curriculumVersion: "pattern-mate-m1-v1",
    category: "mates",
    theme,
    objective: "mate-in-1",
    totalPuzzles: rebuilt.reduce((total, chunk) => total + chunk.length, 0),
    chunkSize: CHUNK_SIZE,
    totalChunks: CHUNK_COUNT,
    files,
    sourceManifest: `${relativeSource}/manifest.json`,
  }, null, 2)}\n`)
  console.log(`${theme}: ${rebuilt.map((chunk) => chunk.length).join(" + ")} = ${rebuilt.reduce((total, chunk) => total + chunk.length, 0)}`)
}
