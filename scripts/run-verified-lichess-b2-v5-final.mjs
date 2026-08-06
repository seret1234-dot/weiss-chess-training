import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { classifyB2V5 } from './classify-verified-lichess-b2-v5.mjs'
import { verifyB2Reference } from './lib/verified-lichess-b2-reference.mjs'

const root = process.cwd()
const local = path.join(root, '.local-verified-lichess-tactics-v1')
const input = path.join(local, 'exhaustive-b2-intermezzo.ndjson')
const output = path.join(local, 'b2-v5-final-r3.ndjson')
const checkpoint = path.join(local, 'b2-v5-final-r3-checkpoint.json')
const report = path.join(local, 'b2-v5-final-r3-report.json')
const errors = path.join(local, 'b2-v5-final-r3-errors.ndjson')
const lock = path.join(local, 'b2-v5-final-r3.lock')
const resume = process.argv.includes('--resume')
const flushEvery = 250

const atomicJson = (file, value) => {
  const temporary = `${file}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`)
  fs.renameSync(temporary, file)
}

const hasFinalNewline = (file) => {
  const size = fs.statSync(file).size
  if (!size) return true
  const handle = fs.openSync(file, 'r')
  const byte = Buffer.alloc(1)
  fs.readSync(handle, byte, 0, 1, size - 1)
  fs.closeSync(handle)
  return byte[0] === 10
}

const supportedProduction = (findings) => findings
  .filter((finding) => finding.status === 'MECHANISM_SUPPORTED_ENGINE_REQUIRED')
  .map((finding) => `${finding.key}:${finding.extraction}`)
  .sort()

const supportedReference = (findings) => findings
  .filter((finding) => finding.supported)
  .map((finding) => `${finding.subtype}:${finding.stage}`)
  .sort()

const sameDecision = (production, reference) => {
  const left = supportedProduction(production)
  const right = supportedReference(reference)
  return left.length === right.length && left.every((value, index) => value === right[index])
}

async function readExistingOutput() {
  const seen = new Set()
  const summary = { outputRecords: 0, supportedSources: 0, weakSources: 0, rejectedSources: 0, productionReferenceDisagreements: 0 }
  if (!fs.existsSync(output)) return { seen, summary }
  if (!hasFinalNewline(output)) throw new Error('refusing resume: existing V5 output has a truncated final line')
  const reader = readline.createInterface({ input: fs.createReadStream(output), crlfDelay: Infinity })
  for await (const line of reader) {
    if (!line) continue
    const row = JSON.parse(line)
    const id = row.source?.sourcePuzzleId
    if (!id) throw new Error('refusing resume: V5 output row is missing sourcePuzzleId')
    if (seen.has(id)) throw new Error(`refusing resume: duplicate durable V5 output identity ${id}`)
    seen.add(id)
    summary.outputRecords += 1
    const findings = row.production ?? []
    if (findings.some((finding) => finding.status === 'MECHANISM_SUPPORTED_ENGINE_REQUIRED')) summary.supportedSources += 1
    else if (findings.some((finding) => finding.status === 'REJECTED')) summary.rejectedSources += 1
    else summary.weakSources += 1
    if (!row.agreement) summary.productionReferenceDisagreements += 1
  }
  return { seen, summary }
}

async function main() {
  if (!fs.existsSync(input)) throw new Error(`missing exhaustive B2 input: ${input}`)
  if (!resume && (fs.existsSync(output) || fs.existsSync(checkpoint) || fs.existsSync(report) || fs.existsSync(errors))) {
    throw new Error('V5-final artifacts already exist; use --resume after inspecting them')
  }
  let lockHandle
  try {
    lockHandle = fs.openSync(lock, 'wx')
    fs.writeFileSync(lockHandle, `${process.pid}\n`)
    const existing = resume ? await readExistingOutput() : { seen: new Set(), summary: { outputRecords: 0, supportedSources: 0, weakSources: 0, rejectedSources: 0, productionReferenceDisagreements: 0 } }
    const seen = existing.seen
    const state = {
      version: 'b2-v5-final-r3',
      input: path.basename(input),
      sourceRecords: 0,
      outputRecords: existing.summary.outputRecords,
      supportedSources: existing.summary.supportedSources,
      weakSources: existing.summary.weakSources,
      rejectedSources: existing.summary.rejectedSources,
      productionReferenceDisagreements: existing.summary.productionReferenceDisagreements,
      complete: false,
      startedAt: new Date().toISOString(),
      resumed: resume,
    }
    const writer = fs.createWriteStream(output, { flags: seen.size ? 'a' : 'w' })
    const errorWriter = fs.createWriteStream(errors, { flags: seen.size && fs.existsSync(errors) ? 'a' : 'w' })
    const sourceIds = new Set()
    const reader = readline.createInterface({ input: fs.createReadStream(input), crlfDelay: Infinity })
    for await (const line of reader) {
      if (!line) continue
      const source = JSON.parse(line).source
      const id = source?.sourcePuzzleId
      if (!id) throw new Error('input record missing sourcePuzzleId')
      if (sourceIds.has(id)) throw new Error(`input has duplicate source identity ${id}`)
      sourceIds.add(id)
      state.sourceRecords += 1
      if (seen.has(id)) continue
      const production = classifyB2V5(source)
      const reference = verifyB2Reference(source)
      const agreement = sameDecision(production, reference)
      const supported = supportedProduction(production)
      if (supported.length) state.supportedSources += 1
      else if (production.some((finding) => finding.status === 'REJECTED')) state.rejectedSources += 1
      else state.weakSources += 1
      if (!agreement) {
        state.productionReferenceDisagreements += 1
        errorWriter.write(`${JSON.stringify({ sourcePuzzleId: id, production, reference })}\n`)
      }
      const accepted = writer.write(`${JSON.stringify({ source, production, reference, agreement })}\n`)
      seen.add(id)
      state.outputRecords += 1
      if (state.sourceRecords % flushEvery === 0) {
        if (!accepted) await new Promise((resolve) => writer.once('drain', resolve))
        atomicJson(checkpoint, state)
      }
    }
    await Promise.all([
      new Promise((resolve) => writer.end(resolve)),
      new Promise((resolve) => errorWriter.end(resolve)),
    ])
    if (state.sourceRecords !== seen.size || state.outputRecords !== seen.size) {
      throw new Error(`durable reconciliation failed: input=${state.sourceRecords}, output=${state.outputRecords}, seen=${seen.size}`)
    }
    if (!hasFinalNewline(output)) throw new Error('V5 output final newline validation failed')
    state.complete = true
    state.finishedAt = new Date().toISOString()
    atomicJson(checkpoint, state)
    atomicJson(report, state)
    console.log(JSON.stringify(state, null, 2))
  } finally {
    if (lockHandle !== undefined) fs.closeSync(lockHandle)
    if (fs.existsSync(lock)) fs.unlinkSync(lock)
  }
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1 })
}
