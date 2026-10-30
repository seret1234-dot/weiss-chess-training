import type { CSSProperties } from "react"
import { accountStorageKey } from '../auth/accountBrowserStorage'
import { useEffect, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { getOrCreateAutoProfile } from "../training/getOrCreateAutoProfile"
import {
 buildPersonalTrainingPlan,
} from "../training/buildPersonalTrainingPlan"
import type { PersonalTrainingPlan } from "../training/buildPersonalTrainingPlan"
import { addAutoTrainingParams } from "../training/autoTrainingRoute"
import {
 getCurriculumDecisionForUser,
 type CurriculumRuntimeDecision,
} from "../training/curriculum/curriculumRuntime"
import {
 getWeeklyTestStatus,
 getWeeklyPlanMultipliers,
 weeklySections,
 type WeeklyTestPlanStatus,
} from "../training/weeklyAdaptiveTest"
import { recordRecentAutoTrainer } from "../training/targetedSparring"
import {
 prepareNextEndgameTransfer,
 recordRecentEndgameTrainer,
} from "../training/endgameTransfer"
import { resolveAutoStartRoute } from "../training/resolveAutoStartRoute"
import { canUseRatingPlanAfterWeeklyAssessment, resolvePlanAutoActivity } from '../training/resolvePlanAutoActivity'
import { importConnectedAccounts } from "../training/importConnectedAccounts"
import { analyzeImportedGamesWithStockfish, getRemainingImportedGamesToAnalyze } from "../training/engineAnalyzeImportedGames"
import { supabase } from "../lib/supabase"
import "../AccountAutoStudy.css"
import { autoEntryEnabled } from '../training/autoEntryEnabled'
import { useBackgroundAnalysis } from '../context/BackgroundAnalysisContext'

const AUTO_BOARD_VISION_SESSION_KEY = "weiss-chess-auto-board-vision-done-v1"
const AUTO_SECTION_OFFSET_KEY = "weiss-chess-auto-section-offset-v1"

async function buildPlanWithMasterGameCadence(autoProfile: any, userId: string) {
 const weekly = weeklySections(await getWeeklyPlanMultipliers(userId))
 try {
  const { data, error } = await supabase
   .from("training_progress")
   .select("created_at")
   .eq("user_id", userId)
   .eq("course", "master_games")
   .order("created_at", { ascending: false })
   .limit(1)
   .maybeSingle()
  if (!error && data?.created_at) {
   return buildPersonalTrainingPlan({ ...autoProfile, master_game_last_introduced_at: data.created_at }, weekly)
  }
 } catch {
  // Cadence metadata is advisory when an older schema lacks created_at.
 }
 return buildPersonalTrainingPlan(autoProfile, weekly)
}

function boardVisionDoneThisSession(userId: string) {
 try { return sessionStorage.getItem(accountStorageKey(AUTO_BOARD_VISION_SESSION_KEY, userId)) === userId } catch { return false }
}

function resetBoardVisionSession(userId: string) {
 try { sessionStorage.removeItem(accountStorageKey(AUTO_BOARD_VISION_SESSION_KEY, userId)) } catch { /* storage unavailable */ }
 try { sessionStorage.setItem(accountStorageKey(AUTO_SECTION_OFFSET_KEY, userId), "0") } catch { /* storage unavailable */ }
}

function markBoardVisionDoneThisSession(userId: string) {
 try { sessionStorage.setItem(accountStorageKey(AUTO_BOARD_VISION_SESSION_KEY, userId), userId) } catch { /* storage unavailable */ }
}

function getAutoCurriculumDecision(userId: string) {
 return getCurriculumDecisionForUser(userId, {
  excludedAreas: boardVisionDoneThisSession(userId) ? ["board-vision"] : [],
 })
}

function autoSectionOffset(userId: string) {
 try { return Math.max(0, Number(sessionStorage.getItem(accountStorageKey(AUTO_SECTION_OFFSET_KEY, userId))) || 0) } catch { return 0 }
}

function advanceAutoSectionOffset(userId: string) {
 try { sessionStorage.setItem(accountStorageKey(AUTO_SECTION_OFFSET_KEY, userId), String(autoSectionOffset(userId) + 1)) } catch { /* storage unavailable */ }
}

function planAwareDecision(plan: PersonalTrainingPlan, decision: CurriculumRuntimeDecision | null, userId: string) {
 const excluded = boardVisionDoneThisSession(userId) ? ["boardVision" as const] : []
 const completedSelections = (decision?.selectionIndex ?? 0) + autoSectionOffset(userId)
 const completedCalculationSelections = decision?.depthSelectionIndex ?? decision?.selectionIndex ?? 0
 return resolvePlanAutoActivity(plan, decision, userId, completedSelections, excluded, undefined, completedCalculationSelections)
}

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
 if (plan.ratingBand === "1000to1600") return "1000–1600"
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
 const [remainingAnalysisGames, setRemainingAnalysisGames] = useState<number | null>(null)
 const [weeklyStatus, setWeeklyStatus] = useState<WeeklyTestPlanStatus | null>(null)
 const [curriculumDecision, setCurriculumDecision] = useState<CurriculumRuntimeDecision | null>(null)
 const { job: backgroundAnalysisJob } = useBackgroundAnalysis()
 const [analysisRefreshRevision, setAnalysisRefreshRevision] = useState(0)

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

    if (new URLSearchParams(location.search).get("continue") !== "1") resetBoardVisionSession(user.id)
    const autoProfile = await getOrCreateAutoProfile(user.id)
    if (cancelled) return

    if (!autoProfile) {
     if (!cancelled) setState({ status: "error", message: "Auto profile error" })
     return
    }

    if (!autoProfile.onboarding_complete) {
     navigate("/onboarding", { replace: true })
     return
    }

    const [nextWeeklyStatus, nextCurriculumDecision, remainingGames] = await Promise.all([
     getWeeklyTestStatus(user.id),
     getAutoCurriculumDecision(user.id),
     getRemainingImportedGamesToAnalyze(user.id),
    ])
    const plan = await buildPlanWithMasterGameCadence(autoProfile, user.id)
    const displayDecision = canUseRatingPlanAfterWeeklyAssessment(nextWeeklyStatus.status, nextWeeklyStatus.reviewRoute)
     ? await planAwareDecision(plan, nextCurriculumDecision, user.id)
     : nextCurriculumDecision

    if (!cancelled) {
     setState({ status: "ready", autoProfile, plan })
     setWeeklyStatus(nextWeeklyStatus)
     setCurriculumDecision(displayDecision)
     setRemainingAnalysisGames(remainingGames)
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
 }, [analysisRefreshRevision, location.search, navigate, user])

 // Completion is durable in the profile and the provider is mounted above
 // Routes. Refresh only this Auto dashboard; an active trainer is a different
 // route and is never navigated or restarted by this listener. Its next return
 // to Auto therefore receives the newly personalized plan at a chunk boundary.
 useEffect(() => {
  if (backgroundAnalysisJob.status !== 'completed' || backgroundAnalysisJob.input?.userId !== user?.id) return
  setAnalysisRefreshRevision((revision) => revision + 1)
 }, [backgroundAnalysisJob.jobId, backgroundAnalysisJob.status, backgroundAnalysisJob.updatedAt, user?.id])

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

 async function refreshConnectedGames() {
  if (!user || state.status !== "ready" || refreshingGames) return

  const chesscomUsername =
   state.autoProfile?.chesscom_username ||
   user?.user_metadata?.chessComUsername ||

   ""
  const lichessUsername =
   state.autoProfile?.lichess_username ||
   user?.user_metadata?.lichessUsername ||
   user?.user_metadata?.lichess_username ||
   ""

  if (!chesscomUsername.trim() && !lichessUsername.trim()) {
   alert("No connected Chess.com or Lichess username found on this account.")
   return
  }

  try {
   setRefreshingGames(true)
   setEngineProgress("Refreshing connected games...")
   await importConnectedAccounts({
    userId: user.id,
    chesscomUsername,
    lichessUsername,
    onProgress: (progress) => setEngineProgress(progress.warning ? `${progress.message} ${progress.warning}` : progress.message),
   })
   await analyzeImportedGamesWithStockfish(user.id, {
    maxGames: 150,
    depth: 8,
    minLossCp: 70,
    onProgress: (progress) => setEngineProgress(progress.message),
   })

   const autoProfile = await getOrCreateAutoProfile(user.id)
   if (autoProfile) {
   const plan = await buildPlanWithMasterGameCadence(autoProfile, user.id)
   setState({ status: "ready", autoProfile, plan })
   const decision = await getAutoCurriculumDecision(user.id)
   setCurriculumDecision(await planAwareDecision(plan, decision, user.id))
    setRemainingAnalysisGames(await getRemainingImportedGamesToAnalyze(user.id))
   }
  } catch (error) {
   console.error("Refresh connected games failed:", error)
   alert(error instanceof Error ? error.message : "Could not refresh connected games.")
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
   const plan = await buildPlanWithMasterGameCadence(autoProfile, user.id)
   setState({ status: "ready", autoProfile, plan })
   const decision = await getAutoCurriculumDecision(user.id)
   setCurriculumDecision(await planAwareDecision(plan, decision, user.id))
    setRemainingAnalysisGames(await getRemainingImportedGamesToAnalyze(user.id))
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
   const [latestWeeklyStatus, nextCurriculumDecision] = await Promise.all([
    getWeeklyTestStatus(user.id),
    getAutoCurriculumDecision(user.id),
   ])

   setWeeklyStatus(latestWeeklyStatus)
   if (!canUseRatingPlanAfterWeeklyAssessment(latestWeeklyStatus.status, latestWeeklyStatus.reviewRoute)) {
    navigate(resolveAutoStartRoute({ weeklyStatus: latestWeeklyStatus, curriculumDecision: nextCurriculumDecision }), { replace })
    return
   }
   // Re-read Weekly evidence at launch, including a review completed since hydration.
   const currentPlan = state.status === "ready" ? await buildPlanWithMasterGameCadence(state.autoProfile, user.id) : null
   const sectionMultipliers = weeklySections(await getWeeklyPlanMultipliers(user.id))
   const rawPlannedDecision = currentPlan ? await planAwareDecision(currentPlan, nextCurriculumDecision, user.id) : nextCurriculumDecision
   const plannedDecision = rawPlannedDecision?.autoSelectionDebug ? {
    ...rawPlannedDecision,
    autoSelectionDebug: {
     ...rawPlannedDecision.autoSelectionDebug,
     assessmentEvidence: latestWeeklyStatus.status,
     sectionMultipliers,
    },
   } : rawPlannedDecision
   setCurriculumDecision(plannedDecision)

   const nextItem = plannedDecision

   if (nextItem?.route) {
    if (nextItem.curriculumArea === "board-vision") markBoardVisionDoneThisSession(user.id)
    advanceAutoSectionOffset(user.id)
    recordRecentAutoTrainer(nextItem.trainerKey, nextItem.route, user.id)
    recordRecentEndgameTrainer(nextItem.trainerKey, nextItem.route, user.id)
    navigate(resolveAutoStartRoute({ weeklyStatus: latestWeeklyStatus, curriculumDecision: nextItem }), { replace })
    return
   }

   // Transfer play remains a fallback after the canonical curriculum decision.
   const endgameTransfer = await prepareNextEndgameTransfer(user.id)
   navigate(resolveAutoStartRoute({
    weeklyStatus: latestWeeklyStatus,
    curriculumDecision: null,
    endgameTransferAvailable: Boolean(endgameTransfer),
   }), { replace })
  } catch (error) {
   console.error("Could not start recommended training:", error)
   if (autoEntryEnabled) setState({ status: 'error', message: 'Could not open Auto Training. Use Menu to return Home and retry.' })
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
   <div className="auto-study-page" style={pageStyle()}>
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
     <div style={cardStyle()}>
      <h1>{state.message}</h1>
     </div>
    </div>
   </div>
  )
 }

 const { plan, autoProfile } = state
  const showAutoDebug = new URLSearchParams(location.search).get('debugAuto') === '1'

 // Direct entry: keep the course launch automatic, without flashing its
 // Start/Continue dashboard while the existing async selector opens a trainer.
 if (new URLSearchParams(location.search).get('continue') === '1') {
  return <div role="status" style={pageStyle()}>Opening Auto Training…</div>
 }

 return (
  <div className="auto-study-page" style={pageStyle()}>
   <div className="auto-study-page__shell" style={{ maxWidth: 1120, margin: "0 auto" }}>
    <div className="auto-study-page__header" style={{ marginBottom: 22 }}>
     <h1 className="auto-study-page__title" style={{ fontSize: 40, margin: "0 0 8px" }}>Your Personal Chess Course</h1>
     <p style={{ color: "#cfcfcf", fontSize: 17, lineHeight: 1.5, maxWidth: 760 }}>
      Your course keeps the same seven sections. Priorities and depth adapt using your normalized training rating,
       goal, daily practice capacity, imported games, openings, and later your repeated mistakes.
     </p>
     {!plan.analysisAvailable && plan.analysisMessage && (
      <p style={{ color: "#f0dca0", fontSize: 14, lineHeight: 1.5, maxWidth: 760 }}>
       {plan.analysisMessage}
      </p>
     )}
     <div className="auto-study-page__header-actions">
     <button
      onClick={refreshConnectedGames}
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
       {refreshingGames ? "Refreshing games..." : "Refresh connected games"}
      </button>
      {remainingAnalysisGames !== null && remainingAnalysisGames > 0 ? (
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
       {engineBusy ? "Analyzing..." : `Analyze ${remainingAnalysisGames} remaining ${remainingAnalysisGames === 1 ? "game" : "games"} with Stockfish`}
      </button>
      ) : null}
      </div>
     {engineProgress && (
      <div style={{ marginTop: 10, color: "#d6d6d6", fontSize: 14 }}>
       {engineProgress}
      </div>
     )}

    </div>

    <div
     className="auto-study-page__weekly-card"
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
      {showAutoDebug && curriculumDecision?.autoSelectionDebug && (
       <details data-testid="auto-selection-debug" style={{ marginTop: 12, color: '#d8d8d8' }}>
        <summary>Auto selection debug</summary>
        <dl style={{ margin: '8px 0 0', display: 'grid', gap: 4 }}>
         <div><dt style={{ display: 'inline', fontWeight: 700 }}>Rating: </dt><dd style={{ display: 'inline', margin: 0 }}>{curriculumDecision.autoSelectionDebug.trainingRating} ({curriculumDecision.autoSelectionDebug.ratingSource})</dd></div>
         <div><dt style={{ display: 'inline', fontWeight: 700 }}>Active plan: </dt><dd style={{ display: 'inline', margin: 0 }}>{curriculumDecision.autoSelectionDebug.activePlanLabel}</dd></div>
         <div><dt style={{ display: 'inline', fontWeight: 700 }}>Subject weights: </dt><dd style={{ display: 'inline', margin: 0 }}>{Object.entries(curriculumDecision.autoSelectionDebug.subjectWeights ?? {}).map(([key, value]) => `${key} ${value}%`).join(', ') || 'unavailable'}</dd></div>
         <div><dt style={{ display: 'inline', fontWeight: 700 }}>Imported evidence: </dt><dd style={{ display: 'inline', margin: 0 }}>{curriculumDecision.autoSelectionDebug.importedEvidence ?? 'none'}</dd></div>
         <div><dt style={{ display: 'inline', fontWeight: 700 }}>Assessment evidence: </dt><dd style={{ display: 'inline', margin: 0 }}>{weeklyStatus?.status ?? 'unavailable'}</dd></div>
         <div><dt style={{ display: 'inline', fontWeight: 700 }}>Assessment multipliers: </dt><dd style={{ display: 'inline', margin: 0 }}>{Object.entries(curriculumDecision.autoSelectionDebug.sectionMultipliers ?? {}).map(([key, value]) => `${key} ×${Number(value).toFixed(2)}`).join(', ') || 'not yet selected'}</dd></div>
         <div><dt style={{ display: 'inline', fontWeight: 700 }}>Area/depth ordinals: </dt><dd style={{ display: 'inline', margin: 0 }}>{curriculumDecision.autoSelectionDebug.areaSelectionIndex ?? 'n/a'} / {curriculumDecision.autoSelectionDebug.depthSelectionIndex ?? 'n/a'}</dd></div>
         <div><dt style={{ display: 'inline', fontWeight: 700 }}>Reinforcement: </dt><dd style={{ display: 'inline', margin: 0 }}>{Object.entries(curriculumDecision.autoSelectionDebug.reinforcement ?? {}).map(([area, state]) => `${area}: ${state.active ? `active until ${state.until ?? 'unspecified'}` : 'inactive'}`).join(', ') || 'none'}</dd></div>
         <div><dt style={{ display: 'inline', fontWeight: 700 }}>Chosen exercise: </dt><dd style={{ display: 'inline', margin: 0 }}>{curriculumDecision.autoSelectionDebug.chosenExercise}</dd></div>
         <div><dt style={{ display: 'inline', fontWeight: 700 }}>Selection reason: </dt><dd style={{ display: 'inline', margin: 0 }}>{curriculumDecision.autoSelectionDebug.selectionReason}</dd></div>
        </dl>
       </details>
      )}
     </div>

     <button
      className="auto-study-page__weekly-action"
      type="button"
      onClick={openWeeklyTest}
      style={{
       border: "none",
       borderRadius: 14,
       background: "var(--action-secondary-bg)",
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
     className="auto-study-page__content-grid"
     style={{
      display: "grid",
      gridTemplateColumns: "minmax(0, 1fr) 340px",
      gap: 18,
      alignItems: "start",
     }}
    >
     <div className="auto-study-page__course-card" style={cardStyle()}>
      <div
       className="auto-study-page__priority-grid"
       style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
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
         className="auto-study-page__section-row"
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
          className="auto-study-page__section-action"
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
     </div>

     <aside className="auto-study-page__sidebar" style={cardStyle()}>
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
         <div style={{ color: "#bdbdbd", fontSize: 13 }}>Current training rating</div>
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
         <div style={{ color: "#bdbdbd", fontSize: 13 }}>Daily plan capacity</div>
         <div style={{ fontWeight: 900 }}>{plan.dailyPracticeMinutes} declared min · {plan.effectiveDailyPracticeMinutes.toFixed(1)} effective min</div>
         <div style={{ color: "#cfcfcf", fontSize: 13 }}>
          {plan.timeframeMonths ? `${plan.timeframeMonths}-month target window` : "Long-term / no deadline"}
         </div>
        </div>

        {plan.goalFeasibility && (
         <div style={sectionCardStyle()}>
          <div style={{ color: "#bdbdbd", fontSize: 13 }}>Goal status</div>
          <div style={{ fontWeight: 900 }}>{plan.goalFeasibility.status.toLowerCase().replaceAll("_", " ")}</div>
         </div>
        )}

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
        background: "var(--action-primary-bg)",
        color: "var(--action-primary-text)",
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

      {curriculumDecision && (
       <p style={{ color: "#cfcfcf", fontSize: 13, lineHeight: 1.45 }}>
        Recommended now: <strong>{curriculumDecision.label}</strong>
       </p>
      )}
     </aside>
    </div>
   </div>
  </div>
 )
}
