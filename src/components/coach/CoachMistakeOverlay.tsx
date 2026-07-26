import React, { useEffect, useState } from "react"
import {
 type CoachMistakeNotice,
 subscribeCoachMistakes,
} from "../../services/coach/coachPopup"

export default function CoachMistakeOverlay() {
 const [notice, setNotice] = useState<CoachMistakeNotice | null>(null)
 const [isOpen, setIsOpen] = useState(false)

 useEffect(() => {
 return subscribeCoachMistakes((nextNotice) => {
 if (!nextNotice) {
 setIsOpen(false)
 setNotice(null)
 return
 }

 setNotice(nextNotice)
 setIsOpen(true)
 })
 }, [])

 useEffect(() => {
 const close = () => {
 setIsOpen(false)
 setNotice(null)
 }

 const oldPushState = window.history.pushState
 const oldReplaceState = window.history.replaceState

 window.history.pushState = function (...args) {
 const result = oldPushState.apply(this, args)
 close()
 return result
 }

 window.history.replaceState = function (...args) {
 const result = oldReplaceState.apply(this, args)
 close()
 return result
 }

 const onPopState = () => close()

 const onClick = (event: MouseEvent) => {
 const el = event.target as HTMLElement | null
 const button = el?.closest("button")
 const text = button?.textContent?.trim().toLowerCase() || ""

 if (
 text.includes("next puzzle") ||
 text === "next" ||
 text === "prev" ||
 text.includes("restart") ||
 text.includes("shuffle") ||
 text.includes("go") ||
 text.includes("jump")
 ) {
 close()
 }
 }

 window.addEventListener("popstate", onPopState)
 document.addEventListener("click", onClick, true)

 return () => {
 window.history.pushState = oldPushState
 window.history.replaceState = oldReplaceState
 window.removeEventListener("popstate", onPopState)
 document.removeEventListener("click", onClick, true)
 }
 }, [])

 if (!notice || !isOpen) return null

 const { explanation } = notice

  const quotaMessage = (() => {
    if (notice.code === "AUTH_REQUIRED") {
      return "Log in to use AI Coach. The verified rule-based explanation is shown below."
    }

    if (notice.code === "COACH_QUOTA_EXCEEDED") {
      if (notice.quota?.tier === "premium") {
        const resetText = notice.quota.resetAt
          ? new Date(notice.quota.resetAt).toLocaleDateString()
          : "the start of next month"

        return `You have used all ${notice.quota.limit || 30} AI Coach explanations for this month. The limit resets ${resetText}.`
      }

      return "Your free AI Coach explanation has already been used. Premium includes 30 AI Coach explanations each month."
    }

    if (
      notice.source === "ai" &&
      notice.quota &&
      !notice.cached
    ) {
      return `AI Coach: ${notice.quota.remaining} of ${notice.quota.limit} explanations remaining.`
    }

    if (
      notice.source === "deterministic" &&
      notice.code &&
      notice.code !== "COACH_AI_FALLBACK"
    ) {
      return "AI wording was unavailable. The verified rule-based explanation is shown below."
    }

    return ""
  })()

 return (
 <div
 style={{
 position: "fixed",
 left: 18,
 bottom: 18,
 width: "min(350px, calc(100vw - 36px))",
 maxHeight: "58vh",
 zIndex: 99999,
 background: "#171512",
 color: "#f5f5f5",
 border: "1px solid rgba(255,255,255,0.16)",
 borderRadius: 16,
 boxShadow: "0 18px 50px rgba(0,0,0,0.55)",
 overflow: "hidden",
 fontFamily: "Arial, sans-serif",
 }}
 >
 <div
 style={{
 padding: "14px 16px",
 background: "#211e1b",
 borderBottom: "1px solid rgba(255,255,255,0.1)",
 display: "flex",
 alignItems: "center",
 justifyContent: "space-between",
 gap: 12,
 }}
 >
 <div>
 <div style={{ fontSize: 16, color: "#a7f3d0", fontWeight: 800 }}>
 Coach note
 {notice.status === "loading"
 ? " - polishing"
 : notice.source === "ai"
 ? " - verified wording"
 : ""}
 </div>
 <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1.15 }}>
 {explanation.title}
 </div>
 </div>

 <button
 onClick={() => setIsOpen(false)}
 style={{
 border: "1px solid rgba(255,255,255,0.18)",
 background: "#2a2621",
 color: "#fff",
 borderRadius: 999,
 width: 34,
 height: 34,
 cursor: "pointer",
 fontSize: 22,
 fontWeight: 900,
 flex: "0 0 auto",
 }}
 aria-label="Close coach note"
 >
 x
 </button>
 </div>

 <div
 style={{
 padding: 16,
 fontSize: 17,
 lineHeight: 1.45,
 maxHeight: "calc(58vh - 78px)",
 overflowY: "auto",
 }}
 >
 {quotaMessage ? (
  <div
    style={{
      marginBottom: 14,
      padding: "10px 12px",
      borderRadius: 10,
      background:
        notice.code === "COACH_QUOTA_EXCEEDED" ||
        notice.code === "AUTH_REQUIRED"
          ? "rgba(242,193,78,0.13)"
          : "rgba(167,243,208,0.09)",
      border:
        notice.code === "COACH_QUOTA_EXCEEDED" ||
        notice.code === "AUTH_REQUIRED"
          ? "1px solid rgba(242,193,78,0.35)"
          : "1px solid rgba(167,243,208,0.22)",
      color:
        notice.code === "COACH_QUOTA_EXCEEDED" ||
        notice.code === "AUTH_REQUIRED"
          ? "#f2c14e"
          : "#a7f3d0",
      fontSize: 14,
      lineHeight: 1.4,
      fontWeight: 700,
    }}
  >
    {quotaMessage}
  </div>
) : null}

<div style={{ marginBottom: 14 }}>
  {explanation.explanation}
</div>

 <div
 style={{
 marginBottom: 14,
 padding: 12,
 borderRadius: 12,
 background: "#0f0e0c",
 border: "1px solid rgba(255,255,255,0.08)",
 }}
 >
 <b>Why:</b> {explanation.whyBestMoveWorks}
 </div>

 <div style={{ color: "#ddd" }}>
 <b>Lesson:</b> {explanation.lesson}
 </div>

 {explanation.recommendedTrainer ? (
 <div style={{ marginTop: 14, color: "#a7f3d0", fontWeight: 800 }}>
 Train: {explanation.recommendedTrainer}
 </div>
 ) : null}
 </div>
 </div>
 )
}
