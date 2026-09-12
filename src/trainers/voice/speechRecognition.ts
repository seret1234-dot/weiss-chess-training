export type SpeechTiming = { positionShownAt: number; speechStartedAt: number | null; recognitionCompletedAt: number; speechEndedAt?:number; transcriptionCompletedAt?:number }
export type SpeechAlternative = { transcript: string; confidence?: number }
export type SpeechHypothesis = SpeechAlternative & { isFinal: boolean; resultIndex: number }
export type RecognitionResult = ArrayLike<SpeechAlternative> & { isFinal: boolean }

// Provider boundary: the chess parser does not depend on browser speech APIs.
export type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onstart: (() => void) | null
  onspeechstart: (() => void) | null
  onresult: ((event: { resultIndex: number; results: ArrayLike<RecognitionResult> }) => void) | null
  onerror: ((event: { error: string }) => void) | null
  onend: (() => void) | null
  start(): void
  abort(): void
}

export function getSpeechRecognition(): (new () => Recognition) | null {
  if (typeof window === 'undefined') return null
  const speechWindow = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null
}
