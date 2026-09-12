import { Chess } from 'chess.js'
import type { Move } from 'chess.js'
import type { SpeechHypothesis } from './speechRecognition'

const pieces: Record<string, string> = { king: 'k', queen: 'q', rook: 'r', bishop: 'b', knight: 'n', night: 'n', pawn: 'p' }
const ranks: Record<string, string> = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8' }
// ASR aliases are allowed only as the leading piece in a complete move phrase,
// never as global word substitutions. Legal-move matching still decides validity.
const rookSpeechAlias = /^(look|route|root|rock)(?=\s+(?:(?:from\s+)?[a-h](?:\s*[1-8])?\s+)?(?:(?:to|takes|take|capture|captures)\s+)?[a-h]\s*[1-8](?:\s+(?:check|mate|checkmate))?$)/

const square = '[a-h]\\s*[1-8]'
const pieceWord = '(?:king|queen|rook|look|route|root|rock|bishop|knight|night|pawn|[kqrbnp])'
const spokenMove = new RegExp(`^(?:(?:${pieceWord}|[a-h]\\s+pawn)\\s+)?(?:(?:from\\s+)?(?:${square}|[a-h]|[1-8])\\s+)?(?:(?:to|takes|take|capture|captures)\\s+)?${square}(?:\\s+(?:(?:promotes?|promotion)(?:\\s+to)?\\s+)?(?:queen|rook|bishop|knight|night|[qrbn]))?(?:\\s+(?:check|mate|checkmate))?$`)
function completeMovePhrase(text: string) {
  return spokenMove.test(text) || /^(?:[kqrbnp]?[a-h]?[1-8]?x?[a-h][1-8](?:=?[qrbn])?|[a-h]pawnx[a-h][1-8]|o-o(?:-o)?|0-0(?:-0)?)$/.test(text.replace(/\s+/g, '')) ||
    /^(?:castle (?:king\s?side|queen\s?side)|(?:short|long) castle)$/.test(text)
}
function speechWords(transcript: string) {
  const text = transcript.toLowerCase().trim().replace(/[+#.,!?]/g, '').trim()
    .replace(/\b(one|two|three|four|five|six|seven|eight)\b/g, word => ranks[word])
  // Homophones are coordinate ranks only, and only within a complete move.
  const candidate = text.replace(/\b([a-h])\s+(won|too|for|ate)\b/g,
    (_, file: string, rank: string) => `${file} ${{ won: '1', too: '2', for: '4', ate: '8' }[rank]}`)
  return completeMovePhrase(candidate) ? candidate : text
}

export function isCompleteChessSpeech(transcript: string) { return completeMovePhrase(speechWords(transcript)) }

export function normalizeChessSpeech(transcript: string) {
  return speechWords(transcript)
    .replace(rookSpeechAlias, 'rook')
    .replace(/\b(king|queen|rook|bishop|knight|night|pawn)\b/g, word => pieces[word])
    .replace(/\b(takes|take|capture|captures)\b/g, 'x')
    .replace(/\b(to|move|go|on|check|mate|checkmate|from|promotes|promote|promotion)\b/g, '')
    .replace(/\s+/g, '')
}

export type ChessVoiceMatch =
  | { kind: 'match'; move: Move; normalized: string }
  | { kind: 'ambiguous'; moves: Move[]; normalized: string }
  | { kind: 'none'; normalized: string }

/** Aliases come only from legal moves, never a guessed SAN move. */
export function legalMoveVoiceAliases(move: Move): Set<string> {
  const aliases = new Set([normalizeChessSpeech(move.san)])
  if (move.flags.includes('k') || move.flags.includes('q')) {
    for (const alias of move.flags.includes('k')
      ? ['castle kingside', 'castle king side', 'short castle', 'O-O', '0-0']
      : ['castle queenside', 'castle queen side', 'long castle', 'O-O-O', '0-0-0']) aliases.add(normalizeChessSpeech(alias))
  }
  // An omitted promotion piece matches all legal promotions: never auto-queen.
  const suffixes = move.promotion ? ['', move.promotion, `=${move.promotion}`] : ['']
  const captures = move.captured ? ['', 'x'] : ['']
  const prefixes = [move.piece, `${move.piece}${move.from}`, `${move.piece}${move.from[0]}`, `${move.piece}${move.from[1]}`, move.from]
  if (move.piece === 'p') prefixes.push('', move.from[0], `${move.from[0]}p`)
  for (const prefix of prefixes) for (const capture of captures) for (const suffix of suffixes) aliases.add(`${prefix}${capture}${move.to}${suffix}`)
  return aliases
}

export function matchChessSpeech(fen: string, transcript: string): ChessVoiceMatch {
  const normalized = normalizeChessSpeech(transcript)
  if (!normalized) return { kind: 'none', normalized }
  try {
    const matches = new Chess(fen).moves({ verbose: true }).filter(move => legalMoveVoiceAliases(move).has(normalized))
    if (matches.length === 1) return { kind: 'match', move: matches[0], normalized }
    if (matches.length > 1) return { kind: 'ambiguous', moves: matches, normalized }
  } catch { /* Unavailable/invalid position: no submission. */ }
  return { kind: 'none', normalized }
}

export const INTERIM_MOVE_CONFIDENCE = 0.90
export type ChessVoiceCommand = {
  piece: string; source?: string; destination: string; capture: boolean; promotion?: string
}

/** Recognize an answer independently of legality or the puzzle's solution. */
export function interpretChessAnswer(fen: string, transcript: string) {
  const normalized = normalizeChessSpeech(transcript)
  if (!isCompleteChessSpeech(transcript)) return { kind: 'none' as const }
  let board: Chess
  try { board = new Chess(fen) } catch { return { kind: 'none' as const } }
  const legal = matchChessSpeech(fen, transcript)
  if (legal.kind === 'ambiguous') return { kind: 'ambiguous' as const }
  if (legal.kind === 'match') return { kind: 'legal' as const, move: legal.move, key: `${legal.move.from}${legal.move.to}${legal.move.promotion ?? ''}` }
  let commandText = normalized.replace(/^([a-h])p/, 'p$1')
  const rank = board.turn() === 'w' ? '1' : '8'
  if (['castlekingside', 'castlekside', 'shortcastle', 'o-o', '0-0'].includes(commandText)) commandText = `ke${rank}g${rank}`
  if (['castlequeenside', 'castleqside', 'longcastle', 'o-o-o', '0-0-0'].includes(commandText)) commandText = `ke${rank}c${rank}`
  const parts = /^([kqrbnp])?([a-h][1-8]|[a-h]|[1-8])?(x)?([a-h][1-8])(?:=?([qrbn]))?$/.exec(commandText)
  if (!parts) return { kind: 'none' as const }
  const [, namedPiece, source, capture, destination, promotion] = parts
  const sourcePiece = source?.length === 2 ? board.board().flat().find(piece => piece?.square === source) : undefined
  const piece = namedPiece ?? sourcePiece?.type ?? 'p'
  const command: ChessVoiceCommand = { piece, source, destination, capture: !!capture, promotion }
  const sources = board.board().flat().filter(candidate => candidate && candidate.color === board.turn() && candidate.type === piece &&
    (!source || candidate.square === source || (source.length === 1 && candidate.square.includes(source))))
  // With no legal resolution, multiple possible source pieces require clarification.
  // Zero sources is still a clear impossible answer (e.g. naming an absent queen).
  if (sources.length > 1) return { kind: 'ambiguous' as const }
  return { kind: 'illegal' as const, command, key: `illegal:${piece}:${sources[0]?.square ?? source ?? ''}:${destination}:${capture ?? ''}:${promotion ?? ''}` }
}

export function matchChessAlternatives(fen: string, hypotheses: SpeechHypothesis[]) {
  const alternatives = hypotheses.map(hypothesis => ({ ...hypothesis, result: matchChessSpeech(fen, hypothesis.transcript), answer: interpretChessAnswer(fen, hypothesis.transcript), complete: isCompleteChessSpeech(hypothesis.transcript) }))
  const candidates = new Map<string, ReturnType<typeof interpretChessAnswer>>()
  for (const { answer } of alternatives) if (answer.kind === 'legal' || answer.kind === 'illegal') candidates.set(answer.key, answer)
  const answers = [...candidates.values()]
  const isFinal = alternatives.length > 0 && alternatives.every(item => item.isFinal)
  let reason = 'No clear chess answer — try again'
  const ambiguous = answers.length > 1 || alternatives.some(item => item.answer.kind === 'ambiguous')
  if (ambiguous) reason = 'Ambiguous alternatives — clarify the piece, source square or promotion'
  else if (answers.length === 1) {
    // Interim hypotheses can change: partial/unmatched alternatives or missing
    // confidence wait for the final result, never guess from the top alternative.
    const confident = alternatives.some(item => (item.answer.kind === 'legal' || item.answer.kind === 'illegal') && Number.isFinite(item.confidence) && item.confidence! >= INTERIM_MOVE_CONFIDENCE && item.confidence! <= 1)
    const complete = alternatives.every(item => item.complete && (item.answer.kind === 'legal' || item.answer.kind === 'illegal'))
    const answer = answers[0]
    if (answer.kind === 'legal' && (isFinal || (complete && confident))) return { kind: 'match' as const, move: answer.move, reason: isFinal ? 'Unique legal answer (final)' : 'Unique legal answer (confident interim)', alternatives }
    // Do not penalize speculative ASR output. A clear illegal answer is submitted
    // as a failure, never as a fabricated chess.js move. Wait for final speech.
    if (answer.kind === 'illegal' && isFinal && confident) return { kind: 'illegal' as const, command: answer.command, reason: 'Clear illegal chess answer', alternatives }
    reason = 'Waiting for complete, confident speech or final result'
  }
  return { kind: ambiguous ? 'ambiguous' as const : 'none' as const, reason, alternatives }
}
