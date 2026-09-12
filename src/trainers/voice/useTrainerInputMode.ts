import { useState } from 'react'
import { getSpeechRecognition } from './speechRecognition'

export type TrainerInputMode = 'mouse' | 'voice' | 'both' | 'ai-voice' | 'ai-both'
export const TRAINER_INPUT_MODE_KEY = 'weiss-chess-trainer-input-mode-v1'
export function resolveTrainerInputMode(value: string | null): TrainerInputMode {
  if (value === 'ai-voice' || value === 'ai-both') return value
  // Old experimental preferences remain stored, but are active only in development.
  return import.meta.env?.DEV === true && (value === 'voice' || value === 'both') ? value : 'mouse'
}
export function useTrainerInputMode() {
  const [aiReady,setAiReady] = useState(false)
  const [mode, setModeState] = useState<TrainerInputMode>(() => {
    try { return resolveTrainerInputMode(window.localStorage.getItem(TRAINER_INPUT_MODE_KEY)) } catch { return 'mouse' }
  })
  function setMode(next: TrainerInputMode) {
    const available = resolveTrainerInputMode(next)
    setModeState(available)
    try { window.localStorage.setItem(TRAINER_INPUT_MODE_KEY, available) } catch { /* Session-only fallback. */ }
  }
  return { mode, setMode, setAiReady, mouseEnabled: mode === 'ai-voice' ? !aiReady : mode !== 'voice' || !getSpeechRecognition() }
}
