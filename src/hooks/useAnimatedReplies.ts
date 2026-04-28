import { useRef, useState } from 'react'
import { Chess } from 'chess.js'
import type { Square } from 'chess.js'

type AnimatedReplyPhase = 'start' | 'move'

export type AnimatedReply = {
  piece:
    | 'wP' | 'wN' | 'wB' | 'wR' | 'wQ' | 'wK'
    | 'bP' | 'bN' | 'bB' | 'bR' | 'bQ' | 'bK'
  from: string
  to: string
  phase: AnimatedReplyPhase
} | null

function parseUci(uci: string) {
  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion:
      uci.length === 5 ? (uci[4] as 'q' | 'r' | 'b' | 'n') : undefined,
  }
}

type PlayReplySequenceArgs = {
  baseGame: Chess
  replyMoves: string[]
  animationMs: number
  pauseAfterMs: number
  onPosition: (nextGame: Chess) => void
  onMessage?: (message: string) => void
  onDone: (finalGame: Chess) => void
}

export function useAnimatedReplies() {
  const chainTimerRef = useRef<number | null>(null)
  const finishMoveTimerRef = useRef<number | null>(null)
  const startMoveTimerRef = useRef<number | null>(null)
  const cleanupTimerRef = useRef<number | null>(null)

  const [lastMoveHighlight, setLastMoveHighlight] = useState<string | null>(null)
  const [replySquare, setReplySquare] = useState<string | null>(null)
  const [animatedReply, setAnimatedReply] = useState<AnimatedReply>(null)
  const [suppressBoardAnimation, setSuppressBoardAnimation] = useState(false)

  function clearReplyTimer() {
    if (chainTimerRef.current) {
      window.clearTimeout(chainTimerRef.current)
      chainTimerRef.current = null
    }
    if (finishMoveTimerRef.current) {
      window.clearTimeout(finishMoveTimerRef.current)
      finishMoveTimerRef.current = null
    }
    if (startMoveTimerRef.current) {
      window.clearTimeout(startMoveTimerRef.current)
      startMoveTimerRef.current = null
    }
    if (cleanupTimerRef.current) {
      window.clearTimeout(cleanupTimerRef.current)
      cleanupTimerRef.current = null
    }
  }

  function clearReplyEffects() {
    setLastMoveHighlight(null)
    setReplySquare(null)
    setAnimatedReply(null)
    setSuppressBoardAnimation(false)
  }

  function playReplySequence({
    baseGame,
    replyMoves,
    animationMs,
    pauseAfterMs,
    onPosition,
    onMessage,
    onDone,
  }: PlayReplySequenceArgs) {
    if (replyMoves.length === 0) {
      setSuppressBoardAnimation(false)
      onDone(baseGame)
      return
    }

    const finalGame = new Chess(baseGame.fen())
    const replyMove = replyMoves[0]
    const parsedReply = parseUci(replyMove)
    const pieceBeforeReply = finalGame.get(parsedReply.from as Square)
    const reply = finalGame.move(parsedReply)

    if (!reply || !pieceBeforeReply) {
      setSuppressBoardAnimation(false)
      onDone(baseGame)
      return
    }

    const ghostlessGame = new Chess(baseGame.fen())

    try {
      ghostlessGame.remove(reply.from as Square)
      const pieceOnTargetBefore = baseGame.get(reply.to as Square)
      if (pieceOnTargetBefore) {
        ghostlessGame.remove(reply.to as Square)
      }
    } catch {
      setSuppressBoardAnimation(false)
      onDone(baseGame)
      return
    }

    const pieceCode = `${pieceBeforeReply.color}${pieceBeforeReply.type.toUpperCase()}` as AnimatedReply['piece']

    setSuppressBoardAnimation(true)
    setLastMoveHighlight(null)
    setReplySquare(null)
    setAnimatedReply({
      piece: pieceCode,
      from: reply.from,
      to: reply.to,
      phase: 'start',
    })

    onPosition(ghostlessGame)
    onMessage?.('Good. Opponent reply played.')

    startMoveTimerRef.current = window.setTimeout(() => {
      setAnimatedReply({
        piece: pieceCode,
        from: reply.from,
        to: reply.to,
        phase: 'move',
      })
    }, 16)

    finishMoveTimerRef.current = window.setTimeout(() => {
      onPosition(finalGame)
      setLastMoveHighlight(replyMove)
      setReplySquare(reply.to)

      cleanupTimerRef.current = window.setTimeout(() => {
        setAnimatedReply(null)
        setSuppressBoardAnimation(false)

        chainTimerRef.current = window.setTimeout(() => {
          playReplySequence({
            baseGame: finalGame,
            replyMoves: replyMoves.slice(1),
            animationMs,
            pauseAfterMs,
            onPosition,
            onMessage,
            onDone,
          })
        }, pauseAfterMs)
      }, 24)
    }, animationMs)
  }

  return {
    lastMoveHighlight,
    replySquare,
    animatedReply,
    suppressBoardAnimation,
    clearReplyTimer,
    clearReplyEffects,
    playReplySequence,
    setLastMoveHighlight,
  }
}