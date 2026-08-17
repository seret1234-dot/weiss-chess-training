import { useNavigate } from "react-router-dom"
import { useBackgroundAnalysis } from "../context/BackgroundAnalysisContext"
import "./BackgroundAnalysisStatus.css"

export default function BackgroundAnalysisStatus() {
 const { job, retryAnalysis, acknowledgePlanReady } = useBackgroundAnalysis()
 const navigate = useNavigate()
 if (job.status === "idle") return null
 if (job.status === "completed" && job.planReadyAcknowledged) return null

 const openPlan = () => { acknowledgePlanReady(); navigate("/auto") }
 const message = job.status === "importing" ? "Importing your games?"
  : job.status === "analyzing" ? `Analyzing your games ? ${job.gamesCompleted} / ${job.gamesTotal || "?"}`
  : job.status === "building-plan" ? "Building your personalized plan?"
  : job.status === "completed" ? "Your personalized training plan is ready."
  : "We couldn't finish analyzing your games."

 return (
  <div className="background-analysis-status" role="status" style={{ maxWidth: 360, padding: "12px 14px", borderRadius: 14, background: "#26331f", border: "1px solid rgba(129,182,76,0.65)", color: "#eff8e8", boxShadow: "0 12px 30px rgba(0,0,0,0.32)", fontSize: 14, fontWeight: 700 }}>
   <div>{message}</div>
   {job.status === "completed" && !job.planReadyAcknowledged && <button type="button" onClick={openPlan} style={buttonStyle}>View My Training Plan</button>}
   {job.status === "failed" && <button type="button" onClick={retryAnalysis} style={buttonStyle}>Retry analysis</button>}
  </div>
 )
}

const buttonStyle = { marginTop: 9, border: "none", borderRadius: 9, padding: "8px 10px", background: "#81b64c", color: "#fff", fontWeight: 800, cursor: "pointer" } as const
