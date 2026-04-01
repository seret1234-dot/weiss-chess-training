import { useEffect } from 'react'
import { useBoardUiContext, type GlobalBoardState } from '../context/BoardUiContext'

export function useGlobalBoard(state: GlobalBoardState) {
  const { registerBoard, clearBoard } = useBoardUiContext()

  useEffect(() => {
    registerBoard(state)
  }, [
    registerBoard,
    state.isAvailable,
    state.fen,
    state.suggestedColor,
    state.canFlip,
    state.onFlip,
  ])

  useEffect(() => {
    return () => {
      clearBoard()
    }
  }, [])
}