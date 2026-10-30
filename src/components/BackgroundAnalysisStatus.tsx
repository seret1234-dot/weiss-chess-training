import { useEffect, useRef } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { useBackgroundAnalysis } from "../context/BackgroundAnalysisContext"
import { AUTO_TRAINING_ENTRY_ROUTE } from "../training/resolveAutoStartRoute"
import "./BackgroundAnalysisStatus.css"

export default function BackgroundAnalysisStatus() {
 const { job, retryAnalysis, acknowledgePlanReady } = useBackgroundAnalysis()
 const navigate = useNavigate()
 const location = useLocation()
 const handledCompletion = useRef<string | null>(null)

 useEffect(() => {
  // First-registration introduction owns its handoff, even if analysis finishes
  // while the user is watching. Later analysis jobs keep their existing behavior.
  if (location.pathname === "/onboarding/introduction") return
  if (job.status !== "completed" || job.planReadyAcknowledged || handledCompletion.current === job.jobId) return
  handledCompletion.current = job.jobId
  // The provider only completes after persisting onboarding/analysis. Consume
  // this handoff once so refresh and deliberate Home/Manual visits stay put.
  acknowledgePlanReady()
  const params = new URLSearchParams(location.search)
  const weeklyOpen = location.pathname === "/play-computer" && params.get("weekly") === "1"
  const autoActivityOpen = params.get("auto") === "1" && location.pathname !== "/auto"
  if (!weeklyOpen && !autoActivityOpen) navigate(AUTO_TRAINING_ENTRY_ROUTE, { replace: true })
 }, [job.status, job.jobId, job.planReadyAcknowledged, acknowledgePlanReady, location.pathname, location.search, navigate])

 if (location.pathname === "/onboarding/introduction" || job.status === "idle" || job.status === "completed") return null

 const message = job.status === "importing" ? "Importing your games…"
  : job.status === "analyzing" ? `Analyzing your games · ${job.gamesCompleted} / ${job.gamesTotal || "…"}`
  : job.status === "building-plan" ? "Building your personalized plan…"
  : "We couldn't finish analyzing your games."

 return (
  <div className="background-analysis-status" role="status" style={{ maxWidth: 360, padding: "12px 14px", borderRadius: 14, background: "#26331f", border: "1px solid rgba(129,182,76,0.65)", color: "#eff8e8", boxShadow: "0 12px 30px rgba(0,0,0,0.32)", fontSize: 14, fontWeight: 700 }}>
   <div>{message}</div>
   {job.status === "failed" && <button type="button" onClick={retryAnalysis} style={buttonStyle}>Retry analysis</button>}
  </div>
 )
}

const buttonStyle = { marginTop: 9, border: "none", borderRadius: 9, padding: "8px 10px", background: "var(--action-secondary-bg)", color: "var(--action-secondary-text)", fontWeight: 800, cursor: "pointer" } as const
