import { useCallback, useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { useLocation, useNavigate } from "react-router-dom"
import { AUTO_TRAINING_COMPLETE_EVENT } from "../training/autoTrainingRoute"

export default function AutoTrainingController({ user }: { user: any }) {
 const location = useLocation()
 const navigate = useNavigate()
 const [moving, setMoving] = useState(false)
 const [completionHost, setCompletionHost] = useState<HTMLElement | null>(null)

 const params = useMemo(
  () => new URLSearchParams(location.search),
  [location.search],
 )

 const active =
  Boolean(user) &&
  params.get("auto") === "1" &&
  location.pathname !== "/auto" &&
  location.pathname !== "/onboarding" &&
  location.pathname !== "/auth"

 const continueCourse = useCallback(() => {
  if (moving) return
  setMoving(true)
  navigate("/auto?continue=1", { replace: true })
 }, [moving, navigate])

 useEffect(() => {
  if (!active) return

  function handleComplete() {
   continueCourse()
  }

  window.addEventListener(AUTO_TRAINING_COMPLETE_EVENT, handleComplete)
  return () => {
   window.removeEventListener(AUTO_TRAINING_COMPLETE_EVENT, handleComplete)
  }
 }, [active, continueCourse])

 useEffect(() => {
  if (!active) {
   setCompletionHost(null)
   return
  }

  setCompletionHost(document.getElementById("trainer-completion-actions"))
 }, [active, location.pathname])

 if (!active) return null

 const control = (
  <button
   type="button"
   className="auto-training-controller"
   data-testid="finish-drill-continue"
   onClick={continueCourse}
   disabled={moving}
   title="Finish this drill and open the next item in your personal course"
   style={{
    zIndex: 10020,
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 14,
    background: moving ? "#4b4847" : "#81b64c",
    color: "#fff",
    padding: "12px 16px",
    fontWeight: 900,
    fontSize: 14,
    cursor: moving ? "wait" : "pointer",
    boxShadow: "0 10px 28px rgba(0,0,0,0.34)",
   }}
  >
   {moving ? "Opening next item..." : "Finish drill & continue"}
  </button>
 )

 return completionHost ? createPortal(control, completionHost) : control
}
