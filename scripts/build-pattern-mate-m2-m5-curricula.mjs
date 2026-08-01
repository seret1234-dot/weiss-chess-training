import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { Chess } from "chess.js"

const root = process.cwd()
const outputRoot = resolve(root, "public/data/learner-curricula/pattern-mates")
const DEFAULT_CHUNK_SIZE = 20
const MAX_CHUNKS = 8
const files = "abcdefgh"
const labels = {
  "back-rank": "Back Rank", anastasia: "Anastasia", arabian: "Arabian", boden: "Boden",
  smothered: "Smothered", hook: "Hook", "kill-box": "Kill Box", dovetail: "Dovetail", "double-bishop": "Double Bishop",
}
const asUci = (value) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, "")
const stableHash = (value) => {
  let hash = 2166136261
  for (const char of value) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619) }
  return hash >>> 0
}
const stableCompare = (seed, left, right) => stableHash(`${seed}|${left}`) - stableHash(`${seed}|${right}`) || left.localeCompare(right)
const sourcePath = (theme, distance) => `/data/pattern-mates/${theme}/mate-in-${distance}`
const definition = (entry) => ({ ...entry, version: `m${entry.mateDistance}-v1`, learner: `/data/learner-curricula/pattern-mates/${entry.theme}-m${entry.mateDistance}-v1` })

const definitions = [
  definition({ trainerKey: "anastasia-mate-2", theme: "anastasia", mateDistance: 2, source: "/data/lichess/mate_in_2/anastasia" }),
  definition({ trainerKey: "back-rank-mate-2", theme: "back-rank", mateDistance: 2, source: sourcePath("back-rank", 2) }),
  definition({ trainerKey: "arabian-mate-2", theme: "arabian", mateDistance: 2, source: sourcePath("arabian", 2) }),
  definition({ trainerKey: "boden-mate-2", theme: "boden", mateDistance: 2, source: sourcePath("boden", 2) }),
  definition({ trainerKey: "smothered-mate-2", theme: "smothered", mateDistance: 2, source: sourcePath("smothered", 2) }),
  definition({ trainerKey: "hook-mate-2", theme: "hook", mateDistance: 2, source: sourcePath("hook", 2) }),
  definition({ trainerKey: "kill-box-mate-2", theme: "kill-box", mateDistance: 2, source: sourcePath("kill-box", 2) }),
  definition({ trainerKey: "dovetail-mate-2", theme: "dovetail", mateDistance: 2, source: sourcePath("dovetail", 2) }),
  definition({ trainerKey: "double-bishop-mate-2", theme: "double-bishop", mateDistance: 2, source: sourcePath("double-bishop", 2) }),
  definition({ trainerKey: "anastasia-mate-in-3", theme: "anastasia", mateDistance: 3, source: "/data/lichess/mate_in_3/anastasia" }),
  definition({ trainerKey: "back-rank-mate-3", theme: "back-rank", mateDistance: 3, source: sourcePath("back-rank", 3) }),
  definition({ trainerKey: "arabian-mate-3", theme: "arabian", mateDistance: 3, source: sourcePath("arabian", 3) }),
  definition({ trainerKey: "boden-mate-3", theme: "boden", mateDistance: 3, source: sourcePath("boden", 3) }),
  definition({ trainerKey: "smothered-mate-3", theme: "smothered", mateDistance: 3, source: sourcePath("smothered", 3) }),
  definition({ trainerKey: "hook-mate-3", theme: "hook", mateDistance: 3, source: sourcePath("hook", 3) }),
  definition({ trainerKey: "kill-box-mate-3", theme: "kill-box", mateDistance: 3, source: sourcePath("kill-box", 3) }),
  definition({ trainerKey: "dovetail-mate-3", theme: "dovetail", mateDistance: 3, source: sourcePath("dovetail", 3) }),
  definition({ trainerKey: "double-bishop-mate-3-plus", theme: "double-bishop", mateDistance: 3, source: sourcePath("double-bishop", 3) }),
  definition({ trainerKey: "anastasia-mate-in-4", theme: "anastasia", mateDistance: 4, source: "/data/lichess/mate_in_4/anastasia" }),
  definition({ trainerKey: "back-rank-mate-4", theme: "back-rank", mateDistance: 4, source: sourcePath("back-rank", 4) }),
  definition({ trainerKey: "arabian-mate-4", theme: "arabian", mateDistance: 4, source: sourcePath("arabian", 4) }),
  definition({ trainerKey: "smothered-mate-4", theme: "smothered", mateDistance: 4, source: sourcePath("smothered", 4) }),
  definition({ trainerKey: "hook-mate-4", theme: "hook", mateDistance: 4, source: sourcePath("hook", 4) }),
  definition({ trainerKey: "kill-box-mate-4", theme: "kill-box", mateDistance: 4, source: sourcePath("kill-box", 4) }),
  definition({ trainerKey: "dovetail-mate-4", theme: "dovetail", mateDistance: 4, source: sourcePath("dovetail", 4) }),
  definition({ trainerKey: "anastasia-mate-in-5", theme: "anastasia", mateDistance: 5, source: "/data/lichess/mate_in_5/anastasia" }),
  definition({ trainerKey: "back-rank-mate-5", theme: "back-rank", mateDistance: 5, source: sourcePath("back-rank", 5) }),
  definition({ trainerKey: "arabian-mate-5", theme: "arabian", mateDistance: 5, source: sourcePath("arabian", 5) }),
  definition({ trainerKey: "hook-mate-5", theme: "hook", mateDistance: 5, source: sourcePath("hook", 5) }),
  definition({ trainerKey: "kill-box-mate-5", theme: "kill-box", mateDistance: 5, source: sourcePath("kill-box", 5) }),
  definition({ trainerKey: "dovetail-mate-5", theme: "dovetail", mateDistance: 5, source: sourcePath("dovetail", 5) }),
]
const requested = process.argv.find((value) => value.startsWith("--stages="))?.slice(9)?.split(",").map(Number)
const selectedDefinitions = requested?.length ? definitions.filter((entry) => requested.includes(entry.mateDistance)) : definitions

function lineFor(raw) {
  if (Array.isArray(raw.solutionLine)) return raw.solutionLine.map(asUci).filter(Boolean)
  if (Array.isArray(raw.moves)) return raw.moves.map(asUci).filter(Boolean)
  if (Array.isArray(raw.solution)) return raw.solution.map(asUci).filter(Boolean)
  if (typeof raw.full_solution === "string") return raw.full_solution.split(/\s+/).map(asUci).filter(Boolean)
  if (typeof raw.solution === "string") return [asUci(raw.solution)].filter(Boolean)
  return []
}
function move(game, uci) {
  return game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || undefined })
}
function point(square) { return [files.indexOf(square[0]), Number(square[1]) - 1] }
function relative([x, y], [ox, oy]) { return `${x - ox},${y - oy}` }
const transforms = [
  ["identity", ([x, y]) => [x, y]], ["mirror-files", ([x, y]) => [7 - x, y]], ["mirror-ranks", ([x, y]) => [x, 7 - y]], ["rotate-180", ([x, y]) => [7 - x, 7 - y]],
  ["transpose", ([x, y]) => [y, x]], ["transpose-mirror", ([x, y]) => [7 - y, x]], ["anti-transpose", ([x, y]) => [y, 7 - x]], ["anti-transpose-mirror", ([x, y]) => [7 - y, 7 - x]],
]
function kingSquare(game, color) {
  for (const rank of "12345678") for (const file of files) if (game.get(`${file}${rank}`)?.type === "k" && game.get(`${file}${rank}`)?.color === color) return `${file}${rank}`
  throw new Error("missing king")
}
function rawTags(raw) {
  return [...new Set([raw.theme, raw.subtheme, raw.Themes, raw.sourceTheme, raw.sourceThemeTag, ...(raw.themes ?? []), ...(raw.sourceThemeKeys ?? [])].map((value) => String(value ?? "").trim()).filter(Boolean))]
}
function feature(raw, entry, sourceChunkIndex, sourcePuzzleIndex, sourceChunkCount) {
  const fullLine = lineFor(raw)
  const preMove = asUci(raw.preMove)
  const activeLine = preMove && fullLine[0] === preMove ? fullLine.slice(1) : fullLine
  if (!activeLine.length) throw new Error("missing solution line")
  const displayed = new Chess(raw.fen ?? raw.FEN)
  if (preMove && !move(displayed, preMove)) throw new Error("illegal preMove")
  const displayedFen = displayed.fen().split(/\s+/).slice(0, 4).join(" ")
  let firstMove = null
  let finalMove = null
  for (const uci of activeLine) {
    const applied = move(displayed, uci)
    if (!applied) throw new Error(`illegal solution move ${uci}`)
    if (!firstMove) firstMove = applied
    finalMove = applied
  }
  if (!displayed.isCheckmate()) throw new Error("solution line does not end in checkmate")
  const attacker = finalMove.color
  const defender = attacker === "w" ? "b" : "w"
  const king = kingSquare(displayed, defender)
  const kingPoint = point(king)
  const nearby = []
  for (const rank of "12345678") for (const file of files) {
    const square = `${file}${rank}`; const piece = displayed.get(square)
    if (!piece || square === king) continue
    const [x, y] = point(square); const [kx, ky] = kingPoint
    if (Math.max(Math.abs(x - kx), Math.abs(y - ky)) <= (piece.type === "p" ? 2 : 3)) nearby.push({ square, role: `${piece.color === attacker ? "A" : "D"}${piece.type.toUpperCase()}` })
  }
  const escape = []
  for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) {
    if (!dx && !dy) continue
    const [kx, ky] = kingPoint; const x = kx + dx; const y = ky + dy
    if (x < 0 || x > 7 || y < 0 || y > 7) { escape.push({ p: [x, y], v: "edge" }); continue }
    const square = `${files[x]}${y + 1}`; const occupant = displayed.get(square)
    escape.push({ p: [x, y], v: `${occupant ? `${occupant.color === attacker ? "A" : "D"}${occupant.type.toUpperCase()}` : "empty"}:${displayed.isAttacked(square, attacker) ? "controlled" : "free"}` })
  }
  const variants = transforms.map(([symmetry, transform]) => {
    const tKing = transform(kingPoint)
    const vector = (moveResult) => `${relative(transform(point(moveResult.from)), tKing)}>${relative(transform(point(moveResult.to)), tKing)}`
    const pieces = nearby.map((item) => `${item.role}@${relative(transform(point(item.square)), tKing)}`).sort().join(",")
    const escapes = escape.map((item) => `${relative(transform(item.p), tKing)}:${item.v}`).sort().join(",")
    return { symmetry, key: `first:${firstMove.piece.toUpperCase()}:${vector(firstMove)}|final:${finalMove.piece.toUpperCase()}:${vector(finalMove)}|line:${activeLine.length}|escape:${escapes}|near:${pieces}` }
  }).sort((a, b) => a.key.localeCompare(b.key))
  const sourceIdentity = String(raw.puzzleId ?? raw.lichessId ?? raw.lichess_id ?? raw.PuzzleId ?? raw.localId ?? raw.id ?? "")
  const exactExerciseIdentity = `${displayedFen}|mate-in-${entry.mateDistance}|${activeLine.join(",")}`
  const [file, rank] = point(king)
  const region = `${file < 3 ? "queenside" : file > 4 ? "kingside" : "center"}-${rank < 3 ? "low" : rank > 4 ? "high" : "middle"}`
  return {
    displayedFen, activeLine, exactExerciseIdentity, canonicalIdentity: `${exactExerciseIdentity}|${sourceIdentity}`,
    pedagogicalFamily: variants[0].key, symmetry: variants[0].symmetry, sourceChunkIndex, sourcePuzzleIndex,
    sourceBand: Math.min(MAX_CHUNKS - 1, Math.floor((sourceChunkIndex * MAX_CHUNKS) / Math.max(1, sourceChunkCount))),
    diversityTags: [`king-region:${region}`, `first-move:${firstMove.san}`, `final-mating-piece:${finalMove.piece.toUpperCase()}`, `final-mating-square:${finalMove.to}`, `line-plies:${activeLine.length}`, `defender-nearby:${nearby.filter((item) => item.role.startsWith("D")).length}`],
  }
}
function curate(candidates, entry, chunkCount) {
  const remaining = [...candidates].sort((a, b) => stableCompare(entry.trainerKey, a.features.canonicalIdentity, b.features.canonicalIdentity))
  const selected = []; const usedExact = new Set(); const familyCounts = new Map(); const tagCounts = new Map(); const bands = new Map(); const recentFamilies = []
  for (let chunkIndex = 0; chunkIndex < chunkCount; chunkIndex += 1) {
    const chunk = []; const chunkFamilies = new Set()
    while (chunk.length < entry.activeChunkSize && remaining.length) {
      const unique = remaining.filter((candidate) => !usedExact.has(candidate.features.exactExerciseIdentity))
      const outsideChunkFamily = unique.filter((candidate) => !chunkFamilies.has(candidate.features.pedagogicalFamily))
      const familyPool = outsideChunkFamily.length ? outsideChunkFamily : unique
      const outsideRecent = familyPool.filter((candidate) => !recentFamilies.includes(candidate.features.pedagogicalFamily))
      const pool = outsideRecent.length ? outsideRecent : familyPool
      let best; let bestScore = -Infinity
      for (const candidate of pool) {
        const f = candidate.features
        const score = (familyCounts.has(f.pedagogicalFamily) ? -260 * familyCounts.get(f.pedagogicalFamily) : 1200)
          + (f.sourceBand === chunkIndex ? 60 : 0) + 24 / (1 + (bands.get(f.sourceBand) ?? 0))
          + f.diversityTags.reduce((sum, tag) => sum + 18 / (1 + (tagCounts.get(tag) ?? 0)), 0)
        if (!best || score > bestScore || (score === bestScore && stableCompare(`${entry.trainerKey}:${chunkIndex}:${chunk.length}`, f.canonicalIdentity, best.features.canonicalIdentity) < 0)) { best = candidate; bestScore = score }
      }
      if (!best) break
      remaining.splice(remaining.indexOf(best), 1); usedExact.add(best.features.exactExerciseIdentity)
      familyCounts.set(best.features.pedagogicalFamily, (familyCounts.get(best.features.pedagogicalFamily) ?? 0) + 1)
      bands.set(best.features.sourceBand, (bands.get(best.features.sourceBand) ?? 0) + 1)
      best.features.diversityTags.forEach((tag) => tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1))
      recentFamilies.push(best.features.pedagogicalFamily); if (recentFamilies.length > 3) recentFamilies.shift(); chunkFamilies.add(best.features.pedagogicalFamily); chunk.push(best)
    }
    selected.push(chunk)
  }
  return { chunks: selected, familyCounts }
}

for (const entry of selectedDefinitions) {
  const sourceRoot = resolve(root, `public${entry.source}`); const manifest = JSON.parse(await readFile(resolve(sourceRoot, "manifest.json"), "utf8"))
  const sourceRows = []
  for (let sourceChunkIndex = 0; sourceChunkIndex < manifest.files.length; sourceChunkIndex += 1) {
    const chunk = JSON.parse(await readFile(resolve(sourceRoot, manifest.files[sourceChunkIndex]), "utf8"))
    for (const [sourcePuzzleIndex, raw] of (Array.isArray(chunk) ? chunk : chunk.puzzles ?? []).entries()) sourceRows.push({ raw, sourceChunkIndex, sourcePuzzleIndex })
  }
  const exact = new Map(); const families = new Map(); const fens = new Set(); let legalRecords = 0; const rejected = new Map()
  for (const source of sourceRows) try {
    const features = feature(source.raw, entry, source.sourceChunkIndex, source.sourcePuzzleIndex, manifest.files.length); legalRecords += 1; fens.add(features.displayedFen)
    if (!exact.has(features.exactExerciseIdentity)) { const candidate = { ...source, features }; exact.set(features.exactExerciseIdentity, candidate); if (!families.has(features.pedagogicalFamily)) families.set(features.pedagogicalFamily, []); families.get(features.pedagogicalFamily).push(candidate) }
  } catch (error) { const reason = error instanceof Error ? error.message : "invalid"; rejected.set(reason, (rejected.get(reason) ?? 0) + 1) }
  const available = exact.size; const chunkCount = available >= DEFAULT_CHUNK_SIZE ? Math.min(MAX_CHUNKS, Math.floor(available / DEFAULT_CHUNK_SIZE)) : (available ? 1 : 0)
  const activeChunkSize = available >= DEFAULT_CHUNK_SIZE ? DEFAULT_CHUNK_SIZE : available
  if (!chunkCount) throw new Error(`${entry.trainerKey} has no legal complete mating lines`)
  entry.activeChunkSize = activeChunkSize
  const { chunks, familyCounts } = curate([...exact.values()], entry, chunkCount)
  if (chunks.some((chunk) => chunk.length !== activeChunkSize)) throw new Error(`${entry.trainerKey} could not fill its deterministic learner chunks`)
  const target = resolve(root, `public${entry.learner}`); await rm(target, { recursive: true, force: true }); await mkdir(target, { recursive: true })
  const outputFiles = []
  for (let index = 0; index < chunks.length; index += 1) {
    const file = `chunk-${String(index + 1).padStart(3, "0")}.json`; outputFiles.push(file)
    const puzzles = chunks[index].map((candidate) => ({ ...candidate.raw, canonicalThemeKey: entry.theme, canonicalThemeLabel: labels[entry.theme], rawTags: rawTags(candidate.raw), pedagogicalFamily: candidate.features.pedagogicalFamily, learnerCurriculum: {
      version: entry.version, mateDistance: entry.mateDistance, sourceChunkIndex: candidate.features.sourceChunkIndex, sourcePuzzleIndex: candidate.features.sourcePuzzleIndex,
      canonicalIdentity: candidate.features.canonicalIdentity, pedagogicalFamily: candidate.features.pedagogicalFamily, symmetry: candidate.features.symmetry, diversityTags: candidate.features.diversityTags,
      retainedReason: (familyCounts.get(candidate.features.pedagogicalFamily) ?? 0) === 1 ? "Unique legal pedagogical family selected for structural variety" : "Best legal remaining representative after family, symmetry, and board-structure balancing",
    } }))
    await writeFile(resolve(target, file), `${JSON.stringify({ puzzles }, null, 2)}\n`)
  }
  const largest = [...families.entries()].map(([family, rows]) => ({ family, sourcePositions: rows.length })).sort((a, b) => b.sourcePositions - a.sourcePositions || a.family.localeCompare(b.family)).slice(0, 10)
  const exception = chunkCount < MAX_CHUNKS ? `Source provides ${available} legal unique lines; ${chunkCount} learner chunk${chunkCount === 1 ? "" : "s"} retained at ${activeChunkSize} exercises each instead of the normal 8 x 20.` : null
  await writeFile(resolve(target, "manifest.json"), `${JSON.stringify({ schemaVersion: 1, curriculumVersion: `pattern-mate-${entry.version}`, category: "mates", theme: entry.theme, mateDistance: entry.mateDistance, objective: `mate-in-${entry.mateDistance}`, totalPuzzles: chunks.flat().length, chunkSize: activeChunkSize, totalChunks: chunkCount, files: outputFiles, sourceManifest: `${entry.source}/manifest.json`, exception, legacyMapping: "Deterministic contiguous source-chunk bands map to learner chunks; original progress rows remain immutable.", sourceStatistics: { sourceChunks: manifest.files.length, sourcePositions: sourceRows.length, legalRecords, exactFenUnique: fens.size, exactExerciseUnique: exact.size, pedagogicalFamilyCount: families.size, retainedFamilyCount: familyCounts.size, rejected: Object.fromEntries([...rejected.entries()].sort()), largestPedagogicalFamilies: largest } }, null, 2)}\n`)
  console.log(`${entry.trainerKey}: ${chunks.map((chunk) => chunk.length).join(" + ")} = ${chunks.flat().length}; legal ${legalRecords}/${sourceRows.length}; families ${families.size}${exception ? " [exception]" : ""}`)
}
