import React, { useCallback } from "react"
import { useLocation } from "react-router-dom"
import { useBoardUiContext } from "../context/BoardUiContext"
import { supabase } from "../lib/supabase"

function sideToMoveFromFen(fen?: string | null): "white" | "black" | undefined {
 if (!fen) return undefined
 return fen.split(" ")[1] === "b" ? "black" : "white"
}

function buildPlayUrl(params: {
 fen?: string | null
 suggestedColor?: "white" | "black"
 source?: string
}) {
 const search = new URLSearchParams()

 if (params.fen) search.set("fen", params.fen)
 if (params.suggestedColor) search.set("color", params.suggestedColor)
 search.set("mode", "play")
 if (params.source) search.set("source", params.source)

 const qs = search.toString()
 return qs ? `/play-vs-computer?${qs}` : "/play-vs-computer"
}

function buildAnalyzeUrl(fen?: string | null) {
 if (!fen) return "/analyze"
 return `/analyze/board?fen=${encodeURIComponent(fen)}`
}

export default function GlobalFloatingPlay() {
 const location = useLocation()
 const { boardState } = useBoardUiContext()

 const fenFromUrl = new URLSearchParams(location.search).get("fen")
 const currentFen = boardState.isAvailable && boardState.fen ? boardState.fen : fenFromUrl
 const hasBoard = !!currentFen

 const suggestedColor =
 boardState.isAvailable && boardState.suggestedColor
 ? boardState.suggestedColor
 : sideToMoveFromFen(currentFen)

 const goHome = useCallback(() => {
 window.location.href = "/"
 }, [])

 const goFunChess = useCallback(() => {
 window.location.href = "/museum"
 }, [])

 const goAnalyze = useCallback(() => {
 window.location.href = buildAnalyzeUrl(currentFen)
 }, [currentFen])

 const goPlayComputer = useCallback(() => {
 const url = buildPlayUrl({
 fen: currentFen,
 suggestedColor,
 source: hasBoard ? "current-board" : "global",
 })

 window.location.href = url
 }, [currentFen, suggestedColor, hasBoard])

 const goAccount = useCallback(() => {
 window.location.href = "/account"
 }, [])

 const flipBoard = useCallback(() => {
 boardState.onFlip?.()
 }, [boardState.onFlip])

 const handleLogout = useCallback(async () => {
 try {
 const { error } = await supabase.auth.signOut({ scope: "local" })
 if (error) {
 console.error("Logout failed", error)
 return
 }
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
 Home
 </button>

 <button type="button" onClick={goFunChess} style={btnStyle}>
 Fun Chess
 </button>

 <button type="button" onClick={goAnalyze} style={btnStyle}>
 {hasBoard ? "Analyze Position" : "Analyze"}
 </button>

 <button
 type="button"
 onClick={goPlayComputer}
 style={{
 ...btnStyle,
 background: "linear-gradient(180deg,#78b84c,#5f9c3d)",
 }}
 >
 {hasBoard ? "Play Position" : "Play Computer"}
 </button>

 {boardState.isAvailable && (
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
 Flip
 </button>
 )}

 <button type="button" onClick={goAccount} style={btnStyle}>
 Account
 </button>

 <button
 type="button"
 onClick={handleLogout}
 style={{
 ...btnStyle,
 background: "#6b3d3d",
 }}
 >
 Logout
 </button>
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
