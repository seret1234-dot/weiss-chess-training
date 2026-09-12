import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Chess } from 'chess.js'
import { createServer } from 'vite'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { matchChessSpeech, normalizeChessSpeech, matchChessAlternatives, isCompleteChessSpeech } = await vite.ssrLoadModule('/src/trainers/voice/chessVoiceParser.ts')
  const { submitVoiceMove, submitIllegalVoiceAnswer } = await vite.ssrLoadModule('/src/trainers/voice/submitVoiceMove.ts')
  const { PuzzlePerfectionTracker } = await vite.ssrLoadModule('/src/trainers/puzzlePerfection.ts')
  const { resolveTrainerInputMode } = await vite.ssrLoadModule('/src/trainers/voice/useTrainerInputMode.ts')
  const initial = new Chess().fen()
  const queen = '7k/8/6K1/7Q/8/8/8/8 w - - 0 1'
  const rook = '4r2k/8/8/8/8/8/8/K3R3 w - - 0 1'
  let cases = 0
  function matches(fen, phrase, san) {
    const result = matchChessSpeech(fen, phrase)
    assert.equal(result.kind, 'match', phrase)
    assert.equal(result.move.san, san, phrase)
    assert.equal(new Chess(fen).fen(), fen, 'parser leaves position unchanged')
    cases++
  }
  for (const phrase of ['queen h seven', 'queen to h seven mate', 'Q h seven', 'queen h7', 'Qh7#']) matches(queen, phrase, 'Qh7#')
  for (const phrase of ['rook takes e eight', 'rook capture e eight', 'rook from e1 to e8', 'Rxe8+', 'rook e8']) matches(rook, phrase, 'Rxe8+')
  // Operator-reported ASR errors: exact aliases in move context, not fuzzy text.
  const rookQuiet = '7k/8/8/8/8/8/8/K3R3 w - - 0 1'
  for (const alias of ['rook', 'look', 'route', 'root', 'rock']) {
    matches(rookQuiet, `${alias} e eight`, 'Re8+')
    matches(rook, `${alias} takes e eight`, 'Rxe8+')
    matches(rookQuiet, `${alias} f one`, 'Rf1')
    matches(rookQuiet, `${alias} to f one`, 'Rf1')
    matches(rook, `${alias} from e one takes e eight check`, 'Rxe8+')
    assert.equal(matchChessSpeech(initial, `${alias} e eight`).kind, 'none', 'blocked rook is not legal')
    assert.equal(matchChessSpeech(rookQuiet, `${alias} takes e eight`).kind, 'none', 'capture wording requires a capture')
  }
  const ambiguousRooks = '6k1/8/8/8/8/8/R6R/K7 w - - 0 1'
  for (const alias of ['look', 'route', 'root', 'rock']) {
    assert.equal(matchChessSpeech(ambiguousRooks, `${alias} e two`).kind, 'ambiguous', 'never guess which rook')
    matches(ambiguousRooks, `${alias} from a two to e two`, 'Rae2')
  }
  for (const phrase of ['look at e eight', 'look around', 'route to school', 'root of e eight', 'rock and roll', 'please look e eight', 'look e eight then f one', 'e eight root', 'queen look e eight', 'brook e eight']) {
    assert.equal(matchChessSpeech(rookQuiet, phrase).kind, 'none', phrase)
    assert.equal(/^(look|route|root|rock)\b/.test(phrase) ? normalizeChessSpeech(phrase).startsWith(phrase.split(' ')[0]) : true, true, 'ASR word must not be globally replaced')
  }
  matches('k7/8/7N/8/8/8/8/K7 w - - 0 1', 'knight f seven', 'Nf7')
  matches('k7/8/7N/8/8/8/8/K7 w - - 0 1', 'night f seven', 'Nf7')
  assert.equal(matchChessSpeech('7k/8/8/8/8/8/3N3N/K7 w - - 0 1', 'night f three').kind, 'ambiguous')
  matches('7k/8/8/8/8/8/8/K7 w - - 0 1', 'king b one', 'Kb1')
  matches('7k/8/8/8/8/8/8/KB6 w - - 0 1', 'bishop c two', 'Bc2')
  for (const phrase of ['e four', 'e4', 'pawn e four']) matches(initial, phrase, 'e4')
  assert.equal(matchChessSpeech(initial, 'rook takes e four').kind, 'none')
  assert.equal(matchChessSpeech(initial, 'e five').kind, 'none')
  assert.equal(matchChessSpeech(initial, 'please send money').kind, 'none')
  assert.equal(matchChessSpeech('invalid', 'e4').kind, 'none')
  const ambiguous = '7k/8/8/8/8/8/3N3N/K7 w - - 0 1'
  assert.equal(matchChessSpeech(ambiguous, 'knight f three').kind, 'ambiguous')
  matches(ambiguous, 'knight from d two to f three', 'Ndf3')
  matches(ambiguous, 'knight h2 f3', 'Nhf3')
  const capture = '7k/8/8/3p4/4P3/8/8/K7 w - - 0 1'
  for (const phrase of ['pawn takes d5', 'e pawn takes d five', 'exd5']) matches(capture, phrase, 'exd5')
  const castle = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'
  for (const phrase of ['castle kingside', 'castle king side', 'short castle', 'O-O']) matches(castle, phrase, 'O-O')
  for (const phrase of ['castle queenside', 'castle queen side', 'long castle']) matches(castle, phrase, 'O-O-O')
  assert.equal(matchChessSpeech(initial, 'short castle').kind, 'none')
  const promotion = '7k/4P3/8/8/8/8/8/K7 w - - 0 1'
  for (const phrase of ['e8 queen', 'e eight queen', 'e8 promotes to queen']) matches(promotion, phrase, 'e8=Q+')
  matches(promotion, 'e8 knight', 'e8=N')
  assert.equal(matchChessSpeech(promotion, 'e8').kind, 'ambiguous')
  assert.equal(resolveTrainerInputMode(null), 'mouse')
  assert.equal(resolveTrainerInputMode('invalid'), 'mouse')
  for (const mode of ['mouse', 'voice', 'both']) assert.equal(resolveTrainerInputMode(mode), mode)

  function trial(speechStartedAt, completion, expected, accepted = ['e2e4']) {
    const tracker = new PuzzlePerfectionTracker()
    tracker.resetAttempt(); tracker.activateLearnerPosition(100, accepted)
    let calls = 0
    const move = matchChessSpeech(initial, 'e4').move
    const timing = { positionShownAt: 100, speechStartedAt, recognitionCompletedAt: completion }
    assert.equal(submitVoiceMove(initial, move, timing, tracker, () => { calls++; return true }), true)
    assert.equal(calls, 1)
    assert.equal(tracker.isPerfectSolve(), expected)
    return { tracker, move, timing }
  }
  const fast = trial(1100, 9000, true) // Provider latency must not make a fast response slow.
  trial(5100, 9000, false)
  trial(null, 9000, false) // No speech-start event: conservative fallback.
  trial(2100, 9000, false) // Exact two-second boundary remains strict.
  trial(1100, 9000, false, ['d2d4']) // Legal but wrong still fails existing scoring.
  let called = false
  assert.equal(submitVoiceMove(initial, fast.move, fast.timing, fast.tracker, () => { called = true }), false, 'duplicate turn is rejected')
  fast.tracker.activateLearnerPosition(10000, ['e2e4'])
  assert.equal(submitVoiceMove(initial, fast.move, fast.timing, fast.tracker, () => { called = true }), false, 'stale speech cannot cross positions')
  assert.equal(called, false)
  const hypothesis = (transcript, confidence, isFinal = true) => ({ transcript, confidence, isFinal, resultIndex: 0 })
  for (let slot = 1; slot < 5; slot++) {
    const alternatives = Array.from({ length: 5 }, () => hypothesis('unrelated words', 0.99))
    alternatives[slot] = hypothesis('e four', 0.1)
    const result = matchChessAlternatives(initial, alternatives)
    assert.equal(result.kind, 'match', `legal alternative ${slot + 1}`)
    assert.equal(result.move.san, 'e4')
  }
  assert.equal(matchChessAlternatives(rook, ['look e eight', 'rook e eight', 'route e eight'].map(text => hypothesis(text, 0.5))).move.san, 'Rxe8+')
  assert.equal(matchChessAlternatives(initial, [hypothesis('e4', 0.99), hypothesis('d4', 0.01)]).kind, 'ambiguous', 'confidence never overrides conflicting legal moves')
  assert.equal(matchChessAlternatives(ambiguousRooks, [hypothesis('rook e2', 0.99), hypothesis('rook a2 e2', 0.95)]).kind, 'ambiguous', 'ambiguous alternative cannot be hidden by precise one')
  assert.equal(matchChessAlternatives(initial, []).kind, 'none')
  assert.equal(matchChessAlternatives(initial, [hypothesis('hello', 1)]).kind, 'none')
  assert.equal(matchChessAlternatives(initial, [hypothesis('e four', 0.95, false)]).kind, 'match')
  for (const confidence of [undefined, 0, 0.89, NaN, 2]) assert.equal(matchChessAlternatives(initial, [hypothesis('e4', confidence, false)]).kind, 'none', 'interim requires useful confidence')
  assert.equal(matchChessAlternatives(initial, [hypothesis('e4', 0.99, false), hypothesis('d4', 0.01, false)]).kind, 'ambiguous')
  assert.equal(matchChessAlternatives(initial, [hypothesis('e4', 0.99, false), hypothesis('e', 0.1, false)]).kind, 'none', 'partial alternative waits for final')
  for (const phrase of ['queen', 'rook takes', 'e', 'e4 to', 'e4 from', 'e4 promotion', 'e4 then']) {
    assert.equal(isCompleteChessSpeech(phrase), false, phrase)
    assert.notEqual(matchChessAlternatives(initial, [hypothesis(phrase, 1, false)]).kind, 'match', phrase)
  }
  for (const phrase of ['look e ate', 'rook e ate', 'rook E8', 'rook e 8', 'rook e eight']) matches(rookQuiet, phrase, 'Re8+')
  matches(rook, 'route takes e ate check', 'Rxe8+')
  assert.equal(normalizeChessSpeech('e ate'), 'e8')
  assert.equal(matchChessSpeech(promotion, 'e ate').kind, 'ambiguous', 'coordinate homophone never guesses a promotion')
  matches(promotion, 'e ate queen', 'e8=Q+')
  assert.equal(matchChessAlternatives(promotion, [hypothesis('e ate', 0.99, false)]).kind, 'ambiguous')
  matches(rookQuiet, 'root to f won', 'Rf1')
  matches(initial, 'e for', 'e4')
  for (const [word, rank] of Object.entries({ one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, won: 1, too: 2, for: 4, ate: 8 })) {
    assert.equal(normalizeChessSpeech(`rook e ${word}`), `re${rank}`)
  }
  for (const phrase of ['I ate dinner', 'e ate dinner', 'look at e ate', 'route for school', 'queen e ate then']) {
    assert.equal(matchChessSpeech(rookQuiet, phrase).kind, 'none')
    assert.equal(normalizeChessSpeech(phrase).includes('ate'), phrase.includes('ate'), 'homophones unchanged outside move context')
  }
  // The queen starts on f5; h7 is mate, g6 is legal but not mate, e2 is illegal.
  const answerFen = '5N1k/8/8/5Q2/8/8/8/K7 w - - 0 1'
  const spoken = text => matchChessAlternatives(answerFen, [hypothesis(text, 0.99)])
  assert.equal(spoken('Qh7').move.san, 'Qh7#')
  assert.equal(spoken('queen g six').move.san, 'Qg6', 'legal wrong answers are not solution-filtered')
  const impossible = spoken('queen e two')
  assert.equal(impossible.kind, 'illegal')
  for (const phrase of ['queen e2', 'queen e two', 'queen E 2', 'Qe2']) {
    const answer = spoken(phrase)
    assert.equal(answer.kind, 'illegal', `${phrase}: clear illegal answer is not a no-match`)
    assert.doesNotMatch(answer.reason, /No clear chess answer/)
  }
  for (const phrase of ['castle kingside', 'castle king side', 'short castle', 'castle queenside', 'castle queen side']) {
    assert.equal(matchChessAlternatives(initial, [hypothesis(phrase, 0.99)]).kind, 'illegal', 'clear blocked castling is an answer')
  }
  assert.equal(matchChessAlternatives(capture, [hypothesis('e pawn takes d five', 0.99)]).move.san, 'exd5')
  for (const confidence of [undefined, 0.2, NaN]) assert.equal(matchChessAlternatives(answerFen, [hypothesis('queen e2', confidence)]).kind, 'none')
  assert.equal(matchChessAlternatives(answerFen, [hypothesis('queen e2', 0.99, false)]).kind, 'none', 'illegal interim waits for final before penalty')
  assert.equal(matchChessAlternatives(answerFen, [hypothesis('queen e2', 0.99), hypothesis('background words', 0.1)]).kind, 'illegal')
  assert.equal(matchChessAlternatives(answerFen, [hypothesis('queen e2', 0.99), hypothesis('queen h7', 0.1)]).kind, 'ambiguous', 'legal answer cannot erase conflicting illegal answer')
  assert.equal(matchChessAlternatives(answerFen, [hypothesis('queen e2', 0.99), hypothesis('queen e3', 0.1)]).kind, 'ambiguous')
  for (const phrase of ['background conversation', 'queen...', 'queen e', 'queen e2 to']) assert.equal(spoken(phrase).kind, 'none')
  assert.equal(matchChessAlternatives(ambiguousRooks, [hypothesis('rook e2', 0.99)]).kind, 'ambiguous')
  assert.equal(matchChessAlternatives(ambiguousRooks, [hypothesis('rook e3', 0.99)]).kind, 'ambiguous', 'ambiguous illegal source also requires clarification')
  for (const wrongType of ['legal', 'illegal']) {
    const tracker = new PuzzlePerfectionTracker()
    tracker.resetAttempt(); tracker.activateLearnerPosition(100, ['f5h7'])
    const timing = { positionShownAt: 100, speechStartedAt: 500, recognitionCompletedAt: 700 }
    let board = new Chess(answerFen)
    let failures = 0
    const wrongHandler = () => { failures++; tracker.markSubmittedWrongMove(); tracker.suspendLearnerPosition(); return true }
    const silentHandler = () => { failures++; tracker.markSilentError() }
    if (wrongType === 'legal') {
      assert.equal(submitVoiceMove(answerFen, spoken('Qg6').move, timing, tracker, (from, to) => { board.move({ from, to }); return wrongHandler() }), true)
    } else {
      const buttonTracker = new PuzzlePerfectionTracker()
      buttonTracker.resetAttempt(); buttonTracker.activateLearnerPosition(100, ['f5h7'])
      buttonTracker.markSilentError()
      assert.equal(submitIllegalVoiceAnswer(answerFen, impossible.command, timing, tracker, silentHandler), true)
      assert.deepEqual(tracker.snapshot(), buttonTracker.snapshot(), 'illegal voice and Silent error button have identical tracker state')
      assert.equal(board.fen(), answerFen, 'illegal answer never moves the board')
      assert.equal(tracker.snapshot().active, true, 'Silent error does not suspend the active learner position')
    }
    assert.equal(failures, 1)
    board = new Chess(answerFen)
    tracker.activateLearnerPosition(1000, ['f5h7'])
    assert.equal(submitVoiceMove(answerFen, spoken('Qh7').move, { positionShownAt: 1000, speechStartedAt: 1100, recognitionCompletedAt: 1200 }, tracker,
      (from, to) => { board.move({ from, to }); return true }), true)
    assert.equal(board.isCheckmate(), true)
    assert.equal(tracker.isPerfectSolve(), false, 'wrong then correct cannot recover perfect credit')
    assert.equal(submitIllegalVoiceAnswer(answerFen, impossible.command, timing, tracker, wrongHandler), false, 'stale command rejected')
  }
  for (const path of ['patternMate/PatternMateTrainer.tsx', 'patternTactic/PatternTacticTrainer.tsx']) {
    const text = await readFile(`src/trainers/${path}`, 'utf8')
    assert.match(text, /<VoiceMoveInput/)
    assert.match(text, /submitVoiceMove\(game.fen\(\), move, timing, perfectionTrackerRef.current, attemptUserMove\)/)
    assert.match(text, /mouseEnabled \? onDrop/)
    assert.match(text, /onIllegalAnswer=/)
    assert.match(text, /submitIllegalVoiceAnswer\(game.fen\(\), command, timing, perfectionTrackerRef.current,\s*handleSilentError\)/)
    assert.match(text, /onClick=\{handleSilentError\}/)
    assert.equal((text.match(/markSilentError\(\)/g) ?? []).length, 1, 'Voice and button share exactly one Silent error implementation')
    assert.equal((text.match(/markSubmittedWrongMove\(\)/g) ?? []).length, 1, 'one existing wrong-answer scoring block for mouse and voice')
  }
  console.log(`PASS: ${cases} speech aliases; all alternatives/consensus/conflicts; confident complete interim; coordinate homophones; legal/no-match/ambiguity/capture/castling/promotion; preference; fast/slow/fallback/stale/duplicate timing; shared trainer wiring`)
} finally { await vite.close() }
