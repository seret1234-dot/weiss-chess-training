import { useLayoutEffect, useRef } from 'react'
import VoiceMoveInput from '../voice/VoiceMoveInput'
import { useTrainerInputMode } from '../voice/useTrainerInputMode'
import { SecondaryButton } from '../../components/trainer/ui'
import { EndgameAttempt } from './EndgameAttempt'

type Promotion = 'q' | 'r' | 'b' | 'n'

/** Input adapter only: the supplied handler remains the move/result authority. */
export function useEndgameInput({ fen, attemptKey, active, canAnswer = active, moveStartedAt, onDrop, onSilentError }: {
  fen: string; attemptKey: string; active: boolean; moveStartedAt: number
  canAnswer?: boolean
  onDrop: (from: string, to: string, promotion?: Promotion) => boolean
  onSilentError: () => void
}) {
  const input = useTrainerInputMode()
  const attempt = useRef(new EndgameAttempt()).current
  const positionKey = `${attemptKey}:${fen}:${moveStartedAt}`
  const position = useRef({ key: '', shownAt: 0 })
  if (position.current.key !== positionKey) {
    position.current = { key: positionKey, shownAt: performance.now() - (Date.now() - moveStartedAt) }
  }
  useLayoutEffect(() => { attempt.begin(attemptKey) }, [attempt, attemptKey])
  function silentError() {
    if (!canAnswer) return false
    attempt.silentError()
    onSilentError()
    return true
  }
  return {
    attempt,
    elapsed: (startedAt: number) => attempt.elapsed(startedAt),
    onDrop(from: string, to: string, promotion?: Promotion) {
      if (!input.mouseEnabled) return false
      attempt.mouseMove()
      return onDrop(from, to, promotion)
    },
    mouseEnabled: input.mouseEnabled,
    silentError,
    silentButton: <SecondaryButton onClick={silentError} disabled={!canAnswer}>Silent error</SecondaryButton>,
    controls: <VoiceMoveInput fen={fen} positionKey={positionKey} disabled={!active}
      mode={input.mode} setMode={input.setMode} onAiReady={input.setAiReady}
      getPositionShownAt={() => active ? position.current.shownAt : null}
      onMove={(move, timing) => {
        if (!active || timing.positionShownAt !== position.current.shownAt) return false
        attempt.voiceMove(moveStartedAt, timing.speechStartedAt ?? timing.recognitionCompletedAt, performance.now(), Date.now())
        return onDrop(move.from, move.to, move.promotion as Promotion | undefined)
      }}
      onIllegalAnswer={(_command, timing) => timing.positionShownAt === position.current.shownAt && silentError()}
    />,
  }
}
