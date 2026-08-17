import { useEffect, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { trackAnalyticsEvent } from "../lib/analytics"
import { useBackgroundAnalysis } from "../context/BackgroundAnalysisContext"
import TrainingGoalsFields from "../components/TrainingGoalsFields"
import {
 readTrainingGoals,
 serializeLegacyProfileTrainingGoals,
 serializeTrainingGoals,
 validateTrainingGoals,
 type TrainingGoals,
} from "../training/trainingGoals"
import "../AuthOnboarding.css"

function sectionCardStyle(): CSSProperties {
 return {
  background: "#1f1d1c",
  borderRadius: 24,
  padding: 30,
  border: "1px solid rgba(255,255,255,0.06)",
  boxShadow: "0 14px 34px rgba(0,0,0,0.2)",
 }
}

function inputStyle(): CSSProperties {
 return {
  width: "100%",
  boxSizing: "border-box",
  background: "#262421",
  color: "#ffffff",
  border: "1px solid #4b4847",
  borderRadius: "14px",
  padding: "16px 18px",
  fontSize: "18px",
  outline: "none",
 }
}

export default function OnboardingPage() {
 const navigate = useNavigate()

 const { startAnalysis } = useBackgroundAnalysis()

 const [goals, setGoals] = useState<TrainingGoals>({
  manualCurrentRating: null,
  targetRating: null,
  dailyMinutes: 20,
  timeframeMonths: null,
  currentMilestoneRating: null,
 })
 const [chesscomUsername, setChesscomUsername] = useState("")
 const [lichessUsername, setLichessUsername] = useState("")
 const [saving, setSaving] = useState(false)
 const [error, setError] = useState("")
 const [warning, setWarning] = useState("")
 const [progressMessage, setProgressMessage] = useState("")
 const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1)
 const [completed, setCompleted] = useState(false)
 const onboardingStartedTracked = useRef(false)

 useEffect(() => {
  let cancelled = false

  async function prefillUsernames() {
   const { data } = await supabase.auth.getSession()
   const user = data.session?.user
   const chesscom = user?.user_metadata?.chessComUsername || user?.user_metadata?.chess_com_username
   const lichess = user?.user_metadata?.lichessUsername || user?.user_metadata?.lichess_username

   if (
    !cancelled &&
    user?.email_confirmed_at &&
    !onboardingStartedTracked.current
   ) {
    onboardingStartedTracked.current = true
    trackAnalyticsEvent("onboarding_started")
   }

   if (!cancelled && typeof chesscom === "string") setChesscomUsername(chesscom.trim())
   if (!cancelled && typeof lichess === "string") setLichessUsername(lichess.trim())
   if (user) {
    const { data: autoProfile } = await supabase
     .from("user_auto_profile")
     .select("target_rating, daily_minutes, manual_current_rating, goal_timeframe_months, current_milestone_rating")
     .eq("user_id", user.id)
     .maybeSingle()
    if (!cancelled && autoProfile) setGoals(readTrainingGoals(autoProfile))
   }
  }

  void prefillUsernames()

  return () => {
   cancelled = true
  }
 }, [])

 async function handleSave() {
 setSaving(true)
 setCompleted(false)
 setCurrentStep(1)
 setError("")
 setWarning("")
 setProgressMessage("Step 1 of 3: Connecting your chess accounts...")

  try {
   const { data: sessionData } = await supabase.auth.getSession()
   const user = sessionData.session?.user

   if (!user) {
    navigate("/auth")
    return
   }

   const validationError = validateTrainingGoals(goals, true)
   if (validationError) throw new Error(validationError)

   const metadata = user.user_metadata as {
    chessComUsername?: string | null
    lichessUsername?: string | null
   }

   const metadataChesscomUsername = metadata.chessComUsername?.trim() || ""
   const metadataLichessUsername = metadata.lichessUsername?.trim() || ""
   const resolvedChesscomUsername =
    chesscomUsername.trim() || metadataChesscomUsername
   const resolvedLichessUsername = lichessUsername.trim() || metadataLichessUsername

   if (!resolvedChesscomUsername && !resolvedLichessUsername) {
    throw new Error("Enter a Chess.com or Lichess username to import your games.")
   }

   const { error: metadataError } = await supabase.auth.updateUser({
    data: {
     chessComUsername: resolvedChesscomUsername || null,
     chess_com_username: resolvedChesscomUsername || null,
     lichessUsername: resolvedLichessUsername || null,
     lichess_username: resolvedLichessUsername || null,
    },
   })
   if (metadataError) throw metadataError

   localStorage.setItem(
    "weissChess:onboardingGoal:v1",
    JSON.stringify({
     ...serializeTrainingGoals(goals),
     chesscomUsername: resolvedChesscomUsername,
     lichessUsername: resolvedLichessUsername || null,
     updatedAt: new Date().toISOString(),
    }),
   )

   const { error: profileError } = await supabase
    .from("profiles")
    .update({
     ...serializeLegacyProfileTrainingGoals(goals),
     chesscom_username: resolvedChesscomUsername || null,
     lichess_username: resolvedLichessUsername || null,
    })
    .eq("id", user.id)

   if (profileError) throw profileError

   const { error: autoProfileError } = await supabase
    .from("user_auto_profile")
    .upsert({
     user_id: user.id,
     ...serializeTrainingGoals(goals),
     chesscom_username: resolvedChesscomUsername || null,
     lichess_username: resolvedLichessUsername || null,
     onboarding_step: 1,
     onboarding_complete: false,
    })

   if (autoProfileError) throw autoProfileError

   const { error: planError } = await supabase
    .from("user_study_plan")
    .upsert({
     user_id: user.id,
     max_active_trainers: 3,
     new_content_pace: "moderate",
     mates_weight: 30,
     tactics_weight: 35,
     endgames_weight: 25,
     board_vision_weight: 20,
     openings_weight: 15,
     master_games_weight: 10,
    })

   if (planError) throw planError

   startAnalysis({ userId: user.id, chesscomUsername: resolvedChesscomUsername, lichessUsername: resolvedLichessUsername })
   setCurrentStep(2)
   setProgressMessage("Analysis started. We'll build your training plan in the background.")
   navigate("/", { replace: true })
  } catch (err) {
   console.error("Onboarding save failed", err)
   setError(err instanceof Error ? err.message : JSON.stringify(err, null, 2))
  } finally {
   setSaving(false)
  }
 }

 return (
  <div
   className="onboarding-page"
   style={{
    minHeight: "100dvh",
    background: "linear-gradient(180deg, #2b2623 0%, #231f1d 100%)",
    color: "#f3f3f3",
    fontFamily: "Arial, sans-serif",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
   }}
  >
   <div
    className="onboarding-page__shell"
    style={{
     width: "100%",
     maxWidth: 1150,
    }}
   >
    <div className="onboarding-page__card" style={sectionCardStyle()}>
     <div
      style={{
       display: "inline-flex",
       borderRadius: 999,
       background: "rgba(129,182,76,0.18)",
       padding: "6px 10px",
       color: "#d8f4ce",
       fontWeight: 800,
       fontSize: 13,
       marginBottom: 16,
      }}
     >
      Personalized chess course
     </div>

     <div className="onboarding-page__steps" aria-label="Onboarding progress">
      {[
       "Step 1 of 3: Connect your chess accounts",
       "Step 2 of 3: Analyze games",
       "Step 3 of 3: Build your training plan",
      ].map((label, index) => (
       <div
        key={label}
        className={`onboarding-page__step ${index + 1 <= currentStep ? "is-active" : ""}`}
       >
        {label}
       </div>
      ))}
     </div>

     <h1 className="onboarding-page__title" style={{ margin: "0 0 10px", fontSize: 38 }}>Connect your chess accounts</h1>

     <p className="onboarding-page__intro" style={{ color: "#cfcfcf", lineHeight: 1.5, fontSize: 16, maxWidth: 620 }}>
      The system will automatically import your recent Chess.com and Lichess games, analyze your mistakes, and create a personalized training plan.
     </p>

     <div className="onboarding-page__form-grid">
      <div className="onboarding-page__accounts">
     <label
      htmlFor="onboarding-chesscom-username"
      style={{ display: "block", marginBottom: 8, fontSize: 14, fontWeight: 800 }}
     >
      Chess.com username
     </label>
     <input
      id="onboarding-chesscom-username"
      style={inputStyle()}
      value={chesscomUsername}
      onChange={(event) => setChesscomUsername(event.target.value)}
      placeholder="Your Chess.com username"
      autoComplete="username"
     disabled={saving}
     />
     <p style={{ color: "#bdbdbd", fontSize: 13, lineHeight: 1.45 }}>
      Enter your Chess.com username — not your email.
     </p>

     <label
      htmlFor="onboarding-lichess-username"
      style={{ display: "block", margin: "16px 0 8px", fontSize: 14, fontWeight: 800 }}
     >
      Lichess username
     </label>
     <input
      id="onboarding-lichess-username"
      style={inputStyle()}
      value={lichessUsername}
      onChange={(event) => setLichessUsername(event.target.value)}
      placeholder="Your Lichess username"
      autoComplete="username"
     disabled={saving}
     />
     <p style={{ color: "#bdbdbd", fontSize: 13, lineHeight: 1.45 }}>
      Enter your Lichess username — not your email.
     </p>

      </div>

      <div className="onboarding-page__goals" style={{ marginTop: 20 }}>
       <TrainingGoalsFields
        goals={goals}
        onChange={setGoals}
        inputStyle={inputStyle()}
        labelStyle={{ display: "block", fontSize: 14, fontWeight: 800 }}
        helperStyle={{ color: "#bdbdbd", fontSize: 13, lineHeight: 1.45 }}
        compact
        disabled={saving}
       />
      </div>
     </div>

     {error && <div style={{ marginTop: 16, color: "#ffb3b3" }}>{error}</div>}
     {warning && <div style={{ marginTop: 16, color: "#f0dca0", lineHeight: 1.45 }}>{warning}</div>}
      {(saving || completed) && progressMessage && (
       <div className="onboarding-page__progress" role="status" style={{ marginTop: 16, color: "#d8f4ce", lineHeight: 1.45 }}>
       {progressMessage}
       </div>
      )}

     <button
      className="onboarding-page__action"
      type="button"
      onClick={handleSave}
      disabled={saving}
      style={{
       marginTop: 18,
       width: "100%",
       border: "none",
       borderRadius: 14,
       background: "#81b64c",
       color: "#fff",
       padding: "15px 18px",
       fontWeight: 900,
       fontSize: 16,
       cursor: "pointer",
       opacity: saving ? 0.7 : 1,
      }}
     >
      {saving ? progressMessage || "Building your training plan..." : "Analyze My Games & Build My Training Plan"}
     </button>

     <div
      className="onboarding-page__next-steps"
      style={{
       marginTop: 24,
       borderRadius: 16,
       background: "rgba(0,0,0,0.22)",
       border: "1px solid rgba(255,255,255,0.08)",
       padding: 16,
      }}
     >
      <h2 style={{ marginTop: 0 }}>What happens next</h2>
      <p style={{ color: "#cfcfcf", lineHeight: 1.45, marginBottom: 0 }}>
       The site imports your recent games, detects repeated mistakes, diagnoses your openings,
       and builds a training plan connected to the existing trainers.
      </p>
     </div>
    </div>
   </div>
  </div>
 )
}
