import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })

try {
  const overlay = await vite.ssrLoadModule('/src/trainers/ChunkCompletionOverlay.tsx')
  const navigation = await vite.ssrLoadModule('/src/trainers/activeChunkNavigation.ts')
  const m2ToM5 = await vite.ssrLoadModule('/src/trainers/patternMate/m2toM5LearnerCurriculum.ts')
  const tactics = await vite.ssrLoadModule('/src/trainers/patternTactic/m1toM4LearnerCurriculum.ts')
  const result = { theme: 'hook-mate', stage: 1, attempts: 24, correct: 23, hints: 0 }

  assert.equal(overlay.shouldShowChunkCompletionOverlay(null, false), false, 'no completion result means no overlay')
  assert.equal(overlay.shouldShowChunkCompletionOverlay(result, false), true, 'a genuine completion result shows the overlay')
  assert.equal(overlay.shouldShowChunkCompletionOverlay(result, true), false, 'dismissing the overlay keeps the side-panel summary without reopening it')
  assert.equal(overlay.isChunkCompletionDebugHost('localhost'), true, 'localhost may enable completion-preview tooling')
  assert.equal(overlay.isChunkCompletionDebugHost('127.0.0.1'), true, 'local loopback may enable completion-preview tooling')
  assert.equal(overlay.isChunkCompletionDebugHost('weiss-chess-training-example.vercel.app'), true, 'Vercel Preview hosts may enable completion-preview tooling')
  assert.equal(overlay.isChunkCompletionDebugHost('weisschess.com'), false, 'Production hosts never enable completion-preview tooling')
  assert.equal(overlay.isChunkCompletionDebugEnabled('weisschess.com', '1'), false, 'the Production query parameter is ignored completely')
  assert.equal(overlay.isChunkCompletionDebugEnabled('localhost', '1'), true, 'the local query parameter enables mock-only preview data')

  const rendered = renderToString(React.createElement(overlay.ChunkCompletionOverlay, {
    result,
    chunkNumber: 1,
    chunkCount: 5,
    hasNextChunk: true,
    onContinueAuto: () => {},
    onNextChunk: () => {},
    onDismiss: () => {},
  }))
  const renderedText = rendered.replace(/<!--.*?-->/g, '')
  assert.match(renderedText, /Chunk completed!/, 'the rendered overlay has the celebration heading')
  assert.match(renderedText, /Hook Mate · M1/, 'the rendered overlay shows a human-readable theme and stage')
  assert.match(renderedText, /Chunk 1 of 5/, 'the rendered overlay shows the learner-facing chunk position')
  assert.match(renderedText, /23 \/ 24 first-attempt solves/, 'the rendered overlay shows the shared completion summary')
  assert.match(renderedText, /Next chunk/, 'a non-final learner chunk offers the next active chunk')
  assert.equal(overlay.getChunkCompletionSecondaryAction(true), 'next', 'non-final chunks use the Next chunk action')
  assert.equal(overlay.getChunkCompletionSecondaryAction(false), 'review', 'final chunks never offer a nonexistent next chunk')

  const finalRendered = renderToString(React.createElement(overlay.ChunkCompletionOverlay, {
    result,
    chunkNumber: 5,
    chunkCount: 5,
    hasNextChunk: false,
    onContinueAuto: () => {},
    onNextChunk: () => {},
    onDismiss: () => {},
  })).replace(/<!--.*?-->/g, '')
  assert.doesNotMatch(finalRendered, /Next chunk/, 'the final active learner chunk cannot offer chunk 6')
  assert.match(finalRendered, /Review chunk/, 'the final active learner chunk retains a non-navigating review action')

  assert.equal(navigation.getNextActiveLearnerChunkIndex(0, 5), 1, 'chunk 1 of 5 opens active learner chunk 2')
  assert.equal(navigation.getNextActiveLearnerChunkIndex(3, 5), 4, 'chunk 4 of 5 opens active learner chunk 5')
  assert.equal(navigation.getNextActiveLearnerChunkIndex(4, 5), null, 'chunk 5 of 5 has no chunk 6')
  assert.equal(navigation.getNextActiveLearnerChunkIndex(0, 1), null, 'single-chunk courses never offer a nonexistent successor')

  const nextUrl = navigation.buildNextActiveLearnerChunkUrl(
    '/mates/m4/kill-box',
    '?mixedScope=unlocked&mixedPhase=blind&curriculumDecision=decision-7&chunk=3&learnerCurriculum=m4-v1',
    4,
    'm4-v1',
  )
  assert.equal(
    nextUrl,
    '/mates/m4/kill-box?mixedScope=unlocked&mixedPhase=blind&curriculumDecision=decision-7&chunk=4&learnerCurriculum=m4-v1',
    'next-chunk navigation preserves route provenance while replacing only the active learner chunk index',
  )
  assert.equal(
    navigation.buildNextActiveLearnerChunkUrl('/tactics/m2/knight-fork', '?chunk=48', 7, 'semantic-v4'),
    '/tactics/m2/knight-fork?chunk=7&learnerCurriculum=semantic-v4',
    'legacy chunk URLs transition to the versioned active learner curriculum instead of reusing source numbering',
  )

  const variableLengthMate = m2ToM5.getPatternMateM2ToM5LearnerCurriculum('kill-box-mate-4')
  assert.equal(variableLengthMate?.activeChunkCount, 7, 'variable-length M2–M5 mate curricula retain their active learner count')
  assert.equal(
    navigation.getNextActiveLearnerChunkIndex(6, variableLengthMate.activeChunkCount),
    null,
    'the final variable-length M2–M5 mate chunk has no extra successor',
  )
  const unavailableTactic = tactics.getPatternTacticLearnerCurriculum('tactic-king-fork-m3')
  assert.equal(unavailableTactic?.activeChunkCount, 0, 'unavailable tactic courses have no active chunks to navigate')
  assert.equal(
    navigation.getNextActiveLearnerChunkIndex(0, unavailableTactic.activeChunkCount),
    null,
    'unavailable tactic courses cannot synthesize a next chunk',
  )

  const continueOnce = overlay.createContinueAutoOnceController()
  let continueCalls = 0
  assert.equal(continueOnce.run(() => { continueCalls += 1 }), true, 'Continue Auto accepts its first activation')
  assert.equal(continueOnce.run(() => { continueCalls += 1 }), false, 'Continue Auto ignores a second activation')
  assert.equal(continueCalls, 1, 'Continue Auto cannot trigger duplicate navigation or completion work')

  const nextChunkOnce = overlay.createChunkCompletionActionOnceController()
  let nextChunkCalls = 0
  assert.equal(nextChunkOnce.run(() => { nextChunkCalls += 1 }), true, 'Next chunk accepts its first activation')
  assert.equal(nextChunkOnce.run(() => { nextChunkCalls += 1 }), false, 'Next chunk ignores a second activation')
  assert.equal(nextChunkCalls, 1, 'Next chunk cannot replay progress, quota, or curriculum completion work')

  const componentSource = await readFile('src/trainers/ChunkCompletionOverlay.tsx', 'utf8')
  const stylesheet = await readFile('src/trainers/chunkCompletionOverlay.css', 'utf8')
  assert.match(componentSource, /role="dialog"/, 'the overlay is announced as a dialog')
  assert.match(componentSource, /aria-modal="true"/, 'the overlay is modal to assistive technology')
  assert.match(componentSource, /continueButtonRef\.current\?\.focus\(\)/, 'the Continue Auto button receives focus when opened')
  assert.match(componentSource, /event\.key === 'Escape'/, 'Escape dismisses the overlay')
  assert.match(componentSource, /Next chunk/, 'the overlay exposes Next chunk only through its explicit action')
  assert.match(componentSource, /Review chunk/, 'the final chunk has an honest non-navigating secondary action')
  assert.match(stylesheet, /@media \(max-width: 768px\)/, 'mobile sizing has an explicit safe-margin rule')
  assert.match(stylesheet, /prefers-reduced-motion/, 'celebration animation honors reduced-motion preferences')

  for (const trainerPath of [
    'src/trainers/patternMate/PatternMateTrainer.tsx',
    'src/trainers/patternTactic/PatternTacticTrainer.tsx',
  ]) {
    const source = await readFile(trainerPath, 'utf8')
    assert.match(source, /ChunkCompletionOverlay/, `${trainerPath} renders the shared board-centered completion overlay`)
    assert.match(source, /const completionOverlayResult = debugCompletionOverlayOpen[\s\S]*?curriculumCompletionCard/, `${trainerPath} selects mock data only through the explicitly gated debug overlay state`)
    assert.match(source, /shouldShowChunkCompletionOverlay\(completionOverlayResult, completionOverlayDismissed\)/, `${trainerPath} only opens the overlay from its gated completion result`)
    assert.match(source, /scheduleCorrectAutoAdvance\(goToNextPuzzle\)/, `${trainerPath} preserves the one-second final-success transition before completion`)
    assert.match(source, /setCurriculumCompletionCard\(card\)/, `${trainerPath} uses the same result object for the side panel and overlay`)
    assert.match(source, /setCompletionOverlayDismissed\(false\)/, `${trainerPath} resets dismissal only when a new chunk/completion result is loaded`)
    assert.match(source, /setCurriculumCompletionCard\(null\)[\s\S]*?curriculumCompletionInFlightRef\.current = false/, `${trainerPath} does not reconstruct an overlay or another completion event on a fresh load`)
    assert.match(source, /onContinueAuto=\{\(\) => window\.location\.assign\('\/auto'\)\}/, `${trainerPath} preserves Auto Study routing from the celebration`)
    assert.match(source, /goToNextActiveLearnerChunk/, `${trainerPath} has a dedicated active learner next-chunk action`)
    assert.match(source, /getNextActiveLearnerChunkIndex\(currentChunkIndex, chunkFiles\.length\)/, `${trainerPath} bases availability on active learner chunks, not legacy source chunk counts`)
    assert.match(source, /buildNextActiveLearnerChunkUrl/, `${trainerPath} preserves route provenance when it advances learner chunks`)
    assert.match(source, /window\.history\.replaceState/, `${trainerPath} updates the visible route without replaying completion logic`)
    assert.match(source, /void loadChunkByIndex\(nextChunkIndex, undefined, 0\)/, `${trainerPath} loads the next active chunk directly without calling completion persistence again`)
    assert.match(source, /debugChunkCompleteRequested/, `${trainerPath} reads the debug query through the environment gate`)
    assert.match(source, /DEBUG_CHUNK_COMPLETION_RESULT/, `${trainerPath} uses in-memory mock data rather than recording completion`)
    assert.match(source, /Preview completion/, `${trainerPath} exposes the small Preview/local-only launch control`)
  }

  console.log('PASS: completion overlay is gated by real completion, uses active learner Next chunk navigation, and Continue Auto runs once')
  console.log('PASS: Pattern Mate and Pattern Tactic share the same board-centered accessible completion presentation')
} finally {
  await vite.close()
}
