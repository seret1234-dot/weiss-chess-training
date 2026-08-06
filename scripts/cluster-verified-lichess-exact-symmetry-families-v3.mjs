import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { once } from 'node:events'
import { exactFamilyIdentifiers } from './lib/verified-lichess-exact-symmetry-family-v3.mjs'

const root = process.cwd()
const local = path.join(root, 'audit-reports/verified-lichess-tactics-v1')
const input = path.join(local, 'atomic-m2-structural-v2.ndjson')
const structuralCheckpoint = path.join(local, 'atomic-m2-structural-v2-checkpoint.json')
const output = path.join(local, 'atomic-m2-exact-symmetry-family-ids-v3.ndjson')
const checkpointPath = path.join(local, 'atomic-m2-exact-symmetry-family-v3-checkpoint.json')
const reportPath = path.join(local, 'atomic-m2-exact-symmetry-family-v3-report.json')
const BATCH = 5_000
const expected = Object.values(JSON.parse(fs.readFileSync(structuralCheckpoint, 'utf8')).counts.verifiedPrimary).reduce((sum, count) => sum + count, 0)
const expectedInput = JSON.parse(fs.readFileSync(structuralCheckpoint, 'utf8')).individualRecordsAfterExactDedup

const add = (map, key, amount = 1) => map.set(key, (map.get(key) ?? 0) + amount)
const addObject = (object, key, amount = 1) => { object[key] = (object[key] ?? 0) + amount }
const bucket = (size) => size === 1 ? '1' : size <= 3 ? '2-3' : size <= 10 ? '4-10' : size <= 50 ? '11-50' : '51+'
const atomicWrite = (target, value) => {
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`)
  fs.renameSync(temporary, target)
}
const readCheckpoint = () => fs.existsSync(checkpointPath) ? JSON.parse(fs.readFileSync(checkpointPath, 'utf8')) : null

function outputItem(record, ids) {
  return {
    canonicalIdentity: record.canonicalIdentity,
    sourcePuzzleId: record.sourcePuzzleId,
    displayedFen: record.displayedFen,
    primaryTheme: ids.canonicalThemeKey,
    canonicalSubtype: ids.canonicalSubtype,
    extraction: ids.extraction,
    exactSymmetryFamilyId: ids.exactSymmetryFamilyId,
    pedagogicalFamilyId: ids.pedagogicalFamilyId,
    transformsConsidered: ids.transformsConsidered,
  }
}

function createIndexes() {
  return {
    canonical: new Set(), exact: new Map(), pedagogical: new Map(), perTheme: new Map(),
    exactThemes: new Map(), examples: new Map(), lineCount: 0,
  }
}

function addItem(indexes, item) {
  if (indexes.canonical.has(item.canonicalIdentity)) throw new Error(`Duplicate canonical identity in V3 output: ${item.canonicalIdentity}`)
  indexes.canonical.add(item.canonicalIdentity)
  indexes.lineCount += 1
  add(indexes.exact, item.exactSymmetryFamilyId)
  add(indexes.pedagogical, item.pedagogicalFamilyId)
  if (!indexes.perTheme.has(item.primaryTheme)) indexes.perTheme.set(item.primaryTheme, new Map())
  add(indexes.perTheme.get(item.primaryTheme), item.pedagogicalFamilyId)
  if (!indexes.exactThemes.has(item.exactSymmetryFamilyId)) indexes.exactThemes.set(item.exactSymmetryFamilyId, new Set())
  indexes.exactThemes.get(item.exactSymmetryFamilyId).add(item.primaryTheme)
  if (!indexes.examples.has(item.pedagogicalFamilyId)) indexes.examples.set(item.pedagogicalFamilyId, [item])
  else if (indexes.examples.get(item.pedagogicalFamilyId).length < 2) indexes.examples.get(item.pedagogicalFamilyId).push(item)
}

async function loadDurableOutput(indexes) {
  if (!fs.existsSync(output)) return
  const lines = readline.createInterface({ input: fs.createReadStream(output), crlfDelay: Infinity })
  for await (const line of lines) if (line) addItem(indexes, JSON.parse(line))
}

async function safeWrite(stream, value) {
  if (!stream.write(`${JSON.stringify(value)}\n`)) await once(stream, 'drain')
}

async function main() {
  let checkpoint = readCheckpoint()
  if (checkpoint?.complete) throw new Error('V3 exact-symmetry clustering is already complete; refusing an implicit rerun.')
  if (!checkpoint && fs.existsSync(output)) throw new Error('V3 output exists without a checkpoint; refusing an unsafe append.')
  const indexes = createIndexes()
  if (checkpoint) await loadDurableOutput(indexes)

  if (!checkpoint) {
    checkpoint = { version: 'exact-symmetry-v3', complete: false, inputByteOffset: 0, recordsRead: 0, structuralValid: 0, errors: 0, outputLineCount: 0, uniqueCanonicalCount: 0, startedAt: new Date().toISOString(), peakRssBytes: process.memoryUsage().rss }
  } else if (indexes.lineCount !== checkpoint.outputLineCount || indexes.canonical.size !== checkpoint.uniqueCanonicalCount) {
    // Safe reconciliation is allowed only when the durable output is complete
    // and exactly matches the independent structural-valid total.
    if (indexes.lineCount !== expected || indexes.canonical.size !== expected) {
      throw new Error(`Checkpoint/output disagreement: checkpoint=${checkpoint.outputLineCount}/${checkpoint.uniqueCanonicalCount}, durable=${indexes.lineCount}/${indexes.canonical.size}, expected=${expected}.`)
    }
    checkpoint = {
      ...checkpoint, inputByteOffset: fs.statSync(input).size, recordsRead: expectedInput,
      structuralValid: expected, outputLineCount: expected, uniqueCanonicalCount: expected,
      reconciledFromDurableCompleteOutput: true, updatedAt: new Date().toISOString(),
    }
    atomicWrite(checkpointPath, checkpoint)
  }

  let byteOffset = checkpoint.inputByteOffset
  let recordsRead = checkpoint.recordsRead
  let structuralValid = checkpoint.structuralValid
  let errors = checkpoint.errors
  let peakRssBytes = Math.max(checkpoint.peakRssBytes ?? 0, process.memoryUsage().rss)
  let lastCheckpoint = recordsRead
  const out = fs.createWriteStream(output, { flags: checkpoint.outputLineCount ? 'a' : 'w' })

  const publishCheckpoint = (complete = false, reportWritten = false) => {
    peakRssBytes = Math.max(peakRssBytes, process.memoryUsage().rss)
    const next = {
      ...checkpoint, complete, reportWritten, inputByteOffset: byteOffset, recordsRead, structuralValid, errors,
      outputLineCount: indexes.lineCount, uniqueCanonicalCount: indexes.canonical.size, peakRssBytes,
      updatedAt: new Date().toISOString(),
    }
    atomicWrite(checkpointPath, next)
    checkpoint = next
  }

  const processLine = async (line, bytes) => {
    byteOffset += bytes
    if (!line.trim()) return
    recordsRead += 1
    let record
    try { record = JSON.parse(line) } catch { errors += 1; return }
    if (record.atomic?.status !== 'STRUCTURAL_VALID') return
    try {
      const ids = exactFamilyIdentifiers(record)
      const item = outputItem(record, ids)
      addItem(indexes, item)
      await safeWrite(out, item)
      structuralValid += 1
    } catch (error) {
      errors += 1
    }
    if (recordsRead - lastCheckpoint >= BATCH) {
      lastCheckpoint = recordsRead
      publishCheckpoint()
      console.log(JSON.stringify({ recordsRead, structuralValid, errors, outputLineCount: indexes.lineCount }))
    }
  }

  if (byteOffset < fs.statSync(input).size) {
    let remainder = Buffer.alloc(0)
    const inputStream = fs.createReadStream(input, { start: byteOffset })
    for await (const chunk of inputStream) {
      const data = Buffer.concat([remainder, chunk])
      let start = 0
      for (let index = 0; index < data.length; index += 1) {
        if (data[index] !== 10) continue
        const bytes = data.subarray(start, index + 1)
        await processLine(bytes.toString('utf8').replace(/\r?\n$/, ''), bytes.length)
        start = index + 1
      }
      remainder = data.subarray(start)
    }
    if (remainder.length) await processLine(remainder.toString('utf8'), remainder.length)
  }
  await new Promise((resolve, reject) => { out.end(resolve); out.once('error', reject) })

  if (errors || structuralValid !== expected || indexes.lineCount !== expected || indexes.canonical.size !== expected) {
    throw new Error(`Final V3 integrity failure: valid=${structuralValid}, lines=${indexes.lineCount}, unique=${indexes.canonical.size}, errors=${errors}, expected=${expected}.`)
  }

  const distribution = {}
  let singletons = 0
  for (const size of indexes.pedagogical.values()) { addObject(distribution, bucket(size)); if (size === 1) singletons += 1 }
  const sizes = [...indexes.pedagogical.values()].sort((a, b) => a - b)
  const percentile = (p) => sizes[Math.min(sizes.length - 1, Math.ceil(sizes.length * p) - 1)]
  const perTheme = Object.fromEntries([...indexes.perTheme].sort(([a], [b]) => a.localeCompare(b)).map(([theme, families]) => [theme, {
    familyCount: families.size,
    largest: [...families.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id, size]) => ({ pedagogicalFamilyId: id, size, examples: indexes.examples.get(id) ?? [] })),
  }]))
  const m1 = new Set(), trueM2 = new Set()
  for (const [id, examples] of indexes.examples) (examples[0].extraction === 'EXTRACTABLE_M1' ? m1 : trueM2).add(id)
  const report = {
    version: 'exact-symmetry-v3', recordsRead, structuralValid, structuralRejects: expectedInput - expected,
    structuralRejectReason: 'no verified atomic mechanism from candidate tags', errors,
    exactSymmetryFamilyCount: indexes.exact.size, pedagogicalFamilyCount: indexes.pedagogical.size,
    singletonCount: singletons, singletonPercentage: Number((singletons / indexes.pedagogical.size * 100).toFixed(2)),
    sizeDistribution: distribution, percentiles: { p50: percentile(.5), p75: percentile(.75), p90: percentile(.9), p95: percentile(.95), p99: percentile(.99), max: sizes.at(-1) },
    familyCountsByAtomicTheme: Object.fromEntries(Object.entries(perTheme).map(([theme, value]) => [theme, value.familyCount])),
    largestFamiliesByAtomicTheme: perTheme,
    stageFamilyCounts: { EXTRACTABLE_M1: m1.size, TRUE_M2: trueM2.size },
    crossThemeExactSymmetryCount: [...indexes.exactThemes.values()].filter((themes) => themes.size > 1).length,
    comparison: { oldIdentityFamilies: 897869, provisionalV2GeometryFamilies: 433378, provisionalV2PedagogicalFamilies: 434877 },
    outputIntegrity: { outputLineCount: indexes.lineCount, uniqueCanonicalCount: indexes.canonical.size, expectedStructuralValid: expected, verified: true },
    startedAt: checkpoint.startedAt, completedAt: new Date().toISOString(), peakRssBytes,
  }
  atomicWrite(reportPath, report)
  publishCheckpoint(true, true)
  console.log(JSON.stringify({ complete: true, ...report }, null, 2))
}

main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1 })
