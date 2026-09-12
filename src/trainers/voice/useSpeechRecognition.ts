import { useEffect, useRef, useState } from 'react'
import { getSpeechRecognition } from './speechRecognition'
import type { Recognition, SpeechHypothesis, SpeechTiming } from './speechRecognition'

export function useSpeechRecognition({ enabled, positionKey, getPositionShownAt, onHypotheses, onDiagnostic }: {
  enabled: boolean
  positionKey: string
  getPositionShownAt: () => number | null
  onHypotheses: (hypotheses: SpeechHypothesis[], timing: SpeechTiming) => boolean | 'continue'
  onDiagnostic?: (message: string) => void
}) {
  const callbacks = useRef({ getPositionShownAt, onHypotheses, onDiagnostic, enabled, positionKey })
  callbacks.current = { getPositionShownAt, onHypotheses, onDiagnostic, enabled, positionKey }
  // Held until onend, including async abort during a position/mode change.
  const activeRecognizer = useRef<Recognition | null>(null)
  const [status, setStatus] = useState('Microphone off')
  const [retry, setRetry] = useState(0)
  const supported = !!getSpeechRecognition()
  useEffect(() => {
    if (!enabled || !supported) {
      setStatus(supported ? 'Microphone off' : 'Voice recognition unavailable in this browser')
      return
    }
    let disposed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let recognizer: Recognition | undefined
    let failures = 0
    const log = (message: string) => { if (!disposed) callbacks.current.onDiagnostic?.(message) }
    function listen() {
      clearTimeout(timer)
      if (disposed || !callbacks.current.enabled || callbacks.current.positionKey !== positionKey) return
      if (activeRecognizer.current) {
        setStatus('Waiting for microphone to stop…')
        timer = setTimeout(listen, 150)
        return
      }
      const positionShownAt = callbacks.current.getPositionShownAt()
      if (positionShownAt === null) {
        setStatus('Waiting for learner position')
        timer = setTimeout(listen, 150)
        return
      }
      const Constructor = getSpeechRecognition()!
      const current = new Constructor()
      recognizer = current
      let speechStartedAt: number | null = null
      let finished = false
      let fatal = false
      let ended = false
      const valid = () => !disposed && !finished && !ended && recognizer === current && callbacks.current.enabled &&
        callbacks.current.positionKey === positionKey && callbacks.current.getPositionShownAt() === positionShownAt
      current.lang = 'en-US'
      current.continuous = false
      current.interimResults = true
      current.maxAlternatives = 5
      current.onstart = () => { if (valid()) { setStatus('🎙 Listening'); log('recognition started') } }
      current.onspeechstart = () => { if (valid() && speechStartedAt === null) { speechStartedAt = performance.now(); log('speech started') } }
      current.onresult = event => {
        if (!valid()) return
        const hypotheses: SpeechHypothesis[] = []
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i]
          for (let alternative = 0; alternative < result.length; alternative++) {
            hypotheses.push({ transcript: result[alternative].transcript, confidence: result[alternative].confidence, isFinal: result.isFinal, resultIndex: i })
          }
        }
        if (!hypotheses.length) return
        failures = 0
        finished = true // Guard reentrant/late results while existing handler runs.
        const submitted = callbacks.current.onHypotheses(hypotheses, {
          positionShownAt, speechStartedAt, recognitionCompletedAt: performance.now(),
        })
        // Silent error consumes this utterance but leaves the learner position
        // active. Resume with a fresh recognizer after onend, never this result.
        if (submitted && submitted !== 'continue') fatal = true
        else if (!hypotheses.every(item => item.isFinal)) finished = false
        if (finished) {
          if (!submitted || submitted === 'continue') setStatus('Resuming microphone…')
          current.abort()
        }
      }
      current.onerror = event => {
        if (disposed || ended) return
        log(`recognition error: ${event.error}`)
        if (finished) return
        if (event.error === 'no-speech' || event.error === 'aborted') return
        fatal = true // Never loop on denied permission/network/device errors.
        setStatus(event.error === 'not-allowed' || event.error === 'service-not-allowed'
          ? 'Microphone permission denied — use Mouse or enable permission and retry'
          : `Voice unavailable (${event.error}) — use Mouse or retry`)
      }
      current.onend = () => {
        if (ended) return // Duplicate end callbacks must not schedule concurrent starts.
        ended = true
        if (activeRecognizer.current === current) activeRecognizer.current = null
        log('recognition ended')
        if (disposed || fatal) return
        failures += 1
        setStatus('Resuming microphone…')
        log('recognition restart scheduled')
        clearTimeout(timer)
        timer = setTimeout(listen, Math.min(250 * failures, 2000))
      }
      try {
        activeRecognizer.current = current
        setStatus('Starting microphone…'); log('recognition start requested'); current.start()
      } catch {
        ended = true
        if (activeRecognizer.current === current) activeRecognizer.current = null
        log('recognition start failed')
        setStatus('Microphone could not start — use Mouse or retry')
      }
    }
    listen()
    return () => {
      disposed = true
      clearTimeout(timer)
      if (recognizer) {
        recognizer.onstart = recognizer.onspeechstart = null
        recognizer.onresult = recognizer.onerror = null
        // Keep onend solely to release the active-instance barrier after abort.
        if (activeRecognizer.current === recognizer) recognizer.abort()
      }
    }
  }, [enabled, positionKey, supported, retry])
  return { supported, status, retry: () => setRetry(value => value + 1) }
}
