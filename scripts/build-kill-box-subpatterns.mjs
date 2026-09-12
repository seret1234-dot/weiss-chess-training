import { mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { resolve } from "node:path"
import { classifyKillBoxStoredPuzzle, KILL_BOX_SUBPATTERNS } from "./lib/kill-box-subpattern-assignment.mjs"

const root = process.cwd()
const sourceRoot = resolve(root, "public/data/pattern-mates/kill-box")
const outputSlugs = [...Object.keys(KILL_BOX_SUBPATTERNS), "kill-box-unclassified"]
const distances = [1, 2, 3, 4, 5]
const sourceChunkSize = 30

const expected = {
  "kill-box-adjacent-rook": [881, 946, 614, 94, 18],
  "kill-box-rook-rail": [296, 347, 81, 24, 2],
  "kill-box-queen-fence": [190, 161, 125, 24, 11],
  "kill-box-unclassified": [133, 46, 46, 12, 5],
}

const recordsBySlugAndDistance = new Map(outputSlugs.map((slug) => [slug, new Map(distances.map((distance) => [distance, []]))]))
const sourceIds = new Set()

for (const distance of distances) {
  const sourcePath = resolve(sourceRoot, `mate-in-${distance}`)
  const manifest = JSON.parse(await readFile(resolve(sourcePath, "manifest.json"), "utf8"))
  for (const file of manifest.files ?? []) {
    const chunk = JSON.parse(await readFile(resolve(sourcePath, file), "utf8"))
    const records = Array.isArray(chunk) ? chunk : chunk.puzzles ?? []
    for (const record of records) {
      const id = String(record.puzzleId ?? record.id)
      if (!id) throw new Error(`Missing original Kill Box puzzle ID in ${file}`)
      if (sourceIds.has(id)) throw new Error(`Duplicate original Kill Box puzzle ID: ${id}`)
      sourceIds.add(id)
      const assignment = classifyKillBoxStoredPuzzle(record)
      if (assignment.mateDistance !== distance) throw new Error(`Distance mismatch for ${id}`)
      recordsBySlugAndDistance.get(assignment.slug).get(distance).push({
        ...record,
        killBoxSubpattern: assignment.classification,
        killBoxSourceTheme: "kill-box",
      })
    }
  }
}

if (sourceIds.size !== 4056) throw new Error(`Expected 4,056 source IDs, got ${sourceIds.size}`)

for (const slug of outputSlugs) {
  const values = recordsBySlugAndDistance.get(slug)
  const actual = distances.map((distance) => values.get(distance).length)
  if (actual.some((count, index) => count !== expected[slug][index])) {
    throw new Error(`${slug} count mismatch: ${actual.join(", ")}`)
  }

  for (const distance of distances) {
    const target = resolve(root, `public/data/pattern-mates/${slug}/mate-in-${distance}`)
    await rm(target, { recursive: true, force: true })
    await mkdir(target, { recursive: true })
    const records = values.get(distance)
    const files = []
    for (let offset = 0; offset < records.length; offset += sourceChunkSize) {
      const filename = `chunk-${String(files.length + 1).padStart(3, "0")}.json`
      files.push(filename)
      await writeFile(resolve(target, filename), `${JSON.stringify(records.slice(offset, offset + sourceChunkSize), null, 2)}\n`)
    }
    const subtype = KILL_BOX_SUBPATTERNS[slug]
    await writeFile(resolve(target, "manifest.json"), `${JSON.stringify({
      schemaVersion: 1,
      category: "mates",
      theme: slug,
      themeLabel: subtype?.label ?? "Kill Box — Unclassified Holding",
      mateDistance: distance,
      totalPuzzles: records.length,
      totalChunks: files.length,
      chunkSize: sourceChunkSize,
      files,
      sourceManifest: `/data/pattern-mates/kill-box/mate-in-${distance}/manifest.json`,
      sourceTheme: "kill-box",
      classification: subtype?.family ?? "holding",
      trainingActive: Boolean(subtype),
      immutableSourceData: true,
    }, null, 2)}\n`)
  }
}

const summary = Object.fromEntries(outputSlugs.map((slug) => [slug, Object.fromEntries(distances.map((distance) => [distance, recordsBySlugAndDistance.get(slug).get(distance).length]))]))
await writeFile(resolve(root, "public/data/pattern-mates/kill-box-subpattern-summary.json"), `${JSON.stringify({
  schemaVersion: 1,
  sourcePuzzleCount: sourceIds.size,
  sourceTheme: "kill-box",
  assignments: summary,
}, null, 2)}\n`)

console.log(JSON.stringify({ sourcePuzzleCount: sourceIds.size, assignments: summary }))
