import { useEffect, useState } from "react"
import type { CSSProperties } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { runChessComImport } from "../training/chesscomImport"
import { analyzeImportedGamesWithStockfish } from "../training/engineAnalyzeImportedGames"

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

 const [ratingGoal, setRatingGoal] = useState("")
 const [chesscomUsername, setChesscomUsername] = useState("")
 const [saving, setSaving] = useState(false)
 const [error, setError] = useState("")
 const [progressMessage, setProgressMessage] = useState("")

 useEffect(() => {
  let cancelled = false

  async function prefillChessComUsername() {
   const { data } = await supabase.auth.getSession()
   const username = data.session?.user?.user_metadata?.chessComUsername

   if (!cancelled && typeof username === "string") {
    setChesscomUsername(username.trim())
   }
  }

  void prefillChessComUsername()

  return () => {
   cancelled = true
  }
 }, [])

 async function handleSave() {
  setSaving(true)
  setError("")
  setProgressMessage("Saving your goal...")

  try {
   const { data: sessionData } = await supabase.auth.getSession()
   const user = sessionData.session?.user

   if (!user) {
    navigate("/auth")
    return
   }

   const parsedTarget =
    ratingGoal.trim() === "" ? null : Number.parseInt(ratingGoal.trim(), 10)

   if (parsedTarget !== null && Number.isNaN(parsedTarget)) {
    throw new Error("Enter a number, for example 1500")
   }

   const metadata = user.user_metadata as {
    chessComUsername?: string | null
    lichessUsername?: string | null
   }

   const metadataChesscomUsername = metadata.chessComUsername?.trim() || ""
   const resolvedChesscomUsername =
    chesscomUsername.trim() || metadataChesscomUsername
   const lichessUsername = metadata.lichessUsername?.trim() || null

   if (!resolvedChesscomUsername) {
    throw new Error("Enter your Chess.com username to import your games.")
   }

   localStorage.setItem(
    "weissChess:onboardingGoal:v1",
    JSON.stringify({
     ratingGoal: parsedTarget,
     chesscomUsername: resolvedChesscomUsername,
     lichessUsername,
     updatedAt: new Date().toISOString(),
    }),
   )

   const defaultDailyMinutes = 20

   const { error: profileError } = await supabase
    .from("profiles")
    .update({
     target_rating: parsedTarget,
     minutes_per_day: defaultDailyMinutes,
     chesscom_username: resolvedChesscomUsername,
     lichess_username: lichessUsername,
    })
    .eq("id", user.id)

   if (profileError) throw profileError

   const { error: autoProfileError } = await supabase
    .from("user_auto_profile")
    .upsert({
     user_id: user.id,
     target_rating: parsedTarget,
     estimated_rating: null,
     daily_minutes: defaultDailyMinutes,
     chesscom_username: resolvedChesscomUsername,
     lichess_username: lichessUsername,
     rating_source: null,
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

   setProgressMessage("Importing recent Chess.com games...")
   await runChessComImport(resolvedChesscomUsername, user.id)

   setProgressMessage("Starting Stockfish analysis...")
   const analysisResult = await analyzeImportedGamesWithStockfish(user.id, {
    maxGames: 150,
    depth: 8,
    minLossCp: 70,
    onProgress: (progress) => {
     setProgressMessage(progress.message)
    },
   })

   setProgressMessage(
    `Analyzed ${analysisResult.gamesAnalyzed} games and found ${analysisResult.mistakesFound} training mistakes.`,
   )

   const { error: completionError } = await supabase
    .from("user_auto_profile")
    .update({
     onboarding_step: 2,
     onboarding_complete: true,
    })
    .eq("user_id", user.id)

   if (completionError) throw completionError

   window.location.replace("/auto")
  } catch (err) {
   console.error("Onboarding save failed", err)
   setError(err instanceof Error ? err.message : JSON.stringify(err, null, 2))
  } finally {
   setSaving(false)
  }
 }

 return (
  <div
   style={{
    minHeight: "100vh",
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
    style={{
     width: "100%",
     maxWidth: 760,
    }}
   >
    <div style={sectionCardStyle()}>
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

     <h1 style={{ margin: "0 0 10px", fontSize: 38 }}>What is your rating goal?</h1>

     <p style={{ color: "#cfcfcf", lineHeight: 1.5, fontSize: 16, maxWidth: 620 }}>
      That is the only question. Your current rating, openings, weaknesses, time controls,
      and training priorities will come from your connected games.
     </p>

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
     />
     <p style={{ color: "#bdbdbd", fontSize: 13, lineHeight: 1.45 }}>
      We use this to import your recent games and personalize your course.
     </p>

     <input
      style={inputStyle()}
      value={ratingGoal}
      onChange={(e) => setRatingGoal(e.target.value)}
      placeholder="Example: 1500"
      inputMode="numeric"
     />

     <p style={{ color: "#bdbdbd", fontSize: 13, lineHeight: 1.45 }}>
      Leave empty if you do not have an exact number yet.
     </p>

           {error && <div style={{ marginTop: 16, color: "#ffb3b3" }}>{error}</div>}
      {saving && progressMessage && (
       <div style={{ marginTop: 16, color: "#d8f4ce", lineHeight: 1.45 }}>
        {progressMessage}
       </div>
      )}

     <button
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
      {saving ? progressMessage || "Building your course..." : "Build my course"}
     </button>

     <div
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
