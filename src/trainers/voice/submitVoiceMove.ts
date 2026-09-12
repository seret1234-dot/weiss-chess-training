import { Chess } from 'chess.js'
import type { Move } from 'chess.js'
import type { PuzzlePerfectionTracker } from '../puzzlePerfection'
import type { SpeechTiming } from './speechRecognition'
import { interpretChessAnswer } from './chessVoiceParser'
import type { ChessVoiceCommand } from './chessVoiceParser'

/** Revalidate against the live board, then invoke the existing Silent error action. */
export function submitIllegalVoiceAnswer(
  fen: string, command: ChessVoiceCommand, timing: SpeechTiming, tracker: PuzzlePerfectionTracker,
  recordSilentError: () => void,
) {
  const snapshot = tracker.snapshot()
  if (!snapshot.active || snapshot.positionActiveAt !== timing.positionShownAt || snapshot.learnerTurnsCompleted === snapshot.learnerTurnsActivated) return false
  const respondedAt = timing.speechStartedAt ?? timing.recognitionCompletedAt
  if (!Number.isFinite(respondedAt) || respondedAt < timing.positionShownAt || respondedAt > timing.recognitionCompletedAt) return false
  const phrase = `${command.piece}${command.source ?? ''}${command.capture ? 'x' : ''}${command.destination}${command.promotion ?? ''}`
  if (interpretChessAnswer(fen, phrase).kind !== 'illegal') return false
  recordSilentError()
  return true
}

/** Adapt speech timestamps into the existing intent + trainer evaluation path. */
export function submitVoiceMove(
  fen: string, move: Move, timing: SpeechTiming, tracker: PuzzlePerfectionTracker,
  submit: (from: string, to: string, options: { promotion?: 'q' | 'r' | 'b' | 'n'; allowWrongMoveToShow: boolean }) => boolean,
) {
  const snapshot = tracker.snapshot()
  if (!snapshot.active || snapshot.positionActiveAt !== timing.positionShownAt || snapshot.learnerTurnsCompleted === snapshot.learnerTurnsActivated) return false
  const legal = new Chess(fen).moves({ verbose: true }).find(candidate => candidate.from === move.from && candidate.to === move.to && candidate.promotion === move.promotion)
  if (!legal) return false
  const promotion = legal.promotion === 'q' || legal.promotion === 'r' || legal.promotion === 'b' || legal.promotion === 'n' ? legal.promotion : undefined
  if (legal.promotion && !promotion) return false
  // Missing speech-start: use completion conservatively, never invent a fast response.
  const respondedAt = timing.speechStartedAt ?? timing.recognitionCompletedAt
  if (!Number.isFinite(respondedAt) || respondedAt < timing.positionShownAt || respondedAt > timing.recognitionCompletedAt) return false
  tracker.beginSource(legal.from, respondedAt, 'fallback')
  tracker.recordDestination(legal.from, legal.to, respondedAt, legal.promotion)
  return submit(legal.from, legal.to, { promotion, allowWrongMoveToShow: true })
}
