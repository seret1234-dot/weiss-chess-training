import { useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { getOrCreateAutoProfile } from "../training/getOrCreateAutoProfile"
import {
 buildPersonalTrainingPlan,
 getRecommendedSection,
} from "../training/buildPersonalTrainingPlan"
import type { PersonalTrainingPlan, TrainingSection } from "../training/buildPersonalTrainingPlan"
import { getDueSummary, getNextDueItem } from "../training/getNextDueItem"
import { addAutoTrainingParams, buildAutoTrainingRoute } from "../training/autoTrainingRoute"
import {
 getWeeklyTestStatus,
 type WeeklyTestPlanStatus,
} from "../training/weeklyAdaptiveTest"
import { recordRecentAutoTrainer } from "../training/targetedSparring"
import {
 prepareNextEndgameTransfer,
 recordRecentEndgameTrainer,
} from "../training/endgameTransfer"
import { runChessComImport } from "../training/chesscomImport"
import { analyzeImportedGamesWithStockfish } from "../training/engineAnalyzeImportedGames"

type LoadState =
 | { status: "loading"; message: string }
 | { status: "error"; message: string }
 | { status: "ready"; autoProfile: any; plan: PersonalTrainingPlan }

function pageStyle(): CSSProperties {
 return {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #2b2623 0%, #231f1d 100%)",
  color: "#f3f3f3",
  fontFamily: "Arial, sans-serif",
  padding: 24,
 }
}

function cardStyle(): CSSProperties {
 return {
  background: "#1f1d1c",
  borderRadius: 22,
  padding: 22,
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 14px 34px rgba(0,0,0,0.22)",
 }
}

function sectionCardStyle(): CSSProperties {
 return {
  background: "rgba(255,255,255,0.055)",
  borderRadius: 18,
  padding: 16,
  border: "1px solid rgba(255,255,255,0.08)",
 }
}

function ratingBandLabel(plan: PersonalTrainingPlan) {
 if (plan.ratingBand === "under1000") return "Under 1000"
 if (plan.ratingBand === "1000to1600") return "1000ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ1600"
 return "1600+"
}

export default function AutoStudyPage({ user }: { user: any }) {
 const navigate = useNavigate()
 const location = useLocation()
 const continueRunRef = useRef("")
 const [startingTraining, setStartingTraining] = useState(false)
 const [refreshingGames, setRefreshingGames] = useState(false)
 const [engineBusy, setEngineBusy] = useState(false)
 const [engineProgress, setEngineProgress] = useState("")
 const [weeklyStatus, setWeeklyStatus] = useState<WeeklyTestPlanStatus | null>(null)

 const [state, setState] = useState<LoadState>({
  status: "loading",
  message: "Loading your personal course...",
 })

 useEffect(() => {
  let cancelled = false

  async function run() {
   try {
    if (!user) {
     if (!cancelled) {
      setState({ status: "loading", message: "Waiting for account..." })
     }
     return
    }

    const autoProfile = await getOrCreateAutoProfile(user.id)

    if (!autoProfile) {
     if (!cancelled) setState({ status: "error", message: "Auto profile error" })
     return
    }

    if (!autoProfile.onboarding_complete) {
     navigate("/onboarding", { replace: true })
     return
    }

    const plan = buildPersonalTrainingPlan(autoProfile)
    const nextWeeklyStatus = await getWeeklyTestStatus(user.id)

    if (!cancelled) {
     setState({ status: "ready", autoProfile, plan })
     setWeeklyStatus(nextWeeklyStatus)
    }
   } catch (error) {
    console.error("AUTO PAGE error:", error)
    if (!cancelled) setState({ status: "error", message: "Something went wrong" })
   }
  }

  run()

  return () => {
   cancelled = true
  }
 }, [navigate, user])

 useEffect(() => {
  if (!user) return

  let cancelled = false

  async function refreshWeeklyStatus() {
   const next = await getWeeklyTestStatus(user.id)
   if (!cancelled) setWeeklyStatus(next)
  }

  function handleFocus() {
   void refreshWeeklyStatus()
  }

  window.addEventListener("focus", handleFocus)

  return () => {
   cancelled = true
   window.removeEventListener("focus", handleFocus)
  }
 }, [user])

 const recommended = useMemo(() => {
  if (state.status !== "ready") return null
  return getRecommendedSection(state.plan)
 }, [state])


 async function refreshChessComGames() {
  if (!user || state.status !== "ready" || refreshingGames) return

  const username =
   state.autoProfile?.chesscom_username ||
   user?.user_metadata?.chessComUsername ||
   localStorage.getItem("chessComUsername") ||
   ""

  if (!username.trim()) {
   alert("No Chess.com username found on this account.")
   return
  }

  try {
   setRefreshingGames(true)
   await runChessComImport(username, user.id)

   const autoProfile = await getOrCreateAutoProfile(user.id)
   if (autoProfile) {
    const plan = buildPersonalTrainingPlan(autoProfile)
    setState({ status: "ready", autoProfile, plan })
   }
  } catch (error) {
   console.error("Refresh Chess.com games failed:", error)
   alert("Could not refresh Chess.com games. Check console.")
  } finally {
   setRefreshingGames(false)
  }
 }


 async function analyzeGamesWithEngine() {
  if (!user || engineBusy) return

  try {
   setEngineBusy(true)
   setEngineProgress("Starting Stockfish...")

   const result = await analyzeImportedGamesWithStockfish(user.id, {
    maxGames: 150,
    depth: 8,
    minLossCp: 70,
    onProgress: (progress) => {
     setEngineProgress(progress.message)
    },
   })

   const autoProfile = await getOrCreateAutoProfile(user.id)
   if (autoProfile) {
    const plan = buildPersonalTrainingPlan(autoProfile)
    setState({ status: "ready", autoProfile, plan })
   }

   setEngineProgress(
    "Analyzed " +
     result.gamesAnalyzed +
     " games. Found " +
     result.mistakesFound +
     " mistakes."
   )
  } catch (error) {
   console.error("Engine analysis failed:", error)
   setEngineProgress("Engine analysis failed. Check console.")
  } finally {
   setEngineBusy(false)
  }
 }

 async function startRecommendedTraining(replace = false) {
  if (!user) {
   navigate("/auth", { replace })
   return
  }

  if (startingTraining) return

  setStartingTraining(true)

  try {
   const [dueSummary, latestWeeklyStatus] = await Promise.all([
    getDueSummary(user.id),
    getWeeklyTestStatus(user.id),
   ])

   setWeeklyStatus(latestWeeklyStatus)

   if (latestWeeklyStatus.status === "in_progress") {
    navigate(addAutoTrainingParams("/play-computer?weekly=1"), { replace })
    return
   }

   if (
    latestWeeklyStatus.status === "due" &&
    (!dueSummary || dueSummary.dueCount === 0)
   ) {
    navigate(addAutoTrainingParams("/play-computer?weekly=1"), { replace })
    return
   }

   const nextItem = dueSummary?.nextItem ?? (await getNextDueItem(user.id))

   if (nextItem?.route) {
    recordRecentAutoTrainer(nextItem.trainerKey, nextItem.route)
    recordRecentEndgameTrainer(nextItem.trainerKey, nextItem.route)
    navigate(buildAutoTrainingRoute(nextItem), { replace })
    return
   }

   // Transfer play is a fallback. It must not replace a scheduled course item.
   const endgameTransfer = await prepareNextEndgameTransfer(user.id)
   if (endgameTransfer) {
    navigate(addAutoTrainingParams("/play-computer?endgameTransfer=1"), { replace })
    return
   }

   if (latestWeeklyStatus.status === "due") {
    navigate(addAutoTrainingParams("/play-computer?weekly=1"), { replace })
    return
   }

   navigate("/auto?caughtUp=1", { replace: true })
  } catch (error) {
   console.error("Could not start recommended training:", error)
   alert("Could not open the next course item. Check the console.")
  } finally {
   setStartingTraining(false)
  }
 }

 function openWeeklyTest() {
  if (!user) {
   navigate("/auth")
   return
  }

  navigate("/play-computer?weekly=1")
 }

 useEffect(() => {
  if (state.status !== "ready" || !user) return

  const params = new URLSearchParams(location.search)
  if (params.get("continue") !== "1") return
  if (continueRunRef.current === location.key) return

  continueRunRef.current = location.key
  void startRecommendedTraining(true)
 }, [location.key, location.search, state.status, user])

 const courseCaughtUp =
  new URLSearchParams(location.search).get("caughtUp") === "1"

 if (state.status !== "ready") {
  return (
   <div style={pageStyle()}>
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
     <div style={cardStyle()}>
      <h1>{state.message}</h1>
     </div>
    </div>
   </div>
  )
 }

 const { plan, autoProfile } = state

 return (
  <div style={pageStyle()}>
   <div style={{ maxWidth: 1120, margin: "0 auto" }}>
    <div style={{ marginBottom: 22 }}>
     <h1 style={{ fontSize: 40, margin: "0 0 8px" }}>Your Personal Chess Course</h1>
     <p style={{ color: "#cfcfcf", fontSize: 17, lineHeight: 1.5, maxWidth: 760 }}>
     The course has five regular sections. The weights are calculated from your rating goal,
      detected ratings, imported games, openings, and later your repeated mistakes.
     </p>
     {!plan.analysisAvailable && plan.analysisMessage && (
      <p style={{ color: "#f0dca0", fontSize: 14, lineHeight: 1.5, maxWidth: 760 }}>
       {plan.analysisMessage}
      </p>
     )}
     <button
      onClick={refreshChessComGames}
      disabled={refreshingGames}
      style={{
       marginTop: 12,
       padding: "10px 14px",
       borderRadius: 12,
       border: "1px solid rgba(255,255,255,0.16)",
       background: refreshingGames ? "rgba(255,255,255,0.12)" : "#3d7f46",
       color: "#fff",
       fontWeight: 800,
       cursor: refreshingGames ? "wait" : "pointer",
      }}
     >
      {refreshingGames ? "Refreshing games..." : "Refresh Chess.com games"}
     </button>
     <button
      onClick={analyzeGamesWithEngine}
      disabled={engineBusy}
      style={{
       marginTop: 10,
       marginLeft: 10,
       padding: "10px 14px",
       borderRadius: 12,
       border: "1px solid rgba(255,255,255,0.16)",
       background: engineBusy ? "rgba(255,255,255,0.12)" : "#6f5bd6",
       color: "#fff",
       fontWeight: 800,
       cursor: engineBusy ? "wait" : "pointer",
      }}
     >
      {engineBusy ? "Analyzing..." : "Analyze all remaining games with Stockfish"}
     </button>
     {engineProgress && (
      <div style={{ marginTop: 10, color: "#d6d6d6", fontSize: 14 }}>
       {engineProgress}
      </div>
     )}

    </div>

    <div
     style={{
      ...cardStyle(),
      marginBottom: 18,
      display: "grid",
      gridTemplateColumns: "1fr auto",
      gap: 18,
      alignItems: "center",
      background:
       weeklyStatus?.status === "complete"
        ? "linear-gradient(135deg, rgba(75,72,71,0.96), rgba(31,29,28,0.96))"
        : "linear-gradient(135deg, rgba(127,166,80,0.24), rgba(31,29,28,0.96))",
     }}
    >
     <div>
      <div
       style={{
        display: "inline-flex",
        borderRadius: 999,
        padding: "6px 10px",
        background: "rgba(242,193,78,0.16)",
        color: "#f4dda0",
        fontSize: 13,
        fontWeight: 900,
        marginBottom: 10,
       }}
      >
       Weekly transfer test
      </div>

      <h2 style={{ margin: "0 0 7px", fontSize: 27 }}>
       One game as White and one as Black
      </h2>

      <p style={{ margin: 0, color: "#d0d0d0", lineHeight: 1.5 }}>
       Untimed, no resignation, and no assistance. Recent mate and tactic trainers
       become hidden transfer targets, and the computer steers toward natural chances
       to use them without abandoning normal engine play.
      </p>

      <div style={{ marginTop: 10, color: "#f0dca0", fontWeight: 800 }}>
       {!weeklyStatus
        ? "Checking this week's status..."
        : weeklyStatus.status === "complete"
         ? "Complete for this week"
         : weeklyStatus.status === "in_progress"
          ? `${weeklyStatus.gamesCompleted} of 2 games complete - resume required`
          : "Due this week"}
      </div>

      {weeklyStatus && (
       <div style={{ marginTop: 5, color: "#aaa", fontSize: 12 }}>
        {weeklyStatus.cloudAvailable
         ? "Account sync available"
         : "Saved on this device until the Supabase table is installed"}
       </div>
      )}
     </div>

     <button
      type="button"
      onClick={openWeeklyTest}
      style={{
       border: "none",
       borderRadius: 14,
       background:
        weeklyStatus?.status === "complete" ? "#4b4847" : "#81b64c",
       color: "#fff",
       padding: "14px 18px",
       minWidth: 170,
       fontWeight: 900,
       fontSize: 15,
       cursor: "pointer",
      }}
     >
      {weeklyStatus?.status === "complete"
       ? "Open weekly review"
       : weeklyStatus?.status === "in_progress"
        ? "Resume weekly test"
        : "Start weekly test"}
     </button>
    </div>

    <div
     style={{
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) 340px",
      gap: 18,
      alignItems: "start",
     }}
    >
     <main style={cardStyle()}>
      <div
       style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
        gap: 10,
       }}
      >
       {plan.sections.map((section) => (
        <div key={section.key} style={sectionCardStyle()}>
         <div style={{ color: "#bdbdbd", fontSize: 13 }}>{section.label}</div>
         <div style={{ fontSize: 30, fontWeight: 900, marginTop: 4 }}>
          {section.weight}%
         </div>
        </div>
       ))}
      </div>

      <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
       {plan.sections.map((section) => (
        <div
         key={section.key}
         style={{
          ...sectionCardStyle(),
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 16,
          alignItems: "center",
         }}
        >
         <div>
          <h2 style={{ margin: "0 0 6px" }}>
           {section.label} - {section.weight}%
          </h2>
          <p style={{ color: "#cfcfcf", lineHeight: 1.45, margin: 0 }}>{section.reason}</p>

          {section.key === "masterGames" && (
           <p style={{ color: "#f0dca0", lineHeight: 1.45, margin: "8px 0 0" }}>
            New master game every {section.newMasterGameEveryDays} days. After a game is added,
            the full game repeats with spaced repetition until mastered.
           </p>
          )}
         </div>

         <button
          type="button"
          onClick={() => navigate(section.route)}
          style={{
           border: "none",
           borderRadius: 12,
           background: "#4b4847",
           color: "#fff",
           padding: "11px 14px",
           fontWeight: 800,
           cursor: "pointer",
           whiteSpace: "nowrap",
          }}
         >
          Open
         </button>
        </div>
       ))}
      </div>
     </main>

     <aside style={cardStyle()}>
      <div
       style={{
        display: "inline-flex",
        borderRadius: 999,
        background: "rgba(129,182,76,0.18)",
        padding: "6px 10px",
        color: "#d8f4ce",
        fontWeight: 800,
        fontSize: 13,
        marginBottom: 12,
       }}
      >
       Course status
      </div>

      <div style={{ display: "grid", gap: 12 }}>
       <div style={sectionCardStyle()}>
        <div style={{ color: "#bdbdbd", fontSize: 13 }}>Detected rating</div>
        <div style={{ fontSize: 26, fontWeight: 900 }}>
         {plan.currentRating}
        </div>
        <div style={{ color: "#cfcfcf", fontSize: 13 }}>
         Source: {plan.ratingSource}
        </div>
       </div>

       <div style={sectionCardStyle()}>
        <div style={{ color: "#bdbdbd", fontSize: 13 }}>Rating band</div>
        <div style={{ fontWeight: 900 }}>{ratingBandLabel(plan)}</div>
       </div>

       <div style={sectionCardStyle()}>
        <div style={{ color: "#bdbdbd", fontSize: 13 }}>Target rating</div>
        <div style={{ fontWeight: 900 }}>{plan.targetRating ?? "Not set"}</div>
       </div>

       <div style={sectionCardStyle()}>
        <div style={{ color: "#bdbdbd", fontSize: 13 }}>Next milestone</div>
        <div style={{ fontWeight: 900 }}>{plan.nextMilestone ?? "Maintain and improve"}</div>
       </div>

       <div style={sectionCardStyle()}>
        <div style={{ color: "#bdbdbd", fontSize: 13 }}>Imported games</div>
        <div style={{ fontWeight: 900 }}>{autoProfile.imported_games_count ?? 0}</div>
       </div>
      </div>

      <button
       type="button"
       onClick={() => void startRecommendedTraining(false)}
       disabled={startingTraining}
       style={{
        marginTop: 18,
        width: "100%",
        border: "none",
        borderRadius: 14,
        background: "#81b64c",
        color: "#fff",
        padding: "14px 16px",
        fontWeight: 900,
        fontSize: 16,
        cursor: startingTraining ? "wait" : "pointer",
        opacity: startingTraining ? 0.72 : 1,
       }}
      >
       {startingTraining ? "Opening next item..." : "Start recommended training"}
      </button>

      {courseCaughtUp && (
       <p style={{ color: "#d8f4ce", fontSize: 13, lineHeight: 1.45 }}>
        You are caught up. No scheduled course item is due right now.
       </p>
      )}

      {recommended && (
       <p style={{ color: "#cfcfcf", fontSize: 13, lineHeight: 1.45 }}>
        Recommended now: <strong>{recommended.label}</strong>
       </p>
      )}
     </aside>
    </div>
   </div>
  </div>
 )
}
