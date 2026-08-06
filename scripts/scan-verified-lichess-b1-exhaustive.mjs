import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { parse } from 'csv-parse'
import { Chess } from 'chess.js'
import { CSV_COLUMNS, actualStage, parseMoves } from './lib/verified-lichess-csv.mjs'
import { classifyB1Record } from './lib/verified-lichess-b1-validator.mjs'

const root = process.cwd()
const local = path.join(root, 'audit-reports/verified-lichess-tactics-v1')
const csvPath = 'C:/Users/Ariel/chess-trainer/lichess_db_puzzle.csv'
const outputPath = path.join(local, 'exhaustive-b1-structural.ndjson')
const checkpointPath = path.join(local, 'exhaustive-b1-structural-checkpoint.json')
const reportPath = path.join(local, 'exhaustive-b1-structural-summary.json')
const errorPath = path.join(local, 'exhaustive-b1-structural-errors.ndjson')
const resume = process.argv.includes('--resume')
const TYPES = ['Promotion', 'Underpromotion', 'Knight Underpromotion', 'Rook Underpromotion', 'Bishop Underpromotion', 'En Passant']
const B1_TAGS = new Set(['promotion', 'underPromotion', 'enPassant'])
const TOTAL_ROWS = 5751400

const add = (object, key, amount = 1) => { object[key] = (object[key] ?? 0) + amount }
const quantiles = (values) => {
  const sorted = [...values].sort((left, right) => left - right)
  const at = (percentile) => sorted.length ? sorted[Math.round((sorted.length - 1) * percentile)] : null
  return { min: sorted[0] ?? null, p10: at(0.1), p25: at(0.25), median: at(0.5), p75: at(0.75), p90: at(0.9), max: sorted.at(-1) ?? null }
}
const emptyType = () => ({ inspected: 0, structurallyVerified: 0, engineRequired: 0, rejected: 0, EXTRACTABLE_M1: 0, TRUE_M2: 0, NOT_M1_EXTRACTABLE: 0, statusByStage: { STRUCTURALLY_VERIFIED: { EXTRACTABLE_M1: 0, TRUE_M2: 0, NOT_M1_EXTRACTABLE: 0 }, ENGINE_REQUIRED: { EXTRACTABLE_M1: 0, TRUE_M2: 0, NOT_M1_EXTRACTABLE: 0 }, REJECTED: 0 }, rejectedReasons: {}, engineRequiredReasons: {}, checking: 0, nonChecking: 0, capture: 0, nonCapture: 0, ratingValues: [], verifiedFamilies: new Set(), engineRequiredFamilies: new Set() })
const emptyState = () => ({ sourceRowsRead: 0, selectedTaggedRows: 0, emittedSourceIds: 0, duplicateSourceIds: 0, sourceTagCounts: { promotion: 0, underPromotion: 0, enPassant: 0 }, errors: { count: 0, reasons: {} }, types: Object.fromEntries(TYPES.map((type) => [type, emptyType()])), complete: false })
function sourceIdentity() {
  const stat = fs.statSync(csvPath)
  return crypto.createHash('sha256').update(`${stat.size}:${stat.mtimeMs}`).digest('hex')
}
function atomicallyWrite(file, value) {
  const temporary = `${file}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`)
  fs.renameSync(temporary, file)
}
function typesFor(source, finding) {
  if (finding.candidateCategory === 'underpromotion') return finding.label ? ['Underpromotion', finding.label] : ['Underpromotion']
  return [finding.label ?? (finding.candidateCategory === 'enPassant' ? 'En Passant' : 'Promotion')]
}
function tally(target, source, finding) {
  target.inspected += 1
  const rating = Number(source.rating)
  if (Number.isFinite(rating)) target.ratingValues.push(rating)
  if (finding.status === 'STRUCTURALLY_VERIFIED') {
    target.structurallyVerified += 1
    target[finding.extraction] += 1
    target.statusByStage.STRUCTURALLY_VERIFIED[finding.extraction] += 1
    target.verifiedFamilies.add(finding.exactSymmetryFamilyId)
    if (finding.evidence.givesCheck) target.checking += 1
    else target.nonChecking += 1
    if (finding.evidence.capture) target.capture += 1
    else target.nonCapture += 1
  } else if (finding.status === 'ENGINE_REQUIRED') {
    target.engineRequired += 1
    target[finding.extraction] += 1
    target.statusByStage.ENGINE_REQUIRED[finding.extraction] += 1
    target.engineRequiredFamilies.add(finding.exactSymmetryFamilyId)
    add(target.engineRequiredReasons, finding.reason)
    if (finding.evidence.givesCheck) target.checking += 1
    else target.nonChecking += 1
    if (finding.evidence.capture) target.capture += 1
    else target.nonCapture += 1
  } else {
    target.rejected += 1
    target.statusByStage.REJECTED += 1
    add(target.rejectedReasons, finding.reason)
  }
}
function serialiseType(value) {
  const { ratingValues, verifiedFamilies, engineRequiredFamilies, ...rest } = value
  const verifiedM1 = value.EXTRACTABLE_M1
  const verifiedM2 = value.TRUE_M2
  return {
    ...rest,
    rating: quantiles(ratingValues),
    verifiedExactSymmetryFamilies: verifiedFamilies.size,
    engineRequiredExactSymmetryFamilies: engineRequiredFamilies.size,
    proposedM1Capacity: Math.min(100, verifiedM1),
    proposedM2Capacity: Math.min(160, verifiedM2),
    m1ActivationThresholdAttainable: verifiedM1 >= 20,
    m2ActivationThresholdAttainable: verifiedM2 >= 20,
  }
}
function summary(state, identity, complete) {
  return {
    scope: 'EXHAUSTIVE_B1_TAG_SCAN', pipeline: 'verified-lichess-tactics-v1-b1-structural',
    source: csvPath, sourceIdentity: identity, sourceRowsExpected: TOTAL_ROWS,
    sourceRowsRead: state.sourceRowsRead, selectedTaggedRows: state.selectedTaggedRows,
    emittedSourceIds: state.emittedSourceIds, duplicateSourceIds: state.duplicateSourceIds,
    sourceTagCounts: state.sourceTagCounts, errors: state.errors,
    stockfishStarted: false, complete,
    types: Object.fromEntries(TYPES.map((type) => [type, serialiseType(state.types[type])])),
    note: 'Structural status only. ENGINE_REQUIRED is provisional and neither course-ready nor rejected. Every final retained record still requires individual semantic and deterministic Stockfish validation.',
  }
}
function buildRecord(row, moves, tags) {
  const source = new Chess(row.FEN)
  for (const uci of moves) source.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined })
  const displayed = new Chess(row.FEN)
  const pre = displayed.move({ from: moves[0].slice(0, 2), to: moves[0].slice(2, 4), promotion: moves[0][4] || undefined })
  if (!pre) throw new Error('illegal opponent pre-move')
  return {
    sourcePuzzleId: row.PuzzleId, sourceFen: row.FEN, displayedFen: displayed.fen(), preMove: moves[0], sourceM2Line: moves.slice(1),
    sourceStage: actualStage(moves), rating: Number(row.Rating), popularity: Number(row.Popularity), playCount: Number(row.NbPlays), rawLichessTags: tags, sourceGameUrl: row.GameUrl,
  }
}
function rejectedFindings(tags, reason) {
  const out = []
  if (tags.includes('promotion') || tags.includes('underPromotion')) out.push({ kind: 'promotion', candidateCategory: tags.includes('underPromotion') ? 'underpromotion' : 'promotion', status: 'REJECTED', reason })
  if (tags.includes('enPassant')) out.push({ kind: 'enPassant', candidateCategory: 'enPassant', status: 'REJECTED', reason })
  return out
}
async function hydrateOutput() {
  const state = emptyState()
  const seen = new Set()
  if (!fs.existsSync(outputPath)) return { state, seen }
  const lines = readline.createInterface({ input: fs.createReadStream(outputPath), crlfDelay: Infinity })
  for await (const line of lines) {
    if (!line) continue
    const entry = JSON.parse(line)
    const { source, findings } = entry
    if (seen.has(source.sourcePuzzleId)) throw new Error(`Duplicate emitted source identity: ${source.sourcePuzzleId}`)
    seen.add(source.sourcePuzzleId)
    state.emittedSourceIds += 1
    state.selectedTaggedRows += 1
    for (const tag of source.rawLichessTags) if (B1_TAGS.has(tag)) add(state.sourceTagCounts, tag)
    for (const finding of findings) for (const type of typesFor(source, finding)) tally(state.types[type], source, finding)
  }
  return { state, seen }
}
async function main() {
  const identity = sourceIdentity()
  const prior = resume && fs.existsSync(checkpointPath) ? JSON.parse(fs.readFileSync(checkpointPath, 'utf8')) : null
  if (prior && prior.sourceIdentity !== identity) throw new Error('CSV identity changed; refusing to resume')
  if (!resume && (fs.existsSync(outputPath) || fs.existsSync(checkpointPath))) throw new Error('Exhaustive B1 output already exists; use --resume')
  if (resume && fs.existsSync(outputPath) !== fs.existsSync(checkpointPath)) throw new Error('Output/checkpoint mismatch; refusing unsafe append')
  const hydrated = await hydrateOutput()
  const state = hydrated.state
  const seen = hydrated.seen
  const skip = prior?.sourceRowsRead ?? 0
  if (prior && state.emittedSourceIds !== prior.emittedSourceIds) throw new Error('Checkpoint/output emitted identity mismatch; refusing unsafe append')
  const output = fs.createWriteStream(outputPath, { flags: fs.existsSync(outputPath) ? 'a' : 'w' })
  const errors = fs.createWriteStream(errorPath, { flags: fs.existsSync(errorPath) ? 'a' : 'w' })
  const parser = parse({ columns: CSV_COLUMNS, from_line: 2, bom: true })
  fs.createReadStream(csvPath).pipe(parser)
  let rowIndex = 0
  for await (const row of parser) {
    rowIndex += 1
    if (rowIndex <= skip) continue
    state.sourceRowsRead = rowIndex
    const tags = String(row.Themes ?? '').trim().split(/\s+/).filter(Boolean)
    if (!tags.some((tag) => B1_TAGS.has(tag))) {
      if (rowIndex % 5000 === 0) atomicallyWrite(checkpointPath, summary(state, identity, false))
      continue
    }
    if (seen.has(row.PuzzleId)) {
      state.duplicateSourceIds += 1
      if (rowIndex % 5000 === 0) atomicallyWrite(checkpointPath, summary(state, identity, false))
      continue
    }
    const moves = parseMoves(row.Moves)
    let source
    let findings
    try {
      if (moves.length < 2) throw new Error('line is too short to establish a displayed learner position')
      source = buildRecord(row, moves, tags)
      findings = classifyB1Record(source)
    } catch (error) {
      source = { sourcePuzzleId: row.PuzzleId, sourceFen: row.FEN, displayedFen: null, preMove: moves[0] ?? null, sourceM2Line: moves.slice(1), sourceStage: actualStage(moves), rating: Number(row.Rating), popularity: Number(row.Popularity), playCount: Number(row.NbPlays), rawLichessTags: tags, sourceGameUrl: row.GameUrl }
      findings = rejectedFindings(tags, `legal replay failed: ${error.message}`)
      state.errors.count += 1
      add(state.errors.reasons, findings[0]?.reason ?? 'unknown legal replay failure')
      errors.write(`${JSON.stringify({ sourcePuzzleId: row.PuzzleId, reason: findings[0]?.reason, moves })}\n`)
    }
    seen.add(row.PuzzleId)
    state.selectedTaggedRows += 1
    state.emittedSourceIds += 1
    for (const tag of tags) if (B1_TAGS.has(tag)) add(state.sourceTagCounts, tag)
    for (const finding of findings) for (const type of typesFor(source, finding)) tally(state.types[type], source, finding)
    output.write(`${JSON.stringify({ source, findings })}\n`)
    if (rowIndex % 5000 === 0) atomicallyWrite(checkpointPath, summary(state, identity, false))
  }
  await Promise.all([new Promise((resolve) => output.end(resolve)), new Promise((resolve) => errors.end(resolve))])
  state.sourceRowsRead = rowIndex
  state.complete = true
  const finished = summary(state, identity, true)
  atomicallyWrite(checkpointPath, finished)
  atomicallyWrite(reportPath, finished)
  console.log(JSON.stringify(finished, null, 2))
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1 })
