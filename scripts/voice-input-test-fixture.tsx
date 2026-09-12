// Test-only entry, never imported by the application or production build.
import React, { useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Chess } from 'chess.js'
import VoiceMoveInput from '../src/trainers/voice/VoiceMoveInput'
import { useTrainerInputMode } from '../src/trainers/voice/useTrainerInputMode'
import { PuzzlePerfectionTracker } from '../src/trainers/puzzlePerfection'
import { submitVoiceMove, submitIllegalVoiceAnswer } from '../src/trainers/voice/submitVoiceMove'

class FakeRecognition {
  static instances: FakeRecognition[] = []
  static active = 0
  static overlaps = 0
  static starts = 0
  static settings = ''
  interimResults = false
  maxAlternatives = 1
  running = false
  onstart; onspeechstart; onresult; onerror; onend
  constructor() { FakeRecognition.instances.push(this) }
  start() {
    if (FakeRecognition.active) FakeRecognition.overlaps++
    this.running = true; FakeRecognition.active++; FakeRecognition.starts++
    FakeRecognition.settings = `${this.maxAlternatives}/${this.interimResults}`
    this.onstart?.()
  }
  end() {
    if (this.running) { this.running = false; FakeRecognition.active-- }
    this.onend?.()
  }
  abort() { setTimeout(() => this.end(), 30) }
}
if (!location.search.includes('unsupported')) (window as any).SpeechRecognition = FakeRecognition
else { (window as any).SpeechRecognition = undefined; (window as any).webkitSpeechRecognition = undefined }

function Fixture() {
  const input = useTrainerInputMode()
  const tracker = useRef(new PuzzlePerfectionTracker())
  const [generation, setGeneration] = useState(0)
  const [fen, setFen] = useState(new Chess().fen())
  const [done, setDone] = useState(false)
  const [result, setResult] = useState('Ready')
  const [text, setText] = useState('e four')
  const [alternatives, setAlternatives] = useState('[{"transcript":"e four","confidence":0.95}]')
  const [submissions, setSubmissions] = useState(0)
  const [providerStats, setProviderStats] = useState('')
  const lateResult = useRef<(() => void) | null>(null)
  function reset() {
    tracker.current.resetAttempt()
    tracker.current.activateLearnerPosition(performance.now(), ['e2e4'])
    setFen(new Chess().fen()); setDone(false); setResult('Ready'); setGeneration(value => value + 1)
  }
  function latest() { return FakeRecognition.instances.at(-1) }
  return <>
    <button onClick={reset}>New test position</button>
    <button onClick={() => latest()?.onspeechstart?.()}>Speech begins</button>
    <label>Test transcript <input value={text} onChange={event => setText(event.target.value)} /></label>
    <button onClick={() => latest()?.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: true })] })}>Final transcript</button>
    <label>Test alternatives <input value={alternatives} onChange={event => setAlternatives(event.target.value)} /></label>
    <button onClick={() => latest()?.onresult?.({ resultIndex: 0, results: [Object.assign(JSON.parse(alternatives), { isFinal: true })] })}>Final alternatives</button>
    <button onClick={() => {
      const callback = latest()?.onresult
      const items = JSON.parse(alternatives)
      lateResult.current = () => callback?.({ resultIndex: 0, results: [Object.assign(items, { isFinal: true })] })
      callback?.({ resultIndex: 0, results: [Object.assign(items, { isFinal: false })] })
    }}>Interim alternatives</button>
    <button onClick={() => lateResult.current?.()}>Late final result</button>
    <button onClick={() => latest()?.onresult?.({ resultIndex: 0, results: [
      Object.assign([{ transcript: 'e4', confidence: 0.99 }], { isFinal: true }),
      Object.assign([{ transcript: 'd4', confidence: 0.99 }], { isFinal: true }),
    ] })}>Conflicting result batch</button>
    <button onClick={() => latest()?.end()}>Normal recognition end</button>
    <button onClick={() => { const current = latest(); current?.onerror?.({ error: 'no-speech' }); current?.end(); current?.end() }}>No speech and duplicate end</button>
    <button onClick={() => setProviderStats(`${FakeRecognition.starts}/${FakeRecognition.overlaps}/${FakeRecognition.settings}`)}>Read provider stats</button>
    <button onClick={() => latest()?.onerror?.({ error: 'not-allowed' })}>Deny microphone</button>
    <VoiceMoveInput fen={fen} positionKey={`${generation}:${fen}`} disabled={done} mode={input.mode} setMode={input.setMode}
      getPositionShownAt={() => tracker.current.snapshot().positionActiveAt}
      onIllegalAnswer={(command, timing) => submitIllegalVoiceAnswer(fen, command, timing, tracker.current, () => {
        tracker.current.markSilentError()
        setResult('Wrong, silent error')
      })}
      onMove={(move, timing) => submitVoiceMove(fen, move, timing, tracker.current, (from, to, options) => {
        const board = new Chess(fen); board.move({ from, to, promotion: options.promotion })
        setSubmissions(value => value + 1)
        setFen(board.fen()); setDone(true)
        setResult(tracker.current.isPerfectSolve() ? 'Qualifying' : 'Not qualifying')
        return true
      })} />
    <p data-testid="result">{result}</p>
    <p data-testid="mouse">{input.mouseEnabled ? 'Mouse enabled' : 'Mouse disabled'}</p>
    <p data-testid="submissions">{submissions}</p>
    <p data-testid="provider-stats">{providerStats}</p>
  </>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
