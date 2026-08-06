import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { parse } from 'csv-parse'
import { Chess } from 'chess.js'
import { CSV_COLUMNS, actualStage, parseMoves } from './lib/verified-lichess-csv.mjs'
import { ATOMIC_TAXONOMY_VERSION, rawTags, candidateAtomicThemes } from './lib/verified-lichess-atomic-taxonomy.mjs'

const root = process.cwd(), csvPath = process.env.LICHESS_CSV ?? 'C:/Users/Ariel/chess-trainer/lichess_db_puzzle.csv', localRoot = path.join(root, 'audit-reports/verified-lichess-tactics-v1')
const spoolPath = path.join(localRoot, 'atomic-m2-candidates.ndjson'), checkpointPath = path.join(localRoot, 'atomic-m2-candidates-checkpoint.json'), resume = process.argv.includes('--resume')
const move = (uci) => ({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] })
const write = (value) => fs.writeFileSync(checkpointPath, `${JSON.stringify(value, null, 2)}\n`)
async function main() {
  const stat = fs.statSync(csvPath), identity = crypto.createHash('sha256').update(`${stat.size}:${stat.mtimeMs}`).digest('hex')
  const prior = resume && fs.existsSync(checkpointPath) ? JSON.parse(fs.readFileSync(checkpointPath, 'utf8')) : null
  if (prior && prior.sourceIdentity !== identity) throw new Error('CSV identity changed; refusing to resume')
  const state = prior?.state ?? { rowsProcessed: 0, actualM2: 0, rawCandidates: 0, legalCandidates: 0, rejected: {} }, skip = state.rowsProcessed
  if (!resume) fs.rmSync(spoolPath, { force: true })
  // A crash can occur after an append but before the next 10k checkpoint. On resume,
  // retain the existing source identities so replaying that small trailing range cannot
  // create duplicate spool records.
  const existingIds = resume && fs.existsSync(spoolPath)
    ? new Set(fs.readFileSync(spoolPath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line).sourcePuzzleId))
    : new Set()
  const output = fs.createWriteStream(spoolPath, { flags: 'a' }), parser = parse({ columns: CSV_COLUMNS, from_line: 2, bom: true }); fs.createReadStream(csvPath).pipe(parser)
  let sourceRow = 0
  for await (const row of parser) {
    sourceRow += 1; if (sourceRow <= skip) continue; state.rowsProcessed += 1
    if (state.rowsProcessed % 10000 === 0) write({ taxonomyVersion: ATOMIC_TAXONOMY_VERSION, sourceIdentity: identity, resumeStrategy: 'row-skip read-only CSV', state, complete: false })
    const tags = rawTags(row), candidates = candidateAtomicThemes(tags); if (!candidates.length) continue
    const moves = parseMoves(row.Moves); if (actualStage(moves) !== 2) continue; state.actualM2 += 1; state.rawCandidates += 1
    try { const game = new Chess(row.FEN); for (const uci of moves) if (!game.move(move(uci))) throw new Error(`illegal ${uci}`); const display = new Chess(row.FEN); display.move(move(moves[0])); if (!existingIds.has(row.PuzzleId)) { output.write(`${JSON.stringify({ taxonomyVersion: ATOMIC_TAXONOMY_VERSION, sourcePuzzleId: row.PuzzleId, sourceFen: row.FEN, displayedFen: display.fen(), preMove: moves[0], sourceM2Line: moves.slice(1), rating: Number(row.Rating), popularity: Number(row.Popularity), playCount: Number(row.NbPlays), rawLichessTags: tags, candidateAtomicThemes: candidates, sourceGameUrl: row.GameUrl })}\n`); existingIds.add(row.PuzzleId) }; state.legalCandidates += 1 } catch (error) { state.rejected.illegal = (state.rejected.illegal ?? 0) + 1 }
  }
  await new Promise((resolve) => output.end(resolve)); write({ taxonomyVersion: ATOMIC_TAXONOMY_VERSION, sourceIdentity: identity, resumeStrategy: 'row-skip read-only CSV', state, complete: true }); console.log(JSON.stringify({ ...state, checkpointPath, spoolPath }, null, 2))
}
main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1 })
