import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import { Chess } from 'chess.js'

const root = process.cwd()
const runtimeRoot = path.join(root, 'public', 'data', 'verified-lichess-tactics-v1', 'final-v5')
const masterIndex = path.join(root, '.local-verified-lichess-tactics-v1', 'master-source-index-v1.ndjson')
const output = path.join(runtimeRoot, 'premove-context.json')

function positionKey(fen) {
 return String(fen).trim().split(/\s+/).slice(0, 4).join(' ')
}

function move(uci) {
 return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined }
}

function readExercises() {
 const index = JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'index.json'), 'utf8'))
 const exercises = new Map()
 for (const course of index.courses.filter((course) => course.theme !== 'mixed')) {
  const directory = path.join(runtimeRoot, `${course.theme}-${course.stage.toLowerCase()}`)
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'))
  for (const chunk of manifest.chunks) {
   const payload = JSON.parse(fs.readFileSync(path.join(directory, chunk.file), 'utf8'))
   for (const exercise of payload.exercises) {
    if (exercises.has(exercise.sourcePuzzleId)) throw new Error(`Duplicate runtime source ID ${exercise.sourcePuzzleId}`)
    exercises.set(exercise.sourcePuzzleId, exercise)
   }
  }
 }
 return exercises
}

if (fs.existsSync(output)) throw new Error(`Refusing to overwrite ${output}`)
const exercises = readExercises()
const contexts = new Map()
const source = readline.createInterface({ input: fs.createReadStream(masterIndex), crlfDelay: Infinity })

for await (const line of source) {
 if (!line) continue
 const record = JSON.parse(line)
 const exercise = exercises.get(record.sourcePuzzleId)
 if (!exercise) continue
 if (!record.legal || !record.sourceFen || !Array.isArray(record.moves) || !record.moves[0]) {
  throw new Error(`Missing legal initial context for ${record.sourcePuzzleId}`)
 }
 const game = new Chess(record.sourceFen)
 const applied = game.move(move(record.moves[0]))
 if (!applied) throw new Error(`Illegal master-index premove for ${record.sourcePuzzleId}`)
 if (positionKey(game.fen()) !== positionKey(record.displayedFen)) {
  throw new Error(`Master-index displayed FEN mismatch for ${record.sourcePuzzleId}`)
 }
 if (positionKey(record.displayedFen) !== positionKey(exercise.fen)) {
  throw new Error(`Runtime displayed FEN mismatch for ${record.sourcePuzzleId}`)
 }
 contexts.set(record.sourcePuzzleId, {
  sourceFen: record.sourceFen,
  preMove: record.moves[0],
  displayedFen: record.displayedFen,
 })
 if (contexts.size === exercises.size) break
}

if (contexts.size !== exercises.size) {
 const missing = [...exercises.keys()].filter((id) => !contexts.has(id))
 throw new Error(`Missing master-index context for ${missing.length} runtime exercises: ${missing.slice(0, 10).join(', ')}`)
}

const payload = {
 schemaVersion: 1,
 corpus: 'verified-lichess-final-v5',
 exerciseCount: contexts.size,
 exercises: Object.fromEntries([...contexts.entries()].sort(([left], [right]) => left.localeCompare(right))),
}
const temporary = `${output}.tmp`
fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`)
fs.renameSync(temporary, output)
console.log(JSON.stringify({ passed: true, output, exercises: contexts.size }, null, 2))
