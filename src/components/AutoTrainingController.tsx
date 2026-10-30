import { useEffect, useRef } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { AUTO_TRAINING_COMPLETE_EVENT } from "../training/autoTrainingRoute"

/** Navigation only. Trainers announce genuine completion after saving evidence. */
export default function AutoTrainingController({ user }: { user: any }) {
 const location = useLocation()
 const navigate = useNavigate()
 const routeEntry = `${user?.id ?? ''}:${location.key}`
 const continuedEntry = useRef<string | null>(null)
 const active = Boolean(user) && new URLSearchParams(location.search).get('auto') === '1' &&
  !['/auto', '/onboarding', '/auth'].includes(location.pathname)

 useEffect(() => { continuedEntry.current = null }, [routeEntry])
 useEffect(() => {
  if (!active) return
  const onComplete = () => {
   if (continuedEntry.current === routeEntry) return
   continuedEntry.current = routeEntry
   navigate("/auto?continue=1", { replace: true })
  }
  window.addEventListener(AUTO_TRAINING_COMPLETE_EVENT, onComplete)
  return () => window.removeEventListener(AUTO_TRAINING_COMPLETE_EVENT, onComplete)
 }, [active, routeEntry, navigate])

 return null
}
