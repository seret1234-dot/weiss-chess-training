import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { Chess } from 'chess.js'

const root = process.cwd(), local = path.join(root, '.local-verified-lichess-tactics-v1')
const pool = JSON.parse(fs.readFileSync(path.join(local, 'hanging-m1-stockfish-v1-pool.json'), 'utf8'))
const outcomes = fs.readFileSync(path.join(local, 'hanging-m1-stockfish-v1-results.ndjson'), 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse)
const output = path.join(local, 'hanging-m1-candidate-corpus-v1')
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex')
const replay = (record) => { const game = new Chess(record.source.displayedFen); const move = record.candidate.evidence.learnerMove; if (!game.move({ from:move.slice(0,2), to:move.slice(2,4), promotion:move[4]||undefined })) throw new Error(`illegal corpus move ${record.source.sourcePuzzleId}`) }
const engine = new Map(outcomes.map((row) => [row.sourcePuzzleId, row]))
const all = pool.jobs.filter((record) => engine.get(record.source.sourcePuzzleId)?.status === 'APPROVED').sort((a,b) => hash(a.source.sourcePuzzleId).localeCompare(hash(b.source.sourcePuzzleId)))
const selected = [], families = new Set(), ids = new Set()
for (const record of all) {
  if (selected.length === 100 || families.has(record.candidate.exactSymmetryFamilyId) || ids.has(record.source.sourcePuzzleId)) continue
  replay(record); selected.push(record); families.add(record.candidate.exactSymmetryFamilyId); ids.add(record.source.sourcePuzzleId)
}
if (selected.length < 20) throw new Error(`Hanging Piece M1 unavailable: ${selected.length} individually approved records`)
fs.rmSync(output, { recursive:true, force:true }); fs.mkdirSync(output,{recursive:true})
const chunks = Array.from({length: Math.ceil(selected.length / 20)}, (_, index) => {
  const records = selected.slice(index*20,index*20+20).map((record) => {
    const outcome = engine.get(record.source.sourcePuzzleId), e = record.candidate.evidence
    const canonicalIdentity = `${record.source.displayedFen}|hanging-piece|${e.subtype}|${e.learnerMove}|${record.source.sourcePuzzleId}`
    return { id:`verified-lichess-hanging-m1-v1-${hash(canonicalIdentity).slice(0,16)}`, canonicalIdentity, lichessPuzzleId:record.source.sourcePuzzleId, sourceFingerprint:pool.sourceFingerprint, sourceRowNumber:record.source.sourceRowNumber, displayedFen:record.source.displayedFen, learnerMove:e.learnerMove, learnerSan:e.learnerSan, canonicalTheme:'Hanging Piece', canonicalSubtype:e.subtype, stage:'M1', rating:record.source.rating, sourceMetadata:{ratingDeviation:record.source.ratingDeviation,popularity:record.source.popularity,nbPlays:record.source.nbPlays,openingTags:record.source.openingTags,rawLichessTags:record.source.rawLichessTags}, exactSymmetryFamilyId:record.candidate.exactSymmetryFamilyId, structuralEvidence:e, engineValidation:{outcome:outcome.status,reason:outcome.reason,rootScore:outcome.rootScore,forcedScore:outcome.forcedScore,scoreGap:outcome.scoreGap,configuration:outcome.config} }
  })
  const id = `hanging-piece-m1-v1-chunk-${index+1}`; fs.writeFileSync(path.join(output,`${id}.json`),`${JSON.stringify({id,records},null,2)}\n`); return { id, count:records.length, file:`${id}.json` }
})
const manifest = { version:'verified-lichess-hanging-m1-candidate-corpus-v1', sourceFingerprint:pool.sourceFingerprint, theme:'Hanging Piece', stage:'M1', status:'READY_CANDIDATE_CORPUS_ONLY', chunks, records:selected.length, exactSymmetryFamilies:families.size, engineJobs:outcomes.length, engineApproved:all.length, nonApplicableStages:['M2','M3','M4'], corpusHash:hash(JSON.stringify(selected.map((record)=>record.source.sourcePuzzleId))) }
fs.writeFileSync(path.join(output,'manifest.json'),`${JSON.stringify(manifest,null,2)}\n`)
const values = selected.map((record)=>record.source.rating).sort((a,b)=>a-b), at=(p)=>values[Math.round((values.length-1)*p)]
const targets = Object.fromEntries(selected.reduce((map,record)=>map.set(record.candidate.evidence.targetPiece,(map.get(record.candidate.evidence.targetPiece)??0)+1),new Map())), capturers=Object.fromEntries(selected.reduce((map,record)=>map.set(record.candidate.evidence.attackerPiece,(map.get(record.candidate.evidence.attackerPiece)??0)+1),new Map())), subtype=Object.fromEntries(selected.reduce((map,record)=>map.set(record.candidate.evidence.subtype,(map.get(record.candidate.evidence.subtype)??0)+1),new Map()))
const review=['# Verified Lichess Hanging Piece M1 candidate corpus','',`- ${selected.length} individually approved records in ${chunks.length} chunks.`, `- Engine: Stockfish 18, Threads 1, Hash 64 MB, MultiPV 3, depth 14; close cases also depth 16.`, `- Ratings: ${values[0]}–${values.at(-1)}, median ${at(.5)}, p10/p90 ${at(.1)}/${at(.9)}.`, `- Subtypes: ${Object.entries(subtype).map(([k,v])=>`${k} ${v}`).join('; ')}.`, `- Targets: ${Object.entries(targets).map(([k,v])=>`${k} ${v}`).join('; ')}.`, `- Capturers: ${Object.entries(capturers).map(([k,v])=>`${k} ${v}`).join('; ')}.`, `- Deterministic corpus hash: \`${manifest.corpusHash}\`.`, '', '| Puzzle | Rating | FEN | Capture | Target | Subtype | Engine score/gap |', '|---|---:|---|---|---|---|---|', ...selected.slice(0,25).map((record)=>{const e=record.candidate.evidence,o=engine.get(record.source.sourcePuzzleId);return `| ${record.source.sourcePuzzleId} | ${record.source.rating} | \`${record.source.displayedFen}\` | \`${e.learnerMove}\` | ${e.targetPiece} ${e.targetSquare} | ${e.subtype} | ${o.forcedScore}/${o.scoreGap} |`}), '']
fs.writeFileSync(path.join(output,'review.md'),`${review.join('\n')}\n`)
console.log(JSON.stringify({output,manifest,targets,capturers,subtype},null,2))
