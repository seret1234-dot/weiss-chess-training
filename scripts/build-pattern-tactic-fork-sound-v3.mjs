import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { canonicalIdentity } from "./lib/pattern-tactic-semantic-validator.mjs"
import { formatForkExplanation, isSoundFork } from "./lib/fork-soundness.mjs"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const report = JSON.parse(fs.readFileSync(path.join(root, "audit-reports", "pattern-tactic-fork-soundness.json"), "utf8"))
const sourceRoot = path.join(root, "public", "data", "pattern-tactics")
const learnerRoot = path.join(root, "public", "data", "learner-curricula", "pattern-tactics")
const themes = new Set(["pawn-fork", "bishop-fork", "knight-fork", "rook-fork", "queen-fork", "king-fork"])
const byCourse = new Map(report.courses.map((course) => [`${course.theme}-m${course.stage}`, course]))
const bySource = new Map(report.records.map((record) => [`${record.theme}-m${record.stage}|${record.sourceFile}|${record.sourceIndex}`, record]))
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"))
const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`) }
const label = (theme) => theme.split("-").map((part) => `${part[0].toUpperCase()}${part.slice(1)}`).join(" ")
const hash = (value) => { let h = 2166136261; for (const char of value) { h ^= char.charCodeAt(0); h = Math.imul(h, 16777619) } return h >>> 0 }
const capForStage = (stage) => stage === 1 ? 100 : 160
function diverseSubset(records, course) {
  const buckets = new Map()
  for (const entry of records) {
    const evidence = entry.audit.evidence ?? {}
    const targetKinds = (evidence.targets ?? []).map((target) => String(target).match(/(pawn|knight|bishop|rook|queen|king)/)?.[1] ?? "other").sort().join("+")
    const key = `${evidence.checking ? "check" : "quiet"}|${evidence.capturable ? "capture" : "safe"}|${targetKinds}|${entry.audit.storedLine?.[0] ?? ""}`
    const bucket = buckets.get(key) ?? []; bucket.push(entry); buckets.set(key, bucket)
  }
  for (const bucket of buckets.values()) bucket.sort((a,b)=>hash(`${course}|${a.audit.sourceIdentity}`)-hash(`${course}|${b.audit.sourceIdentity}`)||a.audit.sourceIdentity.localeCompare(b.audit.sourceIdentity))
  const output=[]; const keys=[...buckets.keys()].sort((a,b)=>hash(`${course}|${a}`)-hash(`${course}|${b}`)||a.localeCompare(b))
  while (output.length < capForStage(Number(course.at(-1))) && keys.some((key)=>(buckets.get(key)?.length??0)>0)) for (const key of keys) { const next=buckets.get(key)?.shift(); if(next) output.push(next); if(output.length>=capForStage(Number(course.at(-1)))) break }
  return output
}

for (const course of report.courses) {
  const key = `${course.theme}-m${course.stage}`
  const sourceDir = path.join(sourceRoot, course.theme, `m${course.stage}`)
  const sourceManifest = read(path.join(sourceDir, "manifest.json"))
  const retained = []
  sourceManifest.files.forEach((file, fileIndex) => {
    const content = read(path.join(sourceDir, file)); const puzzles = Array.isArray(content) ? content : content.puzzles ?? []
    puzzles.forEach((raw, sourceIndex) => { const audit = bySource.get(`${key}|${file}|${sourceIndex}`); if (audit && isSoundFork(audit)) retained.push({ raw, audit, file, sourceChunk: fileIndex + 1, sourceIndex }) })
  })
  retained.sort((a, b) => hash(`${key}|${a.audit.sourceIdentity}`) - hash(`${key}|${b.audit.sourceIdentity}`) || a.audit.sourceIdentity.localeCompare(b.audit.sourceIdentity))
  const selected = diverseSubset(retained, key)
  // Two audited King Fork M3 records are deliberately held back: the course
  // is below the minimum reviewed material threshold and must not be scheduled.
  const unavailableForCapacity = course.theme === "king-fork" && course.stage >= 3
  const chunkCount = unavailableForCapacity ? 0 : Math.ceil(selected.length / 20)
  const outDir = path.join(learnerRoot, `${course.theme}-m${course.stage}-semantic-v3`)
  fs.rmSync(outDir, { recursive: true, force: true })
  const files = []
  for (let chunk = 0; chunk < chunkCount; chunk += 1) {
    const file = `chunk-${String(chunk + 1).padStart(3, "0")}.json`; files.push(file)
    write(path.join(outDir, file), { puzzles: selected.slice(chunk * 20, (chunk + 1) * 20).map((entry, order) => ({
      ...entry.raw, canonicalThemeKey: course.theme, canonicalThemeLabel: label(course.theme),
      semanticAudit: { version: "fork-sound-v3", status: "VALID", reason: entry.audit.reason, evidence: { ...entry.audit.evidence, explanation: formatForkExplanation(entry.audit.evidence), soundnessClassification: entry.audit.classification } },
      learnerCurriculum: { version: `m${course.stage}-semantic-v3`, learnerChunk: chunk + 1, orderInChunk: order, sourceChunk: entry.sourceChunk, sourceIndex: entry.sourceIndex, sourceIdentity: entry.audit.sourceIdentity, canonicalIdentity: canonicalIdentity(entry.raw, course.theme), retainedReason: "Geometric fork plus fixed-depth Stockfish soundness proof." },
    })) })
  }
  write(path.join(outDir, "manifest.json"), { schemaVersion: 1, curriculumVersion: `pattern-tactic-${key}-fork-sound-v3`, category: "tactics", theme: course.theme, tacticDistance: course.stage, totalPuzzles: unavailableForCapacity ? 0 : selected.length, reviewedSoundRecords: retained.length, unusedSoundRecords: Math.max(0, retained.length - selected.length), totalChunks: chunkCount, chunkSize: 20, files, unavailable: chunkCount === 0, unavailableReason: chunkCount === 0 ? "Not enough sound, engine-verified fork material is available for this course yet." : undefined, sourceLimited: !unavailableForCapacity && selected.length < capForStage(course.stage), sourceManifest: `/data/pattern-tactics/${course.theme}/m${course.stage}/manifest.json`, soundness: { engine: report.engine, classificationCounts: course.classifications, retained: selected.length } })
}

for (const stage of [1, 2, 3, 4]) {
  const puzzles=[]; const sourceThemes=[]; const contributionCounts={}
  const sourceThemesOnStage=fs.readdirSync(sourceRoot).filter((theme)=>theme!=="mixed"&&fs.existsSync(path.join(sourceRoot,theme,`m${stage}`,"manifest.json"))).sort()
  for (const theme of sourceThemesOnStage) {
    const candidates=themes.has(theme)
      ? [`${theme}-m${stage}-semantic-v3`]
      : [`${theme}-m${stage}-semantic-v2`, `${theme}-m${stage}-v1`]
    const folder=candidates.find((name)=>fs.existsSync(path.join(learnerRoot,name,"manifest.json")))
    if (!folder) continue
    const manifest=read(path.join(learnerRoot,folder,"manifest.json")); if (manifest.unavailable) continue
    sourceThemes.push(theme); let count=0
    for (const file of manifest.files) { const rows=read(path.join(learnerRoot,folder,file)).puzzles??[]; puzzles.push(...rows); count+=rows.length }
    contributionCounts[theme]=count
  }
  const dir=path.join(learnerRoot,`mixed-m${stage}-semantic-v3`); write(path.join(dir,"chunk-001.json"),{puzzles}); write(path.join(dir,"manifest.json"),{schemaVersion:1,category:"tactics",theme:"mixed",tacticDistance:stage,totalPuzzles:puzzles.length,totalChunks:1,files:["chunk-001.json"],sourceThemes,contributionCounts,note:"Fork contributors use fixed-depth soundness-v3 overlays; non-fork Tier A uses semantic-v2 and Tier B/C uses v1."})
}
console.log(JSON.stringify(report.courses.map((course)=>({course:`${course.theme}-m${course.stage}`,retained:course.soundRetained,chunks:Math.ceil(course.soundRetained/20)})),null,2))
