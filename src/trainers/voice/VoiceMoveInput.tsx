import { useEffect, useId, useState } from 'react'
import type { Move } from 'chess.js'
import { matchChessAlternatives, interpretChessAnswer } from './chessVoiceParser'
import type { ChessVoiceCommand } from './chessVoiceParser'
import { useSpeechRecognition } from './useSpeechRecognition'
import type { SpeechTiming } from './speechRecognition'
import type { TrainerInputMode } from './useTrainerInputMode'
import { useAiTranscription } from './useAiTranscription'

export default function VoiceMoveInput({ fen, positionKey, disabled, mode, setMode, getPositionShownAt, onMove, onIllegalAnswer, onAiReady }: {
  fen: string; positionKey: string; disabled: boolean
  mode: TrainerInputMode; setMode: (mode: TrainerInputMode) => void
  getPositionShownAt: () => number | null
  onMove: (move: Move, timing: SpeechTiming) => boolean
  onIllegalAnswer: (command: ChessVoiceCommand, timing: SpeechTiming) => boolean
  onAiReady?: (ready: boolean) => void
}) {
  const id = useId()
  const [heard, setHeard] = useState('')
  const [matchStatus, setMatchStatus] = useState('')
  const [diagnostics, setDiagnostics] = useState<SpeechTiming | null>(null)
  const [recognitionLog, setRecognitionLog] = useState<string[]>([])
  const development = import.meta.env?.DEV === true
  function log(message: string) {
    if (development) setRecognitionLog(lines => [...lines.slice(-79), message])
  }
  useEffect(() => { setHeard(''); setMatchStatus(''); setDiagnostics(null) }, [positionKey])
  const aiMode = mode === 'ai-voice' || mode === 'ai-both'
  const ai = useAiTranscription({
    enabled: aiMode && !disabled, positionKey, getPositionShownAt, onDiagnostic: log,
    onTranscript(transcript, timing) {
      setHeard(transcript); setDiagnostics(timing)
      // A finalized AI transcript has no browser confidence score. Do not invent
      // one: the existing complete-command parser distinguishes clarity/legality.
      const answer = interpretChessAnswer(fen, transcript)
      log(`[parser] returnedTranscript=${JSON.stringify(transcript)}; result=${answer.kind}`)
      if (answer.kind === 'legal') {
        const submitted = onMove(answer.move, timing)
        log(`[trainer] legal answer ${answer.key} passed to existing move handler; returned=${submitted}`)
        setMatchStatus(submitted ? `Move submitted: ${answer.move.san}` : 'Move not submitted — try again')
        return submitted
      }
      if (answer.kind === 'illegal') {
        const submitted = onIllegalAnswer(answer.command, timing)
        log(`[trainer] clear illegal answer passed to existing Silent error handler; returned=${submitted}`)
        setMatchStatus(submitted ? 'Illegal move submitted' : 'Answer not submitted — try again')
        return submitted ? 'continue' : false
      }
      log(`[parser] rejection: ${answer.kind === 'ambiguous' ? 'ambiguous move/source; clarification required' : 'no recognized complete chess command'}; no chess answer submitted`)
      setMatchStatus(answer.kind === 'ambiguous' ? 'Ambiguous move — clarify the source square' : 'Could not understand — try again')
      return false
    },
  })
  useEffect(() => { onAiReady?.(aiMode && ai.ready && !disabled); return () => onAiReady?.(false) }, [aiMode, ai.ready, disabled, onAiReady])
  const speech = useSpeechRecognition({
    enabled: development && (mode === 'voice' || mode === 'both') && !disabled, positionKey, getPositionShownAt,
    onDiagnostic: log,
    onHypotheses(hypotheses, timing) {
      setHeard(hypotheses.map(item => item.transcript).join(' / ').slice(0, 500)); setDiagnostics(timing)
      const result = matchChessAlternatives(fen, hypotheses)
      for (const [index, item] of result.alternatives.entries()) log(`${item.isFinal ? 'final' : 'interim'} result ${item.resultIndex}, alternative ${index + 1}: ${JSON.stringify(item.transcript)} confidence=${item.confidence ?? 'unavailable'} answer=${item.answer.kind} parser=${item.result.kind}${item.result.kind === 'match' ? ` ${item.result.move.san}` : ''}`)
      log(`${result.reason}${result.kind === 'match' ? `: ${result.move.san}` : ''}`)
      if (result.kind === 'illegal') {
        const submitted = onIllegalAnswer(result.command, timing)
        setMatchStatus(submitted ? 'Illegal move submitted' : 'Answer not submitted — try again')
        log(submitted ? 'existing Silent error action invoked; board unchanged' : 'trainer rejected stale/inactive answer')
        return submitted ? 'continue' : false
      }
      if (result.kind !== 'match') { setMatchStatus(result.reason); return false }
      const submitted = onMove(result.move, timing)
      log(submitted ? `submitted ${result.move.san}` : 'existing trainer rejected submission')
      // The trainer decides correctness; accepting input is not a correct answer.
      setMatchStatus(submitted ? `Move submitted: ${result.move.san}` : 'Move not submitted — try again')
      return submitted
    },
  })
  const provider = aiMode || !development ? ai : speech
  return <div style={{ padding: '6px 0', fontSize: 13 }}>
    <label htmlFor={id}>Input </label>
    <select id={id} style={{ maxWidth: '100%' }} value={provider.supported ? mode : 'mouse'} onChange={event => setMode(event.target.value as TrainerInputMode)}>
      <option value="mouse">Mouse</option>
      <option value="ai-voice" disabled={!ai.supported}>AI Voice</option>
      <option value="ai-both" disabled={!ai.supported}>Mouse + AI Voice</option>
      {development && <>
        <option value="voice" disabled={!speech.supported}>Experimental Browser Voice</option>
        <option value="both" disabled={!speech.supported}>Mouse + Experimental Browser Voice</option>
      </>}
    </select>{' '}
    <button type="button" disabled={!ai.supported && !(development && speech.supported)} onClick={() => setMode(mode === 'mouse' ? (ai.supported ? 'ai-both' : development ? 'both' : 'mouse') : 'mouse')}>
      {mode === 'mouse' ? 'Enable microphone' : 'Disable microphone'}
    </button>
    {mode !== 'mouse' && <button type="button" disabled={disabled || !provider.supported} onClick={provider.retry}>Retry microphone</button>}
    {(mode !== 'mouse' || !provider.supported) && <>
      <div role="status" aria-live="polite" aria-atomic="true">{disabled ? 'Microphone paused' : provider.status}{heard && ` · Heard: ${heard}`}{matchStatus && ` · ${matchStatus}`}</div>
      <small>{aiMode ? 'English moves. Only short spoken commands are sent for transcription; recordings are not saved by Weiss Chess. Microphone permission is required.' : 'English moves. Your browser may process speech online. Microphone permission is required.'}</small>
      {aiMode && ai.quota?.tier === 'free' && <div>{ai.quota.remaining} / {ai.quota.limit} free uses remaining today</div>}
      {aiMode && ai.blocked === 'VOICE_QUOTA_EXCEEDED' && <div>
        {ai.quota?.tier === 'premium' ? 'Daily AI Voice safety limit reached. Try again after the UTC reset.' : <>AI Voice sample used for today. Premium includes AI voice training. <a href="/pricing">Upgrade</a></>}
        {' '}{development ? 'Mouse and Experimental Browser Voice remain available.' : 'Mouse remains available.'}
      </div>}
      {aiMode && ['AUTH_REQUIRED', 'INVALID_SESSION'].includes(ai.blocked) && <a href="/auth">Log in to try AI Voice</a>}
      {diagnostics && <details><summary>Voice timing</summary>
        Response: {Math.round((diagnostics.speechStartedAt ?? diagnostics.recognitionCompletedAt) - diagnostics.positionShownAt)} ms;
        transcription: {Math.round(diagnostics.recognitionCompletedAt - diagnostics.positionShownAt)} ms.
        {diagnostics.speechStartedAt === null && ' Speech-start unavailable; completion time used.'}
      </details>}
      {development && <details><summary>Speech recognition diagnostics</summary>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 180, overflowY: 'auto' }}>{recognitionLog.join('\n')}</pre>
      </details>}
    </>}
  </div>
}
