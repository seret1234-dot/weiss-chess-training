import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabase"
import { trackAnalyticsEvent } from "../lib/analytics"
import { useBackgroundAnalysis } from "../context/BackgroundAnalysisContext"
import DataCollectionNotice from "../compliance/DataCollectionNotice"
import { validDailyMinutes, validTrainingRating } from "../training/trainingGoals"
import { AUTO_TRAINING_ENTRY_ROUTE } from "../training/resolveAutoStartRoute"
import { INTRODUCTION_METADATA_KEY, INTRODUCTION_ROUTE, readIntroduction, type IntroductionState } from "../onboarding/introduction"
import "../onboarding/onboarding.css"

const dailyChoices = [10, 20, 30, 45, 60]
export default function OnboardingPage() {
 const navigate = useNavigate()
 const { startAnalysis } = useBackgroundAnalysis()
 const [targetRating, setTargetRating] = useState("")
 const [dailyMinutes, setDailyMinutes] = useState("20")
 const [custom, setCustom] = useState(false)
 const [chesscomUsername, setChesscomUsername] = useState("")
 const [lichessUsername, setLichessUsername] = useState("")
 const [loading, setLoading] = useState(true)
 const [saving, setSaving] = useState(false)
 const [error, setError] = useState("")
 const savingRef = useRef(false)

 useEffect(() => {
  let cancelled = false
  async function load() {
   try {
    const { data, error: authError } = await supabase.auth.getUser()
    if (authError) throw authError
    const user = data.user
    if (!user) { navigate("/auth", { replace: true }); return }
    const { data: profile, error: profileError } = await supabase.from("user_auto_profile")
     .select("target_rating, daily_minutes, onboarding_complete").eq("user_id", user.id).maybeSingle()
    if (profileError) throw profileError
    if (cancelled) return
    if (profile?.onboarding_complete) {
     navigate(readIntroduction(user.user_metadata)?.status === "pending" ? INTRODUCTION_ROUTE : AUTO_TRAINING_ENTRY_ROUTE, { replace: true })
     return
    }
    setChesscomUsername(user.user_metadata.chessComUsername ?? user.user_metadata.chess_com_username ?? "")
    setLichessUsername(user.user_metadata.lichessUsername ?? user.user_metadata.lichess_username ?? "")
    setTargetRating(validTrainingRating(profile?.target_rating)?.toString() ?? "")
    const minutes = validDailyMinutes(profile?.daily_minutes) ?? 20
    setDailyMinutes(String(minutes))
    setCustom(!dailyChoices.includes(minutes))
    trackAnalyticsEvent("onboarding_started")
   } catch (err) {
    if (!cancelled) setError(err instanceof Error ? err.message : "Unable to load your profile. Please refresh to retry.")
   } finally { if (!cancelled) setLoading(false) }
  }
  void load()
  return () => { cancelled = true }
 }, [navigate])

 async function handleSave(event: React.FormEvent) {
  event.preventDefault()
  if (savingRef.current) return
  const rating = validTrainingRating(targetRating), minutes = validDailyMinutes(dailyMinutes)
  if (!rating) { setError("Choose a target rating between 100 and 3000."); return }
  if (!minutes) { setError("Choose a daily practice time between 1 and 600 minutes."); return }
  savingRef.current = true
  setSaving(true)
  setError("")
  try {
   const { data, error: authError } = await supabase.auth.getUser()
   if (authError) throw authError
   const user = data.user
   if (!user) { navigate("/auth"); return }
   // Recheck before writing: revisiting onboarding must never reset a completed user's plan.
   const { data: profile, error: readError } = await supabase.from("user_auto_profile")
    .select("onboarding_complete").eq("user_id", user.id).maybeSingle()
   if (readError) throw readError
   if (profile?.onboarding_complete) {
    navigate(readIntroduction(user.user_metadata)?.status === "pending" ? INTRODUCTION_ROUTE : AUTO_TRAINING_ENTRY_ROUTE, { replace: true })
    return
   }
   const chesscom = chesscomUsername.trim(), lichess = lichessUsername.trim()
   const intro: IntroductionState = { version: 1, status: "pending", startedAt: new Date().toISOString(), requiresAnalysis: !!(chesscom || lichess) }
   const { error: metadataError } = await supabase.auth.updateUser({ data: {
    chessComUsername: chesscom || null, chess_com_username: chesscom || null,
    lichessUsername: lichess || null, lichess_username: lichess || null,
    [INTRODUCTION_METADATA_KEY]: intro,
   } })
   if (metadataError) throw metadataError
   const { error: profileError } = await supabase.from("profiles").update({
    target_rating: rating, minutes_per_day: minutes,
    chesscom_username: chesscom || null, lichess_username: lichess || null,
   }).eq("id", user.id)
   if (profileError) throw profileError
   // Keep the existing initial plan defaults, not a new planner.
   const { error: planError } = await supabase.from("user_study_plan").upsert({
    user_id: user.id, max_active_trainers: 3, new_content_pace: "moderate",
    mates_weight: 30, tactics_weight: 35, endgames_weight: 25,
    board_vision_weight: 20, openings_weight: 15, master_games_weight: 10,
   })
   if (planError) throw planError
   // Save completion last. Omitted legacy questionnaire fields are deliberately not overwritten.
   const { error: autoError } = await supabase.from("user_auto_profile").upsert({
    user_id: user.id, target_rating: rating, daily_minutes: minutes,
    chesscom_username: chesscom || null, lichess_username: lichess || null,
    onboarding_step: 2, onboarding_complete: true,
   })
   if (autoError) throw autoError
   if (intro.requiresAnalysis) startAnalysis({ userId: user.id, chesscomUsername: chesscom, lichessUsername: lichess })
   else trackAnalyticsEvent("onboarding_completed")
   navigate(INTRODUCTION_ROUTE, { replace: true })
  } catch (err) {
   setError(err instanceof Error ? err.message : "Unable to save your profile. Please try again.")
  } finally { savingRef.current = false; setSaving(false) }
 }

 if (loading) return <main className="registration-onboarding"><p role="status">Loading your profile…</p></main>
 return <main className="registration-onboarding">
  <form className="registration-onboarding__card" onSubmit={handleSave}>
   <h1>Start your training</h1>
   <fieldset disabled={saving}>
    <legend>Connect your chess accounts</legend>
    <p className="registration-onboarding__help">Both are optional. Connect either, both, or neither.</p>
    <label htmlFor="onboarding-chesscom">Chess.com username</label>
    <input id="onboarding-chesscom" autoComplete="off" value={chesscomUsername} onChange={e => setChesscomUsername(e.target.value)} placeholder="Optional" />
    <label htmlFor="onboarding-lichess">Lichess username</label>
    <input id="onboarding-lichess" autoComplete="off" value={lichessUsername} onChange={e => setLichessUsername(e.target.value)} placeholder="Optional" />
   </fieldset>
   <fieldset disabled={saving}>
    <legend>Your goal</legend>
    <label htmlFor="onboarding-target">What rating would you like to reach?</label>
    <input id="onboarding-target" type="number" min="100" max="3000" required value={targetRating} onChange={e => setTargetRating(e.target.value)} />
   </fieldset>
   <fieldset disabled={saving}>
    <legend>Daily practice</legend>
    <p id="daily-practice-label">How much time can you practice each day?</p>
    <div className="registration-onboarding__times" role="group" aria-labelledby="daily-practice-label">
     {dailyChoices.map(minutes => <button type="button" key={minutes} aria-pressed={!custom && Number(dailyMinutes) === minutes}
      onClick={() => { setCustom(false); setDailyMinutes(String(minutes)) }}>{minutes} minutes</button>)}
     <button type="button" aria-pressed={custom} onClick={() => setCustom(true)}>Custom</button>
    </div>
    {custom && <label className="registration-onboarding__custom">Minutes per day
     <input type="number" min="1" max="600" required value={dailyMinutes} onChange={e => setDailyMinutes(e.target.value)} />
    </label>}
   </fieldset>
   <div className="registration-onboarding__legal"><DataCollectionNotice context="profile" /></div>
   {error && <p role="alert">{error}</p>}
   <button className="registration-onboarding__primary" disabled={saving} type="submit">{saving ? "Saving…" : "Start My Training"}</button>
  </form>
 </main>
}
