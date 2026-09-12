import { useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties, FormEvent } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { autoEntryEnabled } from './training/autoEntryEnabled'
import { supabase } from "./lib/supabase"
import { trackAnalyticsEvent } from "./lib/analytics"
import {
 consumeTrainingReturnTarget,
 resolveTrainingReturnTarget,
} from "./auth/trainingReturnTarget.mjs"
import DataCollectionNotice from "./compliance/DataCollectionNotice"
import "./AuthOnboarding.css"

type AuthMode = "login" | "signup"

type FormState = {
 email: string
 password: string
}

function panelStyle(bg = "#312e2b"): CSSProperties {
 return {
 background: bg,
 borderRadius: "16px",
 padding: "20px",
 boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
 }
}

function inputStyle(): CSSProperties {
 return {
 width: "100%",
 boxSizing: "border-box",
 background: "#262421",
 color: "#ffffff",
 border: "1px solid #4b4847",
 borderRadius: "10px",
 padding: "12px 14px",
 fontSize: "15px",
 outline: "none",
 }
}

function labelStyle(): CSSProperties {
 return {
 display: "block",
 fontSize: "14px",
 fontWeight: 700,
 marginBottom: "8px",
 color: "#e8e6e3",
 }
}

function buttonStyle(background: string): CSSProperties {
 return {
 background,
 color: "#fff",
 border: "none",
 borderRadius: "10px",
 padding: "12px 16px",
 fontWeight: 700,
 fontSize: "15px",
 cursor: "pointer",
 }
}

export default function AuthPage() {
 const location = useLocation()
 const navigate = useNavigate()
 const requestedSignup = new URLSearchParams(location.search).get("mode") === "signup"
 const returnTarget = useMemo(
  () => requestedSignup
   ? null
   : resolveTrainingReturnTarget({ routerState: location.state, search: location.search }),
  [location.search, location.state, requestedSignup],
 )
 const [mode, setMode] = useState<AuthMode>(requestedSignup ? "signup" : "login")

 const [form, setForm] = useState<FormState>({
  email: "",
  password: "",
 })

 const [status, setStatus] = useState("")
 const [loading, setLoading] = useState(false)

 const isSubmittingRef = useRef(false)
 const navigationStartedRef = useRef(false)
 const authPageActiveRef = useRef(false)

 const title = useMemo(
 () => (mode === "signup" ? "Create Free Account" : "Log In"),
 [mode]
 )

 useEffect(() => {
  setMode(requestedSignup ? "signup" : "login")
  if (requestedSignup) consumeTrainingReturnTarget()
 }, [requestedSignup])

 function finishLogin() {
  // Signing in re-keys the account providers and remounts this page. Ignore
  // the old form's late completion; only the currently mounted page navigates.
  if (autoEntryEnabled && !authPageActiveRef.current) return
  if (autoEntryEnabled && navigationStartedRef.current) return
  navigationStartedRef.current = true
  if (returnTarget) consumeTrainingReturnTarget(returnTarget)
  if (autoEntryEnabled) {
   navigate(returnTarget || "/", { replace: true })
   return
  }
  window.location.replace(returnTarget || "/")
 }

 function finishDetectedSession() {
  if (autoEntryEnabled && !authPageActiveRef.current) return
  if (requestedSignup) {
   navigationStartedRef.current = true
   consumeTrainingReturnTarget()
   window.location.assign("/onboarding")
   return
  }
  finishLogin()
 }

 useEffect(() => {
 authPageActiveRef.current = true
 async function checkSession() {
 const { data } = await supabase.auth.getSession()

 if (data.session?.user && !isSubmittingRef.current) {
 finishDetectedSession()
 }
 }

 checkSession()

 const { data: listener } = supabase.auth.onAuthStateChange(
 (_event, session) => {
 if (session?.user && !isSubmittingRef.current) {
 finishDetectedSession()
 }
 }
 )

 return () => {
 authPageActiveRef.current = false
 listener.subscription.unsubscribe()
 }
 }, [requestedSignup, returnTarget])

 function updateField<K extends keyof FormState>(
 key: K,
 value: FormState[K]
 ) {
 setForm((prev) => ({ ...prev, [key]: value }))
 }


 async function onSubmit(e: FormEvent<HTMLFormElement>) {
 e.preventDefault()

 if (!form.email.trim() || !form.password) {
 setStatus("Enter email and password")
 return
 }

 setLoading(true)
 setStatus("")
 isSubmittingRef.current = true

 try {
 if (mode === "signup") {
 const { data, error } = await supabase.auth.signUp({
 email: form.email.trim(),
 password: form.password,
 options: {
 emailRedirectTo: `${window.location.origin}/onboarding`,
 },
 })

 if (error) {
 setStatus(error.message)
 return
 }

 trackAnalyticsEvent("sign_up_completed", {
 confirmation_required: !data.session,
 })

 if (!data.session) {
 trackAnalyticsEvent("email_verification_required")
 }


 if (data.session) {
 setStatus("Signup successful. Opening your personal plan...")
 navigationStartedRef.current = true
 consumeTrainingReturnTarget()
 window.location.assign("/onboarding")
 } else {
 setStatus("Signup successful. Check your email to confirm your account.")
 }
 } else {
 const { error } = await supabase.auth.signInWithPassword({
 email: form.email.trim(),
 password: form.password,
 })

 if (error) {
 setStatus(error.message)
 return
 }

 finishLogin()
 }
 } catch (err) {
 setStatus(err instanceof Error ? err.message : "Something went wrong")
 } finally {
 setLoading(false)
 if (!navigationStartedRef.current) isSubmittingRef.current = false
 }
 }

 return (
 <div
 className="auth-page"
 style={{
 minHeight: "100dvh",
 background: "#262421",
 color: "#fff",
 padding: "24px",
 fontFamily: "Arial",
 }}
 >
 <div
 className="auth-page__shell"
 style={{
 maxWidth: "1100px",
 margin: "0 auto",
 display: "grid",
 gridTemplateColumns: "520px 1fr",
 gap: "16px",
 }}
 >
 <div className="auth-page__panel" style={panelStyle()}>
 <h1 style={{ marginBottom: "16px" }}>{title}</h1>

        {mode === "signup" && (
          <div
            className="auth-page__login-prompt"
            style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px", color: "#cfcfcf", fontSize: "14px" }}
          >
            <span>Already have an account?</span>
            <button
              type="button"
              onClick={() => {
                setMode("login")
                if (autoEntryEnabled) navigate('/auth', { replace: true })
              }}
              style={buttonStyle("#4b4847")}
            >
              Log In
            </button>
          </div>
        )}

 <form onSubmit={onSubmit} aria-describedby="auth-privacy-notice">
 <div style={{ marginBottom: "14px" }}>
 <label htmlFor="auth-email" style={labelStyle()}>Email</label>
 <input
 id="auth-email"
 name="email"
 type="email"
 autoComplete="email"
 required
 style={inputStyle()}
 value={form.email}
 onChange={(e) => updateField("email", e.target.value)}
 />
 </div>

 <div style={{ marginBottom: "14px" }}>
 <label htmlFor="auth-password" style={labelStyle()}>Password</label>
 <input
 id="auth-password"
 name="password"
 type="password"
 autoComplete={mode === "signup" ? "new-password" : "current-password"}
 required
 style={inputStyle()}
 value={form.password}
 onChange={(e) => updateField("password", e.target.value)}
 />
 </div>

 {mode === "signup" && (
 <div>
  <p className="auth-page__signup-note">
  After confirmation, you will connect Chess.com and build your personalized training plan.
  </p>
 </div>
 )}
 <div id="auth-privacy-notice">
  <DataCollectionNotice context={mode === "signup" ? "signup" : "login"} />
 </div>

 <button
 type="submit"
 disabled={loading}
 style={{
 ...buttonStyle("#81b64c"),
 width: "100%",
 opacity: loading ? 0.7 : 1,
 }}
 >
 {loading
 ? "Please wait..."
 : mode === "signup"
 ? "Create Free Account"
 : "Log In"}
 </button>
 </form>

 <div role="status" aria-live="polite" aria-atomic="true" style={{ marginTop: "16px", color: "#cfcfcf" }}>{status}</div>
 </div>

 <div className="auth-page__panel auth-page__info-panel" style={panelStyle("#262421")}>
 <h2>Personalized course</h2>

 <p>Connect your chess usernames to get:</p>

 <ul>
 <li>Skill based starting level</li>
 <li>Weakness training</li>
 <li>Endgame priorities</li>
 <li>Adaptive progression</li>
 </ul>
 </div>
 </div>
 </div>
 )
}
