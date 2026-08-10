import assert from 'node:assert/strict'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { createServer } from 'vite'

const root = process.cwd()
const publicRoot = path.join(root, 'public')
const corpusRoot = path.join(publicRoot, 'data', 'verified-lichess-tactics-v1', 'final-v6')
const index = JSON.parse(fs.readFileSync(path.join(corpusRoot, 'index.json'), 'utf8'))
const normalStartingFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

function publicFileFor(url) {
  assert.ok(url.startsWith('/'), `browser asset URL must be root-relative: ${url}`)
  assert.ok(!url.includes('\\'), `browser asset URL must use forward slashes: ${url}`)
  return path.join(publicRoot, ...url.split('/').filter(Boolean))
}

async function startPublicAssetServer() {
  const server = http.createServer((request, response) => {
    const assetPath = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    const filePath = publicFileFor(assetPath)
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
      response.end('Not found')
      return
    }
    response.writeHead(200, {
      'content-type': filePath.endsWith('.json')
        ? 'application/json; charset=utf-8'
        : 'application/octet-stream',
    })
    response.end(fs.readFileSync(filePath))
  })

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string', 'asset test server receives an ephemeral port')
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  }
}

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const assetServer = await startPublicAssetServer()

try {
  const paths = await vite.ssrLoadModule('/src/trainers/patternTactic/patternTacticAssetPaths.ts')
  const curricula = await vite.ssrLoadModule('/src/trainers/patternTactic/m1toM4LearnerCurriculum.ts')
  const premove = await vite.ssrLoadModule('/src/trainers/patternTactic/initialPremove.ts')
  const trainerSource = fs.readFileSync(path.join(root, 'src', 'trainers', 'patternTactic', 'PatternTacticTrainer.tsx'), 'utf8')
  const requestPublicJson = (assetUrl) => new Promise((resolve, reject) => {
    const request = http.get(`${assetServer.baseUrl}${assetUrl}`, (response) => {
      const chunks = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('error', (error) => reject(new Error(`${assetUrl}: ${error.message}`)))
      response.on('end', () => {
        try {
          assert.equal(response.statusCode, 200, `${assetUrl} responds successfully through the browser public path`)
          assert.match(String(response.headers['content-type'] ?? ''), /application\/json/i, `${assetUrl} is served as JSON, not an HTML fallback`)
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
        } catch (error) {
          reject(error)
        }
      })
    })
    request.on('error', (error) => reject(new Error(`${assetUrl}: ${error.message}`)))
  })
  const fetchPublicJson = async (assetUrl) => {
    let lastError
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await requestPublicJson(assetUrl)
      } catch (error) {
        lastError = error
      }
    }
    throw lastError
  }

  await assert.rejects(
    () => paths.readPatternTacticJson(new Response('<!doctype html>', {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }), '/data/verified-lichess-tactics-v1/final-v6/example/chunk-01.json'),
    /Expected verified tactic asset JSON but received text\/html/,
    'an HTML fallback is reported as an actionable tactic asset error',
  )

  const queenForkChunkUrl = paths.resolvePatternTacticPublicAssetUrl(
    '/data/verified-lichess-tactics-v1/final-v6/queen-fork-m2',
    'chunk-01.json',
  )
  assert.equal(
    queenForkChunkUrl,
    '/data/verified-lichess-tactics-v1/final-v6/queen-fork-m2/chunk-01.json',
    'Queen Fork M2 resolves a manifest-relative chunk to the deployed public path',
  )
  assert.ok(fs.existsSync(publicFileFor(queenForkChunkUrl)), 'representative deployed chunk exists at its resolved browser URL')

  const representativeRoutes = [
    ['m1/knight-fork', 'knight-fork', 'M1'],
    ['m2/queen-fork', 'queen-fork', 'M2'],
    ['m1/bishop-pin', 'bishop-pin', 'M1'],
    ['m2/queen-pin', 'queen-pin', 'M2'],
    ['m1/queen-skewer', 'queen-skewer', 'M1'],
    ['m1/discovered-check', 'discovered-check', 'M1'],
    ['m1/deflection', 'deflection', 'M1'],
    ['m1/remove-the-defender', 'remove-the-defender', 'M1'],
    ['m1/diagonal-clearance', 'diagonal-clearance', 'M1'],
    ['m1/promotion', 'promotion', 'M1'],
    ['m1/en-passant', 'en-passant', 'M1'],
    ['m1/zwischencheck', 'zwischencheck', 'M1'],
    ['m1/hanging-piece', 'hanging-piece', 'M1'],
    ['m3/bishop-fork', 'bishop-fork', 'M3'],
    ['m4/queen-pin', 'queen-pin', 'M4'],
    ['m2/clearance-sacrifice', 'clearance-sacrifice', 'M2'],
  ]
  for (const [route, theme, stage] of representativeRoutes) {
    const course = index.courses.find((entry) => entry.theme === theme && entry.stage === stage)
    assert.ok(course, `representative route /tactics/${route} has an active verified course`)
    const manifest = await fetchPublicJson(`/data/verified-lichess-tactics-v1/final-v6/${theme}-${stage.toLowerCase()}/manifest.json`)
    const firstChunk = await fetchPublicJson(`/data/verified-lichess-tactics-v1/final-v6/${theme}-${stage.toLowerCase()}/${manifest.chunks[0].file}`)
    assert.ok(firstChunk.exercises[0]?.fen && firstChunk.exercises[0].fen !== normalStartingFen, `representative route /tactics/${route} starts from a verified non-starting FEN`)
  }

  let manifestCount = 0
  let chunkCount = 0
  let exerciseCount = 0
  const chunkJobs = []
  for (const course of index.courses.filter((course) => course.theme !== 'mixed')) {
    const trainerKey = `tactic-${course.theme}-${course.stage.toLowerCase()}`
    const curriculum = curricula.getPatternTacticLearnerCurriculum(trainerKey)
    assert.ok(curriculum && curriculum.activeChunkCount > 0, `course registry must activate ${trainerKey}`)

    const manifestUrl = paths.resolvePatternTacticPublicAssetUrl(curriculum.learnerDataBasePath, 'manifest.json')
    const expectedManifestUrl = `/data/verified-lichess-tactics-v1/final-v6/${course.theme}-${course.stage.toLowerCase()}/manifest.json`
    assert.equal(manifestUrl, expectedManifestUrl, `${trainerKey} registry path uses the final-v6 public convention`)
    const manifestPath = publicFileFor(manifestUrl)
    assert.ok(fs.existsSync(manifestPath), `${trainerKey} manifest is included as a public asset`)
    const manifest = await fetchPublicJson(manifestUrl)
    assert.ok(Array.isArray(manifest.chunks) && manifest.chunks.length > 0, `${trainerKey} has public chunk references`)
    manifestCount += 1

    for (const chunk of manifest.chunks) {
      const chunkUrl = paths.resolvePatternTacticPublicAssetUrl(curriculum.learnerDataBasePath, chunk.file)
      chunkJobs.push({ trainerKey, chunk, chunkUrl })
    }
  }

  const courseExerciseCounts = new Map()
  let cursor = 0
  const workers = Array.from({ length: 12 }, async () => {
    while (cursor < chunkJobs.length) {
      const job = chunkJobs[cursor++]
      const chunkPath = publicFileFor(job.chunkUrl)
      assert.ok(fs.existsSync(chunkPath), `${job.trainerKey} resolves ${job.chunk.file} to an included public asset`)
      const payload = await fetchPublicJson(job.chunkUrl)
      assert.ok(Array.isArray(payload.exercises), `${job.chunkUrl} parses as a verified exercise chunk`)
      assert.equal(payload.exercises.length, job.chunk.count, `${job.chunkUrl} count matches its manifest entry`)
      for (const exercise of payload.exercises) {
        assert.ok(exercise.fen, `${job.chunkUrl} exercise has its displayed FEN`)
        assert.notEqual(exercise.fen, normalStartingFen, `${job.chunkUrl} never falls back to the normal starting position`)
        assert.ok(Array.isArray(exercise.solutionLine) && exercise.solutionLine.length > 0, `${job.chunkUrl} exercise has a solution line`)
        assert.equal(exercise.provenance?.premoveContext, 'embedded-v1', `${job.chunkUrl} embeds verified premove provenance`)
        assert.ok(exercise.sourceFen && exercise.preMove && exercise.displayedFen, `${job.chunkUrl} has complete embedded premove fields`)
        assert.equal(exercise.displayedFen, exercise.fen, `${job.chunkUrl} uses its embedded displayed FEN as the visible puzzle position`)
        const verified = premove.verifyInitialPremove(exercise)
        assert.equal(premove.sameChessPosition(verified.displayedFen, exercise.fen), true, `${job.chunkUrl} legal embedded premove reproduces displayed FEN`)
      }
      courseExerciseCounts.set(job.trainerKey, (courseExerciseCounts.get(job.trainerKey) ?? 0) + payload.exercises.length)
      exerciseCount += payload.exercises.length
      chunkCount += 1
    }
  })
  await Promise.all(workers)
  for (const course of index.courses.filter((course) => course.theme !== 'mixed')) {
    assert.equal(courseExerciseCounts.get(`tactic-${course.theme}-${course.stage.toLowerCase()}`), course.exerciseCount, `tactic-${course.theme}-${course.stage.toLowerCase()} resolves every course exercise`)
  }

  assert.equal(exerciseCount, 9635, 'all approved verified runtime exercises resolve through their browser public paths')
  assert.equal(manifestCount, 76, 'all 76 focused verified manifests resolve as browser JSON assets')
  assert.equal(chunkCount, 489, 'all 489 focused verified chunks resolve as browser JSON assets')
  assert.match(trainerSource, /resolvePatternTacticPublicAssetUrl\(activeDataBasePath, sourceFile\)/, 'trainer uses the central manifest-relative chunk resolver')
  assert.match(trainerSource, /fetchPatternTacticJson/, 'trainer validates JSON responses before parsing tactic assets')
  assert.match(trainerSource, /data-testid="pattern-tactic-load-error"/, 'chunk-load failures render a fail-closed unavailable state')
  assert.doesNotMatch(trainerSource, /setGameAndBoardFen\(new Chess\(\)\)[\s\S]{0,300}Could not load chunk/, 'a chunk-load failure never resets the board to a normal starting position')

  console.log(JSON.stringify({
    passed: true,
    manifests: manifestCount,
    chunks: chunkCount,
    exercises: exerciseCount,
    representativeUrl: queenForkChunkUrl,
    representativeRoutes: representativeRoutes.map(([route]) => `/tactics/${route}`),
  }, null, 2))
} finally {
  await assetServer.close()
  await vite.close()
}
