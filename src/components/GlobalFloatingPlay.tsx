import React, { useCallback } from "react"
import { useLocation } from "react-router-dom"
import { useBoardUiContext } from "../context/BoardUiContext"
import { supabase } from "../lib/supabase"

function buildPlayUrl(params: {
  fen?: string | null
  suggestedColor?: "white" | "black"
  mode?: "play" | "analyze"
  source?: string
}) {
  const search = new URLSearchParams()

  if (params.fen) search.set("fen", params.fen)
  if (params.suggestedColor) search.set("color", params.suggestedColor)
  if (params.mode) search.set("mode", params.mode)
  if (params.source) search.set("source", params.source)

  const qs = search.toString()
  return qs ? `/play-vs-computer?${qs}` : "/play-vs-computer"
}

export default function GlobalFloatingPlay() {
  const location = useLocation()
  const { boardState } = useBoardUiContext()

  const hasBoard = boardState.isAvailable && !!boardState.fen

  const goHome = useCallback(() => {
    window.location.href = "/"
  }, [])

  const goAccount = useCallback(() => {
    window.location.href = "/account"
  }, [])

  const goPlay = useCallback(() => {
    const url = buildPlayUrl({
      fen: hasBoard ? boardState.fen : undefined,
      suggestedColor: boardState.suggestedColor,
      mode: "play",
      source: "global",
    })

    window.location.href = url
  }, [hasBoard, boardState.fen, boardState.suggestedColor])

  const goAnalyze = useCallback(() => {
    const url = buildPlayUrl({
      fen: hasBoard ? boardState.fen : undefined,
      suggestedColor: boardState.suggestedColor,
      mode: "analyze",
      source: "global-analyze",
    })

    window.location.href = url
  }, [hasBoard, boardState.fen, boardState.suggestedColor])

  const flipBoard = useCallback(() => {
    boardState.onFlip?.()
  }, [boardState.onFlip])

  // ✅ FIXED logout (real fix)
  const handleLogout = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" })

      if (error) {
        console.error("Logout failed", error)
        return
      }

      // important: go to auth, not home (home may auto-detect session)
      window.location.replace("/auth")
    } catch (err) {
      console.error("Logout failed", err)
    }
  }, [])

  return (
    <div
      style={{
        position: "fixed",
        right: 20,
        bottom: 20,
        zIndex: 99999,
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      <button type="button" onClick={goHome} style={btnStyle}>
        🏠 Home
      </button>

      <button type="button" onClick={goAccount} style={btnStyle}>
        👤 Account
      </button>

      {/* ✅ Logout */}
      <button
        type="button"
        onClick={handleLogout}
        style={{
          ...btnStyle,
          background: "#6b3d3d",
        }}
      >
        ⎋ Logout
      </button>

      {hasBoard && (
        <>
          <button
            type="button"
            onClick={goPlay}
            style={{
              ...btnStyle,
              background: "linear-gradient(180deg,#78b84c,#5f9c3d)",
            }}
          >
            🤖 Play This Position
          </button>

          <button
            type="button"
            onClick={goAnalyze}
            style={{
              ...btnStyle,
              background: "linear-gradient(180deg,#4f8dd6,#356fb3)",
            }}
          >
            📊 Analyze This Position
          </button>

          <button
            type="button"
            onClick={flipBoard}
            disabled={!boardState.canFlip}
            style={{
              ...btnStyle,
              opacity: boardState.canFlip ? 1 : 0.45,
              cursor: boardState.canFlip ? "pointer" : "not-allowed",
            }}
          >
            🔄 Flip
          </button>
        </>
      )}
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  border: "none",
  borderRadius: 14,
  padding: "12px 16px",
  color: "white",
  fontWeight: 800,
  cursor: "pointer",
  background: "#3a3936",
  boxShadow: "0 10px 25px rgba(0,0,0,0.4)",
}