import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useLocation, useNavigate } from "react-router-dom"
import { AUTO_TRAINING_COMPLETE_EVENT } from "../training/autoTrainingRoute"
import { AUTO_ALLOWANCE_STOP } from '../training/autoChunkAllowance'

export default function AutoTrainingController({ user }: { user: any }) {
 const location = useLocation()
 const navigate = useNavigate()
 // This controller survives navigation. A pending Continue belongs only to the
 // history entry that initiated it, never to the next trainer or quota screen.
 const routeEntry = `${user?.id ?? ''}:${location.key}`
 const [movingFrom, setMovingFrom] = useState<string | null>(null)
 const movingFromRef = useRef<string | null>(null)
 const moving = movingFrom === routeEntry
 useEffect(() => {
  movingFromRef.current = null
  setMovingFrom(null)
 }, [routeEntry])
 const [allowanceStoppedRoute, setAllowanceStoppedRoute] = useState('')
 useEffect(() => { setAllowanceStoppedRoute('') }, [location.pathname, location.search])
 useEffect(() => {
  const onStop = (event: Event) => setAllowanceStoppedRoute((event as CustomEvent).detail.route)
  window.addEventListener(AUTO_ALLOWANCE_STOP, onStop)
  return () => window.removeEventListener(AUTO_ALLOWANCE_STOP, onStop)
 }, [])
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
  // Completion events and a click can arrive before React commits an update.
  if (movingFromRef.current === routeEntry) return
  movingFromRef.current = routeEntry
  setMovingFrom(routeEntry)
  navigate("/auto?continue=1", { replace: true })
 }, [routeEntry, navigate])

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

 // Weekly tests have their own game/review controls; retain automatic completion
 // handling above, but do not show the generic manual drill action here.
 if (!active || allowanceStoppedRoute === location.pathname + location.search || (
  (location.pathname === "/play-computer" || location.pathname === "/play-vs-computer") &&
  params.get("weekly") === "1"
 )) return null

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
