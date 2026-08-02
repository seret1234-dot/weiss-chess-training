import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { FixedDepthStockfish, FORK_SOUNDNESS_CLASSES, FORK_SOUNDNESS_ENGINE, assessForkSoundness, isSoundFork } from "./lib/fork-soundness.mjs"
import { puzzleArray, validateTacticRecord } from "./lib/pattern-tactic-semantic-validator.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const sourceRoot = path.join(root, "public", "data", "pattern-tactics")
const reportPath = path.join(root, "audit-reports", "pattern-tactic-fork-soundness.json")
const themes = ["pawn-fork", "bishop-fork", "knight-fork", "rook-fork", "queen-fork", "king-fork"]
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"))
const sourceId = (raw, fallback) => String(raw.puzzleId ?? raw.lichessId ?? raw.lichess_id ?? raw.PuzzleId ?? raw.id ?? fallback)

const engine = new FixedDepthStockfish()
await engine.init()
const records = []
try {
  for (const theme of themes) for (const stage of [1, 2, 3, 4]) {
    const directory = path.join(sourceRoot, theme, `m${stage}`)
    const manifestPath = path.join(directory, "manifest.json")
    if (!fs.existsSync(manifestPath)) continue
    const manifest = read(manifestPath)
    for (let fileIndex = 0; fileIndex < manifest.files.length; fileIndex += 1) {
      const file = manifest.files[fileIndex]
      const puzzles = puzzleArray(read(path.join(directory, file)))
      for (let sourceIndex = 0; sourceIndex < puzzles.length; sourceIndex += 1) {
        const raw = puzzles[sourceIndex]
        const geometric = validateTacticRecord(raw, theme)
        const base = { theme, stage, sourceFile: file, sourceChunk: fileIndex + 1, sourceIndex, sourceIdentity: sourceId(raw, `${fileIndex + 1}-${sourceIndex}`), fen: raw.fen ?? raw.FEN ?? null, storedLine: geometric.activeLine ?? [] }
        const assessment = geometric.status === "VALID" ? await assessForkSoundness(raw, theme, engine) : { classification: "NOT_GEOMETRIC_FORK", reason: geometric.reason, geometry: geometric }
        records.push({ ...base, ...assessment })
      }
      console.log(`${theme} M${stage}: ${fileIndex + 1}/${manifest.files.length}`)
    }
  }
} finally { engine.quit() }

const byCourse = {}
for (const record of records) {
  const key = `${record.theme}-m${record.stage}`
  const entry = byCourse[key] ??= { theme: record.theme, stage: record.stage, sourceRecords: 0, geometricForks: 0, checkingForks: 0, nonCheckingForks: 0, capturableForks: 0, capturableSound: 0, capturableUnsound: 0, classifications: {}, soundRetained: 0 }
  entry.sourceRecords += 1
  if (record.geometry?.status === "VALID") {
    entry.geometricForks += 1
    if (record.evidence?.checking) entry.checkingForks += 1; else entry.nonCheckingForks += 1
    if (record.evidence?.capturable) entry.capturableForks += 1
    if (record.evidence?.capturable && isSoundFork(record)) entry.capturableSound += 1
    if (record.evidence?.capturable && !isSoundFork(record)) entry.capturableUnsound += 1
  }
  entry.classifications[record.classification] = (entry.classifications[record.classification] ?? 0) + 1
  if (isSoundFork(record)) entry.soundRetained += 1
}
const report = { generatedAt: new Date().toISOString(), engine: FORK_SOUNDNESS_ENGINE, acceptance: { minNetGainPawnEquivalents: 2, exchangeWinQualifies: true, engineDeltaCpCorroboratingOnly: 150 }, courses: Object.values(byCourse), records }
fs.mkdirSync(path.dirname(reportPath), { recursive: true })
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report.courses, null, 2))
