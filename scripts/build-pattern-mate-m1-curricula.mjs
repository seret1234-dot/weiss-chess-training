import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { Chess } from "chess.js"

const root = process.cwd()
const outputRoot = resolve(root, "public/data/learner-curricula/pattern-mates")
const CHUNK_COUNT = 5
const DEFAULT_CHUNK_SIZE = 24

const themes = [
  { theme: "back-rank", source: "public/data/lichess/mate_in_1/back_rank", chunkSize: 24 },
  { theme: "anastasia", source: "public/data/lichess/mate_in_1/anastasia", chunkSize: 24 },
  { theme: "arabian", source: "public/data/pattern-mates/arabian/mate-in-1", chunkSize: 24 },
  { theme: "boden", source: "public/data/pattern-mates/boden/mate-in-1", chunkSize: 24 },
  { theme: "smothered", source: "public/data/pattern-mates/smothered/mate-in-1", chunkSize: 24 },
  { theme: "hook", source: "public/data/pattern-mates/hook/mate-in-1", chunkSize: 24 },
  { theme: "kill-box", source: "public/data/pattern-mates/kill-box/mate-in-1", chunkSize: 20 },
  { theme: "dovetail", source: "public/data/pattern-mates/dovetail/mate-in-1", chunkSize: 20 },
  { theme: "double-bishop", source: "public/data/pattern-mates/double-bishop/mate-in-1", chunkSize: 20 },
]

const requestedThemes = process.argv
  .find((value) => value.startsWith("--themes="))
  ?.slice("--themes=".length)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean)
const selectedThemes = requestedThemes?.length
  ? themes.filter((definition) => requestedThemes.includes(definition.theme))
  : themes

if (requestedThemes?.some((theme) => !themes.some((definition) => definition.theme === theme))) {
  throw new Error(`Unknown M1 curriculum theme: ${requestedThemes.join(", ")}`)
}

const files = "abcdefgh"
const asUci = (value) => String(value ?? "").trim().toLowerCase().replace(/\s+/g, "")
const stableHash = (value) => {
  let hash = 2166136261
  for (const char of value) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
const stableCompare = (seed, left, right) =>
  stableHash(`${seed}|${left}`) - stableHash(`${seed}|${right}`) || left.localeCompare(right)

function moveLine(raw) {
  if (Array.isArray(raw.solutionLine)) return raw.solutionLine.map(asUci).filter(Boolean)
  if (Array.isArray(raw.moves)) return raw.moves.map(asUci).filter(Boolean)
  if (Array.isArray(raw.solution)) return raw.solution.map(asUci).filter(Boolean)
  if (typeof raw.full_solution === "string") return raw.full_solution.split(/\s+/).map(asUci).filter(Boolean)
  if (typeof raw.solution === "string") return [asUci(raw.solution)].filter(Boolean)
  return []
}

function uciMove(game, uci) {
  return game.move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.slice(4, 5) || undefined,
  })
}

function expectedUserMove(raw) {
  const line = moveLine(raw)
  const preMove = asUci(raw.preMove)
  return line.find((move) => move !== preMove) ?? ""
}

function displayedGame(raw) {
  const game = new Chess(raw.fen ?? raw.FEN)
  if (raw.preMove && !uciMove(game, asUci(raw.preMove))) throw new Error("Illegal preMove")
  return game
}

function squareToPoint(square) {
  return [files.indexOf(square[0]), Number(square[1]) - 1]
}

function pointToSquare([file, rank]) {
  return `${files[file]}${rank + 1}`
}

const transforms = [
  ["identity", ([x, y]) => [x, y]],
  ["mirror-files", ([x, y]) => [7 - x, y]],
  ["mirror-ranks", ([x, y]) => [x, 7 - y]],
  ["rotate-180", ([x, y]) => [7 - x, 7 - y]],
  ["transpose", ([x, y]) => [y, x]],
  ["transpose-mirror", ([x, y]) => [7 - y, x]],
  ["anti-transpose", ([x, y]) => [y, 7 - x]],
  ["anti-transpose-mirror", ([x, y]) => [7 - y, 7 - x]],
]

function kingSquare(game, color) {
  for (const rank of "12345678") {
    for (const file of files) {
      const square = `${file}${rank}`
      const piece = game.get(square)
      if (piece?.type === "k" && piece.color === color) return square
    }
  }
  throw new Error("Missing king")
}

function relativeKey(transform, point, origin) {
  const [x, y] = transform(point)
  const [ox, oy] = transform(origin)
  return `${x - ox},${y - oy}`
}

function pieceRole(piece, attackerColor) {
  return `${piece.color === attackerColor ? "A" : "D"}${piece.type.toUpperCase()}`
}

function enemyKingEnclosure(finalGame, attackerColor, defenderKing) {
  const [kingFile, kingRank] = squareToPoint(defenderKing)
  const rows = []
  for (let fileOffset = -1; fileOffset <= 1; fileOffset += 1) {
    for (let rankOffset = -1; rankOffset <= 1; rankOffset += 1) {
      if (fileOffset === 0 && rankOffset === 0) continue
      const file = kingFile + fileOffset
      const rank = kingRank + rankOffset
      if (file < 0 || file > 7 || rank < 0 || rank > 7) {
        rows.push({ point: [file, rank], status: "edge" })
        continue
      }
      const square = pointToSquare([file, rank])
      const occupant = finalGame.get(square)
      const attacked = finalGame.isAttacked(square, attackerColor)
      rows.push({
        point: [file, rank],
        status: `${occupant ? pieceRole(occupant, attackerColor) : "empty"}:${attacked ? "controlled" : "free"}`,
      })
    }
  }
  return rows
}

function pedagogicalFeatures(raw, sourceChunkIndex, sourcePuzzleIndex, sourceChunkCount) {
  const game = displayedGame(raw)
  const expected = expectedUserMove(raw)
  if (!expected) throw new Error("Missing expected M1 move")
  const move = uciMove(game, expected)
  if (!move || !game.isCheckmate()) throw new Error("Expected move is not legal checkmate")

  const finalGame = game
  const attackerColor = move.color
  const defenderColor = attackerColor === "w" ? "b" : "w"
  const defenderKing = kingSquare(finalGame, defenderColor)
  const matingFrom = move.from
  const matingTo = move.to
  const nearbyPieces = []
  for (const rank of "12345678") {
    for (const file of files) {
      const square = `${file}${rank}`
      const piece = finalGame.get(square)
      if (!piece || square === defenderKing) continue
      const [pieceFile, pieceRank] = squareToPoint(square)
      const [kingFile, kingRank] = squareToPoint(defenderKing)
      const distance = Math.max(Math.abs(pieceFile - kingFile), Math.abs(pieceRank - kingRank))
      if (distance <= (piece.type === "p" ? 2 : 3)) {
        nearbyPieces.push({ square, role: pieceRole(piece, attackerColor) })
      }
    }
  }
  const enclosure = enemyKingEnclosure(finalGame, attackerColor, defenderKing)
  const kingPoint = squareToPoint(defenderKing)
  const fromPoint = squareToPoint(matingFrom)
  const toPoint = squareToPoint(matingTo)

  const variants = transforms.map(([symmetry, transform]) => {
    const moveVector = `${relativeKey(transform, fromPoint, kingPoint)}>${relativeKey(transform, toPoint, kingPoint)}`
    const localPieces = nearbyPieces
      .map((entry) => `${entry.role}@${relativeKey(transform, squareToPoint(entry.square), kingPoint)}`)
      .sort()
      .join(",")
    const escapes = enclosure
      .map((entry) => `${relativeKey(transform, entry.point, kingPoint)}:${entry.status}`)
      .sort()
      .join(",")
    return {
      symmetry,
      key: `mate:${move.piece.toUpperCase()}|move:${moveVector}|escape:${escapes}|blockers:${localPieces}`,
    }
  }).sort((left, right) => left.key.localeCompare(right.key))
  const canonicalVariant = variants[0]
  const displayedFen = finalGame.undo() && game.fen().split(/\s+/).slice(0, 4).join(" ")
  // `undo()` returned us to the exact post-preMove position. It is safe to
  // derive tags from the saved values above, then verify legality separately.
  const sourceIdentity = String(raw.puzzleId ?? raw.lichessId ?? raw.lichess_id ?? raw.PuzzleId ?? raw.localId ?? raw.id ?? "")
  const exactExerciseIdentity = `${displayedFen}|mate-in-1|${expected}`
  const canonicalIdentity = `${exactExerciseIdentity}|${sourceIdentity}`
  const kingFile = defenderKing[0]
  const kingRank = Number(defenderKing[1])
  const region = `${kingFile < "d" ? "queenside" : kingFile > "e" ? "kingside" : "center"}-${kingRank <= 3 ? "low" : kingRank >= 6 ? "high" : "middle"}`
  const blockers = nearbyPieces.filter((entry) => entry.role.startsWith("D")).length
  const controlledEscapes = enclosure.filter((entry) => entry.status.endsWith(":controlled")).length
  return {
    displayedFen,
    expected,
    canonicalIdentity,
    exactExerciseIdentity,
    pedagogicalFamily: canonicalVariant.key,
    symmetry: canonicalVariant.symmetry,
    diversityTags: [
      `mating-side:${attackerColor === "w" ? "white" : "black"}`,
      `mating-piece:${move.piece.toUpperCase()}`,
      `mating-destination:${matingTo}`,
      `king-region:${region}`,
      `defender-blockers:${blockers}`,
      `controlled-escapes:${controlledEscapes}`,
      `solution:${move.san}`,
    ],
    sourceBand: Math.min(CHUNK_COUNT - 1, Math.floor((sourceChunkIndex * CHUNK_COUNT) / Math.max(1, sourceChunkCount))),
    sourceChunkIndex,
    sourcePuzzleIndex,
  }
}

function pickCurated(candidates, theme, chunkSize) {
  const remaining = [...candidates].sort((left, right) => stableCompare(theme, left.features.canonicalIdentity, right.features.canonicalIdentity))
  const selected = []
  const usedCanonical = new Set()
  const familyCounts = new Map()
  const tagCounts = new Map()
  const sourceBandCounts = new Map()
  const recentFamilies = []

  for (let chunkIndex = 0; chunkIndex < CHUNK_COUNT; chunkIndex += 1) {
    const chunk = []
    const chunkFamilies = new Set()
    while (chunk.length < chunkSize && remaining.length > 0) {
      const alternatives = remaining.filter((candidate) => !usedCanonical.has(candidate.features.canonicalIdentity))
      const alternativesOutsideFamily = alternatives.filter((candidate) => !chunkFamilies.has(candidate.features.pedagogicalFamily))
      const familyPool = alternativesOutsideFamily.length > 0 ? alternativesOutsideFamily : alternatives
      const alternativesOutsideRecent = familyPool.filter((candidate) => !recentFamilies.includes(candidate.features.pedagogicalFamily))
      const pool = alternativesOutsideRecent.length > 0 ? alternativesOutsideRecent : familyPool
      let best = null
      let bestScore = -Infinity
      for (const candidate of pool) {
        const f = candidate.features
        const familyCount = familyCounts.get(f.pedagogicalFamily) ?? 0
        const tagDiversity = f.diversityTags.reduce((score, tag) => score + 18 / (1 + (tagCounts.get(tag) ?? 0)), 0)
        const score =
          (familyCount === 0 ? 1200 : -260 * familyCount) +
          (f.sourceBand === chunkIndex ? 60 : 0) +
          24 / (1 + (sourceBandCounts.get(f.sourceBand) ?? 0)) +
          tagDiversity
        if (!best || score > bestScore || (score === bestScore && stableCompare(`${theme}:${chunkIndex}:${chunk.length}`, f.canonicalIdentity, best.features.canonicalIdentity) < 0)) {
          best = candidate
          bestScore = score
        }
      }
      if (!best) break
      remaining.splice(remaining.indexOf(best), 1)
      usedCanonical.add(best.features.canonicalIdentity)
      familyCounts.set(best.features.pedagogicalFamily, (familyCounts.get(best.features.pedagogicalFamily) ?? 0) + 1)
      sourceBandCounts.set(best.features.sourceBand, (sourceBandCounts.get(best.features.sourceBand) ?? 0) + 1)
      best.features.diversityTags.forEach((tag) => tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1))
      recentFamilies.push(best.features.pedagogicalFamily)
      if (recentFamilies.length > 3) recentFamilies.shift()
      chunkFamilies.add(best.features.pedagogicalFamily)
      chunk.push(best)
    }
    selected.push(chunk)
  }
  return { chunks: selected, familyCounts }
}

for (const definition of selectedThemes) {
  const sourceRoot = resolve(root, definition.source)
  const manifest = JSON.parse(await readFile(resolve(sourceRoot, "manifest.json"), "utf8"))
  const sourceRows = []
  for (let sourceChunkIndex = 0; sourceChunkIndex < manifest.files.length; sourceChunkIndex += 1) {
    const source = JSON.parse(await readFile(resolve(sourceRoot, manifest.files[sourceChunkIndex]), "utf8"))
    for (const [sourcePuzzleIndex, row] of (Array.isArray(source) ? source : source.puzzles ?? []).entries()) {
      sourceRows.push({ row, sourceChunkIndex, sourcePuzzleIndex })
    }
  }

  const exact = new Map()
  const familyPool = new Map()
  const uniqueDisplayedFens = new Set()
  for (const entry of sourceRows) {
    try {
      const features = pedagogicalFeatures(entry.row, entry.sourceChunkIndex, entry.sourcePuzzleIndex, manifest.files.length)
      uniqueDisplayedFens.add(features.displayedFen)
      if (!exact.has(features.exactExerciseIdentity)) {
        const candidate = { ...entry, features }
        exact.set(features.exactExerciseIdentity, candidate)
        if (!familyPool.has(features.pedagogicalFamily)) familyPool.set(features.pedagogicalFamily, [])
        familyPool.get(features.pedagogicalFamily).push(candidate)
      }
    } catch {
      // Invalid timelines remain available only in their retained legacy pool.
    }
  }

  const { chunks, familyCounts } = pickCurated([...exact.values()], definition.theme, definition.chunkSize ?? DEFAULT_CHUNK_SIZE)
  if (chunks.some((chunk) => chunk.length !== definition.chunkSize)) {
    throw new Error(`${definition.theme} has insufficient legal diverse M1 candidates for ${CHUNK_COUNT} x ${definition.chunkSize}`)
  }
  const target = resolve(outputRoot, `${definition.theme}-m1-v1`)
  await rm(target, { recursive: true, force: true })
  await mkdir(target, { recursive: true })
  const files = []
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    const file = `chunk-${String(chunkIndex + 1).padStart(3, "0")}.json`
    files.push(file)
    const puzzles = chunks[chunkIndex].map((candidate) => ({
      ...candidate.row,
      learnerCurriculum: {
        version: "m1-v1",
        sourceChunkIndex: candidate.features.sourceChunkIndex,
        sourcePuzzleIndex: candidate.features.sourcePuzzleIndex,
        canonicalIdentity: candidate.features.canonicalIdentity,
        pedagogicalFamily: candidate.features.pedagogicalFamily,
        symmetry: candidate.features.symmetry,
        diversityTags: candidate.features.diversityTags,
        retainedReason: (familyCounts.get(candidate.features.pedagogicalFamily) ?? 0) === 1
          ? "Unique pedagogical family selected for structural variety"
          : "Best legal remaining representative after family, symmetry, and board-structure balancing",
      },
      pedagogicalFamily: candidate.features.pedagogicalFamily,
    }))
    await writeFile(resolve(target, file), `${JSON.stringify({ puzzles }, null, 2)}\n`)
  }
  const largestFamilies = [...familyPool.entries()]
    .map(([family, entries]) => ({ family, sourcePositions: entries.length }))
    .sort((left, right) => right.sourcePositions - left.sourcePositions || left.family.localeCompare(right.family))
    .slice(0, 10)
  await writeFile(resolve(target, "manifest.json"), `${JSON.stringify({
    schemaVersion: 1,
    curriculumVersion: "pattern-mate-m1-v1",
    category: "mates",
    theme: definition.theme,
    objective: "mate-in-1",
    totalPuzzles: chunks.flat().length,
    chunkSize: definition.chunkSize,
    totalChunks: CHUNK_COUNT,
    files,
    sourceManifest: `${definition.source}/manifest.json`,
    sourceStatistics: {
      sourcePositions: sourceRows.length,
      exactFenUnique: uniqueDisplayedFens.size,
      exactExerciseUnique: exact.size,
      pedagogicalFamilyCount: familyPool.size,
      retainedFamilyCount: familyCounts.size,
      largestPedagogicalFamilies: largestFamilies,
    },
  }, null, 2)}\n`)
  console.log(`${definition.theme}: ${chunks.map((chunk) => chunk.length).join(" + ")} = ${chunks.flat().length}; ${familyPool.size} pedagogical families`)
}
