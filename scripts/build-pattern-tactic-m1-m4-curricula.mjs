import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { Chess } from "chess.js"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const sourceRoot = path.join(root, "public", "data", "pattern-tactics")
const outputRoot = path.join(root, "public", "data", "learner-curricula", "pattern-tactics")
const chunkSize = 20
const stageTargets = { 1: 5, 2: 8, 3: 8, 4: 8 }
const m2ExcludedThemes = new Set(["king-fork", "vulnerable-king"])
const requestedStage = Number(process.env.TACTIC_STAGE ?? 0)
const requestedThemes = new Set(String(process.env.TACTIC_THEMES ?? "").split(",").map((theme) => theme.trim()).filter(Boolean))
const buildMixedOnly = process.env.TACTIC_BUILD_MIXED_ONLY === "1"

function titleCase(value) {
  const special = {
    "attacking-f2-f7": "Attacking f2/f7",
    "en-passant": "En passant",
    "other-xray": "Other X-Ray",
    "queen-xray": "Queen X-Ray",
    "rook-xray": "Rook X-Ray",
    "bishop-xray": "Bishop X-Ray",
  }
  return special[value] ?? value.split("-").map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`).join(" ")
}

function normalizeUci(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, "")
}

function parseUci(uci) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.slice(4, 5) || undefined }
}

function puzzleArray(value) {
  return Array.isArray(value) ? value : Array.isArray(value?.puzzles) ? value.puzzles : []
}

function solutionLine(raw) {
  if (Array.isArray(raw.solutionLine)) return raw.solutionLine.map(normalizeUci).filter(Boolean)
  if (Array.isArray(raw.moves)) return raw.moves.map(normalizeUci).filter(Boolean)
  if (typeof raw.full_solution === "string") return raw.full_solution.split(/\s+/).map(normalizeUci).filter(Boolean)
  if (typeof raw.Moves === "string") return raw.Moves.split(/\s+/).map(normalizeUci).filter(Boolean)
  if (Array.isArray(raw.solution)) return raw.solution.map(normalizeUci).filter(Boolean)
  const single = normalizeUci(typeof raw.solution === "string" ? raw.solution : raw.solution_move)
  return single ? [single] : []
}

function displayedFen(fen, preMove) {
  const game = new Chess(fen)
  if (preMove) game.move(parseUci(preMove))
  return game.fen().split(/\s+/).slice(0, 4).join(" ")
}

function rawTags(raw) {
  const values = [raw.themes, raw.sourceThemeKeys, raw.sourceThemes, raw.theme, raw.subtheme, raw.label]
  return [...new Set(values.flatMap((value) => Array.isArray(value) ? value : [value])
    .map((value) => String(value ?? "").trim())
    .filter(Boolean))]
}

function squareCoords(square) {
  return [square.charCodeAt(0) - 97, Number(square[1]) - 1]
}

function transformCoord([x, y], transform) {
  if (transform === "identity") return [x, y]
  if (transform === "mirror-file") return [7 - x, y]
  if (transform === "mirror-rank") return [x, 7 - y]
  if (transform === "rotate-180") return [7 - x, 7 - y]
  if (transform === "transpose") return [y, x]
  if (transform === "transpose-mirror") return [7 - y, x]
  if (transform === "anti-transpose") return [y, 7 - x]
  return [7 - y, 7 - x]
}

const transforms = ["identity", "mirror-file", "mirror-rank", "rotate-180", "transpose", "transpose-mirror", "anti-transpose", "anti-rotate"]

function moveSignature(move, gameBefore, transform) {
  const moving = gameBefore.get(move.from)
  const captured = gameBefore.get(move.to)
  const [fromX, fromY] = transformCoord(squareCoords(move.from), transform)
  const [toX, toY] = transformCoord(squareCoords(move.to), transform)
  return `${moving?.color ?? "?"}${moving?.type ?? "?"}:${toX - fromX},${toY - fromY}:${captured?.type ?? "-"}:${move.promotion ?? "-"}`
}

function tacticalFeatures(fen, preMove, line, canonicalThemeKey) {
  const game = new Chess(fen)
  if (preMove) game.move(parseUci(preMove))
  const initial = game.fen()
  const options = transforms.map((transform) => {
    const replay = new Chess(initial)
    const signature = []
    const tags = []
    for (const uci of line) {
      const move = parseUci(uci)
      const before = replay.fen()
      const moveObject = replay.move(move)
      if (!moveObject) throw new Error(`Illegal stored move ${uci}`)
      signature.push(moveSignature({ ...moveObject, promotion: move.promotion }, new Chess(before), transform))
      if (moveObject.captured) tags.push(`capture:${moveObject.captured}`)
      if (replay.isCheck()) tags.push("check")
      if (replay.isCheckmate()) tags.push("mate")
    }
    const board = new Chess(initial).board().flatMap((rank, rankIndex) => rank.flatMap((piece, fileIndex) => {
      if (!piece || piece.type === "p") return []
      const [x, y] = transformCoord([fileIndex, 7 - rankIndex], transform)
      return [`${piece.color}${piece.type}@${x},${y}`]
    })).sort().join(",")
    return { transform, family: `${canonicalThemeKey}|pieces:${board}|line:${signature.join(">")}|outcome:${[...new Set(tags)].sort().join(",")}` }
  })
  options.sort((left, right) => left.family.localeCompare(right.family) || left.transform.localeCompare(right.transform))
  const gameForTags = new Chess(initial)
  const first = parseUci(line[0])
  const moving = gameForTags.get(first.from)
  const firstMove = gameForTags.move(first)
  const king = gameForTags.board().flatMap((rank, rankIndex) => rank.flatMap((piece, fileIndex) => piece?.type === "k" && piece.color === gameForTags.turn() ? [`${fileIndex < 4 ? "queen" : "king"}-${rankIndex < 4 ? "side" : "side"}`] : []))[0] ?? "unknown"
  return {
    pedagogicalFamily: options[0].family,
    symmetry: options[0].transform,
    diversityTags: [
      `first-piece:${moving?.type ?? "unknown"}`,
      `first-from:${first.from}`,
      `first-to:${first.to}`,
      `king-region:${king}`,
      `line-length:${line.length}`,
      `first-capture:${firstMove?.captured ?? "none"}`,
    ],
  }
}

function validate(raw, sourceChunkIndex, sourcePuzzleIndex, theme, tacticDistance) {
  const fen = String(raw.fen ?? raw.FEN ?? "")
  const preMove = normalizeUci(raw.preMove)
  const originalLine = solutionLine(raw)
  if (!fen || !originalLine.length) return { rejected: "missing FEN or stored solution" }
  try {
    const game = new Chess(fen)
    if (preMove) game.move(parseUci(preMove))
    const activeLine = preMove && originalLine[0] === preMove ? originalLine.slice(1) : originalLine
    if (!activeLine.length) return { rejected: "stored solution contains only the preMove" }
    for (const uci of activeLine) game.move(parseUci(uci))
    const displayed = displayedFen(fen, preMove || undefined)
    const sourceIdentity = String(raw.puzzleId ?? raw.lichessId ?? raw.lichess_id ?? raw.PuzzleId ?? raw.id ?? `${theme}-m${tacticDistance}-${sourceChunkIndex}-${sourcePuzzleIndex}`)
    const canonicalIdentity = `${displayed}|tactic-in-${tacticDistance}|${activeLine.join(",")}|${sourceIdentity}`
    const exactExerciseIdentity = `${displayed}|tactic-in-${tacticDistance}|${activeLine.join(",")}`
    return {
      candidate: {
        raw,
        sourceChunkIndex,
        sourcePuzzleIndex,
        sourceIdentity,
        canonicalIdentity,
        exactExerciseIdentity,
        displayed,
        activeLine,
        features: tacticalFeatures(fen, preMove || undefined, activeLine, theme),
        tags: rawTags(raw),
      },
    }
  } catch (error) {
    return { rejected: error instanceof Error ? error.message.replace(/\.$/, "") : "illegal FEN or stored solution" }
  }
}

function stableHash(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function stableSort(seed, left, right) {
  return stableHash(`${seed}|${left.sourceIdentity}`) - stableHash(`${seed}|${right.sourceIdentity}`)
    || left.sourceIdentity.localeCompare(right.sourceIdentity)
}

function curate(candidates, activeChunkCount, theme, tacticDistance) {
  const exactSeen = new Set()
  const unique = candidates.filter((candidate) => {
    if (exactSeen.has(candidate.exactExerciseIdentity)) return false
    exactSeen.add(candidate.exactExerciseIdentity)
    return true
  }).sort((left, right) => stableSort(`${theme}|m${tacticDistance}`, left, right))
  const target = Math.min(unique.length, activeChunkCount * chunkSize)
  const selected = []
  const selectedFamilies = []
  const remaining = [...unique]
  while (selected.length < target && remaining.length) {
    const recentFamilies = new Set(selectedFamilies.slice(-3))
    const unusedFamily = remaining.filter((candidate) => !selectedFamilies.includes(candidate.features.pedagogicalFamily))
    const eligible = unusedFamily.length ? unusedFamily : remaining.filter((candidate) => !recentFamilies.has(candidate.features.pedagogicalFamily))
    const candidate = (eligible.length ? eligible : remaining)[0]
    selected.push(candidate)
    selectedFamilies.push(candidate.features.pedagogicalFamily)
    remaining.splice(remaining.indexOf(candidate), 1)
  }
  return selected
}

function chunkItems(items, count) {
  return Array.from({ length: count }, (_, index) => items.slice(index * chunkSize, (index + 1) * chunkSize))
    .filter((chunk) => chunk.length)
}

function outputPuzzle(candidate, theme, tacticDistance, learnerChunkIndex, orderInChunk) {
  return {
    ...candidate.raw,
    canonicalThemeKey: theme,
    canonicalThemeLabel: titleCase(theme),
    rawTags: candidate.tags,
    pedagogicalFamily: candidate.features.pedagogicalFamily,
    learnerCurriculum: {
      version: `m${tacticDistance}-v1`,
      tacticDistance,
      learnerChunk: learnerChunkIndex + 1,
      sourceChunk: candidate.sourceChunkIndex + 1,
      sourceIndex: candidate.sourcePuzzleIndex,
      sourceIdentity: candidate.sourceIdentity,
      canonicalIdentity: candidate.canonicalIdentity,
      pedagogicalFamily: candidate.features.pedagogicalFamily,
      symmetry: candidate.features.symmetry,
      diversityTags: candidate.features.diversityTags,
      retainedReason: "Deterministic full-pool selection with exact-identity deduplication and pedagogical-family spacing.",
      orderInChunk,
    },
  }
}

function processCourse(theme, tacticDistance) {
  const sourceDir = path.join(sourceRoot, theme, `m${tacticDistance}`)
  const manifest = JSON.parse(fs.readFileSync(path.join(sourceDir, "manifest.json"), "utf8"))
  const sourceChunks = manifest.files ?? []
  const candidates = []
  const rejected = new Map()
  sourceChunks.forEach((file, sourceChunkIndex) => {
    const puzzles = puzzleArray(JSON.parse(fs.readFileSync(path.join(sourceDir, file), "utf8")))
    puzzles.forEach((raw, sourcePuzzleIndex) => {
      const result = validate(raw, sourceChunkIndex, sourcePuzzleIndex, theme, tacticDistance)
      if (result.candidate) candidates.push(result.candidate)
      else rejected.set(result.rejected, (rejected.get(result.rejected) ?? 0) + 1)
    })
  })
  const requestedChunks = stageTargets[tacticDistance]
  const distinctExerciseCount = new Set(candidates.map((candidate) => candidate.exactExerciseIdentity)).size
  const activeChunkCount = Math.min(requestedChunks, Math.floor(distinctExerciseCount / chunkSize))
  if (!activeChunkCount) throw new Error(`${theme} m${tacticDistance} has no legal 20-exercise learner chunk`)
  const retained = curate(candidates, activeChunkCount, theme, tacticDistance)
  const chunks = chunkItems(retained, activeChunkCount)
  const outputDir = path.join(outputRoot, `${theme}-m${tacticDistance}-v1`)
  fs.rmSync(outputDir, { recursive: true, force: true })
  fs.mkdirSync(outputDir, { recursive: true })
  const familyCounts = new Map()
  for (const candidate of candidates) familyCounts.set(candidate.features.pedagogicalFamily, (familyCounts.get(candidate.features.pedagogicalFamily) ?? 0) + 1)
  const files = chunks.map((chunk, learnerChunkIndex) => {
    const file = `chunk-${String(learnerChunkIndex + 1).padStart(3, "0")}.json`
    fs.writeFileSync(path.join(outputDir, file), `${JSON.stringify({ puzzles: chunk.map((candidate, orderInChunk) => outputPuzzle(candidate, theme, tacticDistance, learnerChunkIndex, orderInChunk)) }, null, 2)}\n`)
    return file
  })
  const exception = activeChunkCount < requestedChunks
    ? `Source provides ${distinctExerciseCount} legal unique tactic identities; ${activeChunkCount} learner chunks retained at ${chunkSize} exercises each instead of the normal ${requestedChunks} x ${chunkSize}.`
    : null
  const outputManifest = {
    schemaVersion: 1,
    curriculumVersion: `pattern-tactic-m${tacticDistance}-v1`,
    category: "tactics",
    theme,
    canonicalThemeKey: theme,
    canonicalThemeLabel: titleCase(theme),
    tacticDistance,
    objective: `tactic-in-${tacticDistance}`,
    totalPuzzles: retained.length,
    chunkSize,
    totalChunks: chunks.length,
    files,
    sourceManifest: `/data/pattern-tactics/${theme}/m${tacticDistance}/manifest.json`,
    exception,
    legacyMapping: "Deterministic contiguous source-chunk bands map to learner chunks; original progress rows remain immutable.",
    sourceStatistics: {
      sourceChunks: sourceChunks.length,
      sourcePositions: candidates.length + [...rejected.values()].reduce((total, count) => total + count, 0),
      legalRecords: candidates.length,
      exactFenUnique: new Set(candidates.map((candidate) => candidate.displayed)).size,
      exactExerciseUnique: distinctExerciseCount,
      pedagogicalFamilyCount: familyCounts.size,
      retainedFamilyCount: new Set(retained.map((candidate) => candidate.features.pedagogicalFamily)).size,
      rejected: Object.fromEntries([...rejected.entries()].sort(([left], [right]) => left.localeCompare(right))),
      largestPedagogicalFamilies: [...familyCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])).slice(0, 10).map(([family, sourcePositions]) => ({ family, sourcePositions })),
    },
  }
  fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify(outputManifest, null, 2)}\n`)
  return { theme, tacticDistance, sourceChunks: sourceChunks.length, sourcePositions: outputManifest.sourceStatistics.sourcePositions, legalRecords: candidates.length, exactExerciseUnique: distinctExerciseCount, pedagogicalFamilyCount: familyCounts.size, retained: retained.length, chunks: chunks.length, exception, rejected: outputManifest.sourceStatistics.rejected }
}

function buildMixedCourse(tacticDistance) {
  const themes = fs.readdirSync(sourceRoot)
    .filter((theme) => theme !== "mixed" && fs.existsSync(path.join(sourceRoot, theme, `m${tacticDistance}`, "manifest.json")))
    .sort()
  const puzzles = themes.flatMap((theme) => {
    const courseDir = path.join(outputRoot, `${theme}-m${tacticDistance}-v1`)
    const manifestPath = path.join(courseDir, "manifest.json")
    if (!fs.existsSync(manifestPath)) return []
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    return manifest.files.flatMap((file) => puzzleArray(JSON.parse(fs.readFileSync(path.join(courseDir, file), "utf8"))))
  })
  const outputDir = path.join(outputRoot, `mixed-m${tacticDistance}-v1`)
  fs.rmSync(outputDir, { recursive: true, force: true })
  fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(path.join(outputDir, "chunk-001.json"), `${JSON.stringify({ puzzles }, null, 2)}\n`)
  fs.writeFileSync(path.join(outputDir, "manifest.json"), `${JSON.stringify({
    schemaVersion: 1,
    curriculumVersion: `pattern-tactic-mixed-m${tacticDistance}-v1`,
    category: "tactics",
    theme: "mixed",
    tacticDistance,
    totalPuzzles: puzzles.length,
    totalChunks: 1,
    chunkSize: puzzles.length,
    files: ["chunk-001.json"],
    sourceThemes: themes,
    note: "Complete curated focused learner pools; sessions are deterministically selected at runtime.",
  }, null, 2)}\n`)
}

const report = []
for (const tacticDistance of [1, 2, 3, 4]) {
  if (requestedStage && tacticDistance !== requestedStage) continue
  const themes = fs.readdirSync(sourceRoot).filter((theme) => theme !== "mixed" && fs.existsSync(path.join(sourceRoot, theme, `m${tacticDistance}`, "manifest.json"))).sort()
  for (const theme of themes) {
    if (buildMixedOnly) continue
    if (requestedThemes.size && !requestedThemes.has(theme)) continue
    report.push(processCourse(theme, tacticDistance))
  }
  if (!requestedThemes.size || buildMixedOnly) buildMixedCourse(tacticDistance)
}
console.log(JSON.stringify(report, null, 2))
