import React, { createContext, useCallback, useContext, useMemo, useState } from "react"

type Side = "white" | "black"

export type GlobalBoardState = {
  isAvailable: boolean
  fen: string | null
  suggestedColor?: Side
  canFlip?: boolean
  onFlip?: () => void
}

type BoardUiContextValue = {
  boardState: GlobalBoardState
  registerBoard: (state: GlobalBoardState) => void
  clearBoard: () => void
}

const defaultBoardState: GlobalBoardState = {
  isAvailable: false,
  fen: null,
  suggestedColor: undefined,
  canFlip: false,
  onFlip: undefined,
}

const BoardUiContext = createContext<BoardUiContextValue | null>(null)

export function BoardUiProvider({ children }: { children: React.ReactNode }) {
  const [boardState, setBoardState] = useState<GlobalBoardState>(defaultBoardState)

  const registerBoard = useCallback((state: GlobalBoardState) => {
    setBoardState((prev) => {
      if (
        prev.isAvailable === state.isAvailable &&
        prev.fen === state.fen &&
        prev.suggestedColor === state.suggestedColor &&
        prev.canFlip === state.canFlip &&
        prev.onFlip === state.onFlip
      ) {
        return prev
      }
      return state
    })
  }, [])

  const clearBoard = useCallback(() => {
    setBoardState((prev) => {
      if (
        prev.isAvailable === defaultBoardState.isAvailable &&
        prev.fen === defaultBoardState.fen &&
        prev.suggestedColor === defaultBoardState.suggestedColor &&
        prev.canFlip === defaultBoardState.canFlip &&
        prev.onFlip === defaultBoardState.onFlip
      ) {
        return prev
      }
      return defaultBoardState
    })
  }, [])

  const value = useMemo(
    () => ({
      boardState,
      registerBoard,
      clearBoard,
    }),
    [boardState, registerBoard, clearBoard]
  )

  return <BoardUiContext.Provider value={value}>{children}</BoardUiContext.Provider>
}

export function useBoardUiContext() {
  const ctx = useContext(BoardUiContext)
  if (!ctx) {
    throw new Error("useBoardUiContext must be used inside BoardUiProvider")
  }
  return ctx
}