import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { classifyXrayR2 } from './lib/verified-lichess-xray-r2.mjs'

const root = process.cwd(), local = path.join(root, '.local-verified-lichess-tactics-v1')
const input = path.join(local, 'b3-tagged-exhaustive.ndjson')
// Preserve the incomplete first R2 attempt as diagnostic evidence.  The final
// run uses a fresh namespace and the retry-safe Windows atomic writer.
const output = path.join(local, 'b3-xray-r2-final.ndjson')
const checkpoint = path.join(local, 'b3-xray-r2-final-checkpoint.json')
const report = path.join(local, 'b3-xray-r2-final-report.json')
const errors = path.join(local, 'b3-xray-r2-final-errors.ndjson')
const lock = path.join(local, 'b3-xray-r2-final.lock')
const add = (object, key) => { object[key] = (object[key] ?? 0) + 1 }
const q = (values) => { const sorted = [...values].sort((a, b) => a - b), at = (n) => sorted.length ? sorted[Math.round((sorted.length - 1) * n)] : null; return { min: sorted[0] ?? null, p10: at(.1), p25: at(.25), median: at(.5), p75: at(.75), p90: at(.9), max: sorted.at(-1) ?? null } }
const atomic = (file, value) => {
  const temporary = `${file}.${process.pid}.tmp`
  fs.rmSync(temporary, { force: true })
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`)
  let failure = null
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try { fs.renameSync(temporary, file); return } catch (error) {
      failure = error
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150 * (attempt + 1))
    }
  }
  throw failure
}
const typeState = () => ({ raw: 0, focused: 0, engineRequired: 0, weak: 0, rejected: 0, extraction: {}, reasons: {}, directMate: 0, cleanup: 0, competing: {}, ambiguous: 0, presentBefore: 0, laterStage: 0, families: new Set(), ratings: [] })
const fresh = () => ({ pipeline: 'verified-lichess-b3-xray-r2', input, rowsRead: 0, emitted: 0, errors: 0, types: { 'X-Ray Attack': typeState(), 'X-Ray Defense': typeState() }, complete: false, stockfishStarted: false })
const serial = (state) => ({ ...state, types: Object.fromEntries(Object.entries(state.types).map(([label, value]) => { const { families, ratings, ...plain } = value; return [label, { ...plain, exactSymmetryFamilies: families.size, rating: q(ratings) }] })) })
function tally(state, source, finding) { const target = state.types[finding.label]; target.raw += 1; target.ratings.push(Number(source.rating)); if (finding.status === 'ENGINE_REQUIRED') { target.focused += 1; target.engineRequired += 1 } else if (finding.status === 'WEAK_TAG_ONLY') target.weak += 1; else target.rejected += 1; if (finding.extraction) add(target.extraction, finding.extraction); add(target.reasons, finding.reason); if (finding.reason?.startsWith('direct-mate:')) target.directMate += 1; if (finding.reason?.startsWith('cleanup-only:')) target.cleanup += 1; if (finding.reason?.startsWith('competing-primary:')) { target.ambiguous += 1; add(target.competing, finding.reason.slice('competing-primary: '.length)) } if (finding.reason?.startsWith('primary-ambiguous:')) target.ambiguous += 1; if (finding.reason?.includes('motif-present-before') || finding.reason?.includes('motif-onset-failed')) target.presentBefore += 1; if (finding.extraction === 'NOT_M1_EXTRACTABLE') target.laterStage += 1; if (finding.exactSymmetryFamilyId && finding.status === 'ENGINE_REQUIRED') target.families.add(finding.exactSymmetryFamilyId) }
async function main() {
  if (fs.existsSync(lock)) throw new Error('X-Ray R2 writer lock exists')
  if ([output, checkpoint, report, errors].some(fs.existsSync)) throw new Error('X-Ray R2 artifacts already exist; refusing overwrite')
  fs.writeFileSync(lock, `${process.pid}\n`)
  try {
    const state = fresh(), seen = new Set(), stream = fs.createWriteStream(output), errorStream = fs.createWriteStream(errors)
    for await (const line of readline.createInterface({ input: fs.createReadStream(input), crlfDelay: Infinity })) {
      if (!line) continue
      state.rowsRead += 1
      const source = JSON.parse(line)
      if (!(source.rawLichessTags ?? []).includes('xRayAttack')) continue
      if (!seen.add(source.sourcePuzzleId)) throw new Error(`duplicate case-sensitive X-Ray source identity: ${source.sourcePuzzleId}`)
      try { for (const finding of classifyXrayR2(source)) { tally(state, source, finding); state.emitted += 1; stream.write(`${JSON.stringify({ source, finding })}\n`) } } catch (error) { state.errors += 1; errorStream.write(`${JSON.stringify({ sourcePuzzleId: source.sourcePuzzleId, reason: error.message })}\n`) }
      if (state.rowsRead % 5000 === 0) atomic(checkpoint, serial(state))
    }
    await Promise.all([new Promise((resolve) => stream.end(resolve)), new Promise((resolve) => errorStream.end(resolve))])
    state.complete = true; atomic(checkpoint, serial(state)); atomic(report, serial(state)); console.log(JSON.stringify(serial(state), null, 2))
  } finally { fs.rmSync(lock, { force: true }) }
}
main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1 })
