import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'

const root = process.cwd()
const audit = path.join(root, 'audit-reports/verified-lichess-tactics-v1')
const exhaustive = JSON.parse(fs.readFileSync(path.join(audit, 'exhaustive-b1-structural-summary.json'), 'utf8'))
const subset = JSON.parse(fs.readFileSync(path.join(audit, 'b1-structural-summary.json'), 'utf8'))
const exhaustiveOutput = path.join(audit, 'exhaustive-b1-structural.ndjson')
const rows = [
  ['promotion', 'Queen Promotion', 'Promotion', exhaustive.sourceTagCounts.promotion, exhaustive.types.Promotion, subset.types.Promotion.rawCandidates],
  ['underPromotion', 'Knight Underpromotion', 'Knight Underpromotion', 1040, exhaustive.types['Knight Underpromotion'], subset.types['Knight Underpromotion'].rawCandidates],
  ['underPromotion', 'Rook Underpromotion', 'Rook Underpromotion', 31, exhaustive.types['Rook Underpromotion'], subset.types['Rook Underpromotion'].rawCandidates],
  ['underPromotion', 'Bishop Underpromotion', 'Bishop Underpromotion', 3, exhaustive.types['Bishop Underpromotion'], subset.types['Bishop Underpromotion'].rawCandidates],
  ['enPassant', 'En Passant', 'En Passant', exhaustive.sourceTagCounts.enPassant, exhaustive.types['En Passant'], subset.types['En Passant'].rawCandidates],
]
const matrix = rows.map(([sourceTag, canonicalType, subtype, sourceTagCount, result, subsetCount]) => ({
  sourceTag, canonicalType, subtype, sourceTagCount, inspected: result.inspected,
  structurallyVerified: result.structurallyVerified, engineRequired: result.engineRequired,
  rejected: result.rejected, EXTRACTABLE_M1: result.EXTRACTABLE_M1,
  TRUE_M2: result.TRUE_M2, NOT_M1_EXTRACTABLE: result.NOT_M1_EXTRACTABLE,
  courseStatus: result.structurallyVerified >= 20 ? 'candidate capacity exists; requires individual semantic/engine validation' : 'unavailable pending additional individually validated material',
  subsetInspected: subsetCount, subsetMissed: result.inspected - subsetCount,
}))
const statusTemplate = () => ({ STRUCTURALLY_VERIFIED: { EXTRACTABLE_M1: 0, TRUE_M2: 0, NOT_M1_EXTRACTABLE: 0 }, ENGINE_REQUIRED: { EXTRACTABLE_M1: 0, TRUE_M2: 0, NOT_M1_EXTRACTABLE: 0 }, REJECTED: 0 })
const statusByStage = Object.fromEntries(['Promotion', 'Underpromotion', 'Knight Underpromotion', 'Rook Underpromotion', 'Bishop Underpromotion', 'En Passant'].map((type) => [type, statusTemplate()]))
const typesFor = (finding) => finding.candidateCategory === 'underpromotion' ? (finding.label ? ['Underpromotion', finding.label] : ['Underpromotion']) : [finding.label ?? (finding.candidateCategory === 'enPassant' ? 'En Passant' : 'Promotion')]
for await (const line of readline.createInterface({ input: fs.createReadStream(exhaustiveOutput), crlfDelay: Infinity })) {
  if (!line) continue
  const { findings } = JSON.parse(line)
  for (const finding of findings) for (const type of typesFor(finding)) {
    if (finding.status === 'REJECTED') statusByStage[type].REJECTED += 1
    else statusByStage[type][finding.status][finding.extraction] += 1
  }
}
const output = {
  scope: 'EXHAUSTIVE_B1_TAG_SCAN', sourceIdentity: exhaustive.sourceIdentity,
  subsetScope: subset.scope, taxonomyCoverage: matrix, statusByStage,
  allRegistryB1TagsObserved: ['promotion', 'underPromotion', 'enPassant'].every((tag) => exhaustive.sourceTagCounts[tag] > 0),
  stockfishStarted: false,
}
fs.writeFileSync(path.join(audit, 'exhaustive-b1-coverage-matrix.json'), `${JSON.stringify(output, null, 2)}\n`)
console.log(JSON.stringify(output, null, 2))
