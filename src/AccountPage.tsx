import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "./lib/supabase"
import { useSubscription } from "./context/SubscriptionContext"
import ThemeSelector from "./theme/ThemeSelector"
import { ConnectedImportFailure, hasUnsavedConnectedAccountChanges, importConnectedAccounts, requiresVisibleImportFailure, resolveSavedConnectedAccounts } from "./training/importConnectedAccounts"
import { analyzeImportedGamesWithStockfish, hasHonestAnalysisCompletion, type EngineAnalysisProgress } from "./training/engineAnalyzeImportedGames"
import { getOrCreateAutoProfile } from "./training/getOrCreateAutoProfile"
import TrainingGoalsFields from "./components/TrainingGoalsFields"
import {
 readTrainingGoals,
 serializeLegacyProfileTrainingGoals,
 serializeTrainingGoals,
 validTrainingRating,
 validateTrainingGoals,
 type TrainingGoals,
} from "./training/trainingGoals"
import "./AccountAutoStudy.css"

function formatDate(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString()
}

function formatDuration(milliseconds: number | null | undefined) {
 const seconds = Math.max(0, Math.round((milliseconds || 0) / 1000))
 if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`
 const minutes = Math.round(seconds / 60)
 return `${minutes} minute${minutes === 1 ? "" : "s"}`
}

function formatAnalysisProgress(progress: EngineAnalysisProgress) {
 const parts = [progress.message]
 if (progress.currentGame && progress.gamesTotal && progress.estimatedRemainingMs && progress.estimatedRemainingMs > 0) {
  parts[0] += ` — about ${formatDuration(progress.estimatedRemainingMs)} remaining`
 }
 if (progress.gamesSkipped || progress.gamesFailed) parts.push(`${progress.gamesSkipped} skipped, ${progress.gamesFailed} failed`)
 if (progress.gamesTotal) parts.push(`${formatDuration(progress.elapsedMs)} elapsed`)
 return parts.join(" · ")
}

function formatSourceSummary(sourceCounts: { "chess.com": number; lichess: number }) {
 return `Chess.com: ${sourceCounts["chess.com"]}; Lichess: ${sourceCounts.lichess}`
}

function normalizedUsername(value: unknown) {
 return String(value || "").trim()
}

export default function AccountPage() {
 const navigate = useNavigate()
 const [email, setEmail] = useState("")
 const [chessCom, setChessCom] = useState("")
 const [savedChessComUsername, setSavedChessComUsername] = useState("")
 const [savedLichessUsername, setSavedLichessUsername] = useState("")
 const [importedGamesCount, setImportedGamesCount] = useState(0)
 const [needsConnectedImport, setNeedsConnectedImport] = useState(false)
 const [lichess, setLichess] = useState("")
 const [message, setMessage] = useState("")
 const [error, setError] = useState("")
 const [saving, setSaving] = useState(false)
 const [importingGames, setImportingGames] = useState(false)
 const [importProgress, setImportProgress] = useState("")
 const [importSummary, setImportSummary] = useState("")
 const [cancelling, setCancelling] = useState(false)
 const [trainingGoals, setTrainingGoals] = useState<TrainingGoals>({
  manualCurrentRating: null,
  targetRating: null,
  dailyMinutes: 20,
  timeframeMonths: null,
  currentMilestoneRating: null,
 })
 const [automaticCurrentRating, setAutomaticCurrentRating] = useState<number | null>(null)
 const [savingTrainingGoals, setSavingTrainingGoals] = useState(false)
 const [trainingGoalsMessage, setTrainingGoalsMessage] = useState("")
 const [trainingGoalsError, setTrainingGoalsError] = useState("")
 const [membershipMessage, setMembershipMessage] = useState("")
 const [membershipActionError, setMembershipActionError] = useState("")
 const {
   subscription,
   isPremium,
   loading: subscriptionLoading,
   error: subscriptionError,
   refreshSubscription,
 } = useSubscription()

 const accessUntil = formatDate(subscription?.current_period_end)
 const planLabel =
   subscription?.plan === "monthly"
     ? "Monthly Premium"
     : subscription?.plan === "yearly"
       ? "Yearly Premium"
       : isPremium
         ? "Premium"
         : "Free"

 const membershipDescription = (() => {
   if (subscriptionLoading) return "Checking your membership..."

   if (subscription?.cancel_at_period_end && accessUntil) {
     return `Renewal is cancelled. Premium access remains active until ${accessUntil}.`
   }

   if (isPremium && accessUntil) {
     return `Premium is active. The next billing date is ${accessUntil}.`
   }

   if (isPremium) return "Your Premium access is active."

   if (subscription?.status === "past_due") {
     return "A payment problem has paused Premium access. Check your PayPal account."
   }

   if (subscription?.status === "expired") {
     return "Your previous Premium subscription has expired."
   }

   if (subscription?.status === "cancelled") {
     return "Your previous Premium subscription is cancelled."
   }

   return "You currently have Free access."
 })()

 useEffect(() => {
   async function load() {
     const { data, error } = await supabase.auth.getUser()

     if (error) {
       setError(error.message)
       return
     }

     const user = data.user
     setEmail(user?.email || "")

     if (user) {
       const autoProfile = await getOrCreateAutoProfile(user.id)
       const saved = resolveSavedConnectedAccounts(
        autoProfile as Record<string, unknown> | null,
        user.user_metadata as Record<string, unknown> | null,
       )
       const importedCount = Math.max(
         0,
         Number(autoProfile?.imported_games_count) || 0,
       )

       setChessCom(saved.chesscom)
       setSavedChessComUsername(saved.chesscom)
       setLichess(saved.lichess)
       setSavedLichessUsername(saved.lichess)
       setImportedGamesCount(importedCount)
       setTrainingGoals(readTrainingGoals(autoProfile))
       setAutomaticCurrentRating(validTrainingRating(autoProfile?.estimated_rating))
       setNeedsConnectedImport(
         Boolean(saved.chesscom || saved.lichess) && importedCount === 0,
       )
     } else {
       const saved = resolveSavedConnectedAccounts(null, user?.user_metadata as Record<string, unknown> | null)
       setChessCom(saved.chesscom)
       setSavedChessComUsername(saved.chesscom)
       setLichess(saved.lichess)
       setSavedLichessUsername(saved.lichess)
     }
   }

   void load()
 }, [])

 async function save() {
   setSaving(true)
   setMessage("")
   setError("")

   try {
    const savedChesscom = normalizedUsername(chessCom)
    const savedLichess = normalizedUsername(lichess)
    const changed = savedChesscom !== savedChessComUsername || savedLichess !== savedLichessUsername
    const { error: metadataError } = await supabase.auth.updateUser({
      data: {
       chess_com_username: savedChesscom || null,
       chessComUsername: savedChesscom || null,
       lichess_username: savedLichess || null,
       lichessUsername: savedLichess || null,
      },
    })
    if (metadataError) throw metadataError

    const { data } = await supabase.auth.getUser()
    if (!data.user) throw new Error("Please log in again before saving connected accounts.")
    const profileFields = { chesscom_username: savedChesscom || null, lichess_username: savedLichess || null }
    const { error: profileError } = await supabase.from("profiles").update(profileFields).eq("id", data.user.id)
    if (profileError) throw profileError
    const { error: autoProfileError } = await supabase.from("user_auto_profile").upsert({ user_id: data.user.id, ...profileFields })
    if (autoProfileError) throw autoProfileError

    setSavedChessComUsername(savedChesscom)
    setSavedLichessUsername(savedLichess)
    setNeedsConnectedImport(Boolean(savedChesscom || savedLichess) && (changed || importedGamesCount === 0))
    setImportSummary("")
    setImportProgress("")
    setMessage(changed && (savedChesscom || savedLichess) ? "Saved successfully. Starting connected-account import..." : "Saved successfully")
    if (changed && (savedChesscom || savedLichess)) await importConnectedGames(savedChesscom, savedLichess)
   } catch (saveError) {
    setError(saveError instanceof Error ? saveError.message : "Could not save connected accounts.")
   } finally {
    setSaving(false)
   }
 }

 async function saveTrainingGoals() {
  const validationError = validateTrainingGoals(trainingGoals, true)
  if (validationError) {
   setTrainingGoalsError(validationError)
   return
  }

  setSavingTrainingGoals(true)
  setTrainingGoalsError("")
  setTrainingGoalsMessage("")
  try {
   const { data, error: userError } = await supabase.auth.getUser()
   if (userError || !data.user) throw new Error("Please log in again before saving training goals.")

   const { error: profileError } = await supabase
    .from("profiles")
    .update(serializeLegacyProfileTrainingGoals(trainingGoals))
    .eq("id", data.user.id)
   if (profileError) throw profileError

   const { error: autoProfileError } = await supabase
    .from("user_auto_profile")
    .upsert({ user_id: data.user.id, ...serializeTrainingGoals(trainingGoals) })
   if (autoProfileError) throw autoProfileError

   setTrainingGoalsMessage("Training goals saved. Your next course refresh will use this practice capacity and milestone.")
  } catch (saveError) {
   setTrainingGoalsError(saveError instanceof Error ? saveError.message : "Could not save training goals.")
  } finally {
   setSavingTrainingGoals(false)
  }
 }

 async function importConnectedGames(chesscomOverride: string, lichessOverride: string) {
   const chesscom = normalizedUsername(chesscomOverride)
   const lichessUsername = normalizedUsername(lichessOverride)
   if (!chesscom && !lichessUsername) {
     setError("Save a Chess.com or Lichess username before importing games.")
     return
   }

   setImportingGames(true)
   setError("")
   setImportSummary("")
   setImportProgress("Preparing connected-account import...")

   try {
     const { data, error: sessionError } = await supabase.auth.getUser()
     const user = data.user

     if (sessionError || !user) {
       throw new Error("Please log in again before importing games.")
     }

     const imported = await importConnectedAccounts({
      userId: user.id,
      chesscomUsername: chesscom,
      lichessUsername,
      onProgress: (progress) => {
       setImportProgress(progress.message)
       if (progress.warning) setMessage(`Partial import: ${progress.warning}`)
      },
     })
     if (requiresVisibleImportFailure(imported.failedSources, imported.importedGamesCount)) {
      setImportSummary(
       `No new games were added. ${formatSourceSummary(imported.retainedSourceCounts)} retained (${imported.retainedGamesCount} total). Already present: ${imported.alreadyPresent}.`,
      )
      throw new Error(imported.warnings.join(" "))
     }

     if (imported.importedGamesCount === 0) {
      setImportedGamesCount(imported.retainedGamesCount)
      setNeedsConnectedImport(false)
      setImportSummary(
       `No new games were added. ${formatSourceSummary(imported.retainedSourceCounts)} retained (${imported.retainedGamesCount} total). Already present: ${imported.alreadyPresent}. Cross-source duplicates removed: ${imported.crossSourceDuplicatesRemoved}. Excluded by the 150-game cap: ${imported.capExcluded}.`,
      )
      setImportProgress("")
      return
     }

     setImportProgress(`Imported ${imported.importedGamesCount} new games. Preparing analysis...`)

     const analysis = await analyzeImportedGamesWithStockfish(user.id, {
       maxGames: 150,
       depth: 8,
      minLossCp: 70,
      onProgress: (progress) => {
        setImportProgress(formatAnalysisProgress(progress))
      },
     })

     if (!hasHonestAnalysisCompletion(imported.importedGamesCount, analysis)) {
      throw new Error(
       `No imported games were successfully analyzed. ${analysis.gamesSkipped} were skipped and ${analysis.gamesFailed} failed. Please refresh connected games to try again.`,
      )
     }

     const autoProfile = await getOrCreateAutoProfile(user.id)
     if (!autoProfile) {
       throw new Error(
         "Connected games were processed, but your updated training profile could not be loaded.",
       )
     }

     setImportedGamesCount(
       Math.max(0, Number(autoProfile.imported_games_count) || 0),
     )
     setNeedsConnectedImport(false)
     setImportSummary(
       `New games: ${formatSourceSummary(imported.sourceCounts)}. ${formatSourceSummary(imported.retainedSourceCounts)} retained (${imported.retainedGamesCount} total). Already present: ${imported.alreadyPresent}. Cross-source duplicates removed: ${imported.crossSourceDuplicatesRemoved}. Excluded by the 150-game cap: ${imported.capExcluded}. Analyzed: ${analysis.gamesAnalyzed}. Skipped: ${analysis.gamesSkipped}. Failed: ${analysis.gamesFailed}. Training mistakes found: ${analysis.mistakesFound}. Total analysis time: ${formatDuration(analysis.elapsedMs)}.${imported.warnings.length ? ` Partial import warning: ${imported.warnings.join(" ")}` : ""}`,
     )
     setImportProgress("")
   } catch (importError) {
     console.error("Connected-account import from Account failed", importError)
     if (importError instanceof ConnectedImportFailure) {
      setImportedGamesCount(importError.retainedGamesCount)
      setImportSummary(
       `Import did not add games. ${formatSourceSummary(importError.retainedSourceCounts)} retained (${importError.retainedGamesCount} total).`,
      )
     }
     setError(
       importError instanceof Error
         ? importError.message
         : "Could not import and analyze connected games.",
     )
   } finally {
     setImportingGames(false)
   }
 }

 const hasUnsavedConnectedAccounts = hasUnsavedConnectedAccountChanges(
  chessCom,
  lichess,
  savedChessComUsername,
  savedLichessUsername,
 )
 const hasCurrentUsername = Boolean(normalizedUsername(chessCom) || normalizedUsername(lichess))
 const hasSavedConnectedAccount = Boolean(savedChessComUsername || savedLichessUsername)
 const connectedAccountActionLabel = hasUnsavedConnectedAccounts
  ? hasCurrentUsername ? "Save and Import Games" : "Save Changes"
  : hasSavedConnectedAccount ? "Refresh Connected Games" : "Save Changes"

 async function cancelRenewal() {
   if (
     !window.confirm(
       "Cancel future PayPal renewals? Premium access will continue until the end of the paid period.",
     )
   ) {
     return
   }

   setCancelling(true)
   setMembershipMessage("")
   setMembershipActionError("")

   try {
     const session = await supabase.auth.getSession()
     const accessToken = session.data.session?.access_token

     if (session.error || !accessToken) {
       throw new Error("Please log in again before cancelling.")
     }

     const response = await fetch(
       "/api/cancel-paypal-subscription",
       {
         method: "POST",
         headers: {
           Authorization: `Bearer ${accessToken}`,
           "Content-Type": "application/json",
         },
         body: JSON.stringify({}),
       },
     )

     const data = await response.json().catch(() => null)

     if (!response.ok) {
       throw new Error(
         data?.error || "Could not cancel PayPal renewal.",
       )
     }

     await refreshSubscription()
     setMembershipMessage(
       "Renewal has been cancelled. You keep Premium until the paid period ends.",
     )
   } catch (actionError) {
     setMembershipActionError(
       actionError instanceof Error
         ? actionError.message
         : "Could not cancel PayPal renewal.",
     )
   } finally {
     setCancelling(false)
   }
 }

 return (
 <div className="account-page" style={pageStyle}>
 <div style={glowStyle} />

 <div className="account-page__shell" style={shellStyle}>
 <div style={headerCardStyle}>
 <div style={eyebrowStyle}>Profile</div>
 <h1 style={titleStyle}>Account Settings</h1>
 <div style={subtitleStyle}>
 Update your chess usernames, appearance and membership.
 </div>
 </div>

 <ThemeSelector />

  <div className="account-page__content-grid" style={contentGridStyle}>
   <div className="account-page__main-card account-page__connected-card" style={mainCardStyle}>
 <div style={sectionTitleStyle}>Connected chess accounts</div>

 <div style={fieldBlockStyle}>
 <label style={labelStyle}>Email</label>
 <input value={email} disabled style={disabledInputStyle} />
 <div style={helperStyle}>Your login email cannot be edited here.</div>
 </div>

 <div style={fieldBlockStyle}>
 <label style={labelStyle}>Chess.com username</label>
 <input
 value={chessCom}
 onChange={(e) => setChessCom(e.target.value)}
 placeholder="Enter your Chess.com username"
 style={inputStyle}
 />
 </div>

 <div style={fieldBlockStyle}>
 <label style={labelStyle}>Lichess username</label>
 <input
 value={lichess}
 onChange={(e) => setLichess(e.target.value)}
 placeholder="Enter your Lichess username"
 style={inputStyle}
 />
 </div>

 <div className="account-page__actions" style={actionsRowStyle}>
 <button
  onClick={() => {
   if (hasUnsavedConnectedAccounts || !hasSavedConnectedAccount) void save()
   else void importConnectedGames(savedChessComUsername, savedLichessUsername)
  }}
  disabled={saving || importingGames}
  style={saveButtonStyle}
 >
  {saving ? "Saving..." : importingGames ? "Importing connected games..." : connectedAccountActionLabel}
 </button>
 </div>
 {hasUnsavedConnectedAccounts && (
  <div style={helperStyle}>
   {hasCurrentUsername
    ? "Saving will update your connected accounts and import their recent games."
    : "Saving will update your connected accounts."}
  </div>
 )}

 {message && <div style={successStyle}>{message}</div>}
 {importProgress && <div style={progressStyle}>{importProgress}</div>}
 {importSummary && <div style={successStyle}>{importSummary}</div>}
  {error && <div style={errorStyle}>{error}</div>}
  </div>

   <div className="account-page__main-card account-page__training-card" style={mainCardStyle}>
   <div style={sectionTitleStyle}>Training goals</div>
   <div style={{ ...helperStyle, margin: "-10px 0 18px" }}>
    Your imported-game analysis provides the normalized training rating when it is available. These changes do not reconnect or re-import accounts.
   </div>
   <TrainingGoalsFields
    goals={trainingGoals}
    onChange={setTrainingGoals}
    automaticCurrentRating={automaticCurrentRating}
    inputStyle={inputStyle}
    labelStyle={labelStyle}
    helperStyle={helperStyle}
    accentColor="#81b64c"
    compact
   />
   <div style={actionsRowStyle}>
    <button onClick={() => void saveTrainingGoals()} disabled={savingTrainingGoals} style={saveButtonStyle}>
     {savingTrainingGoals ? "Saving training goals..." : "Save Training Goals"}
    </button>
   </div>
   {trainingGoalsMessage && <div style={successStyle}>{trainingGoalsMessage}</div>}
   {trainingGoalsError && <div style={errorStyle}>{trainingGoalsError}</div>}
   </div>

  <div className="account-page__side-card account-page__side-card--compact" style={sideCardStyle}>
 <div style={membershipBoxStyle}>
 <div style={membershipEyebrowStyle}>Membership</div>

 <div style={membershipPlanStyle}>
 {subscriptionLoading ? "Loading..." : planLabel}
 </div>

 <div style={membershipTextStyle}>
 {membershipDescription}
 </div>

 {subscription?.provider === "paypal" && (
 <div style={membershipDetailStyle}>
 Payment provider: PayPal
 </div>
 )}

 {!subscriptionLoading && !isPremium && (
 <button
 style={membershipPrimaryButtonStyle}
 onClick={() => navigate("/pricing")}
 >
 View Premium plans
 </button>
 )}

 {subscription?.provider === "paypal" &&
 isPremium &&
 !subscription.cancel_at_period_end && (
 <button
 style={cancelButtonStyle}
 onClick={cancelRenewal}
 disabled={cancelling}
 >
 {cancelling ? "Cancelling..." : "Cancel renewal"}
 </button>
 )}

 {membershipMessage && (
 <div style={membershipSuccessStyle}>{membershipMessage}</div>
 )}

 {(subscriptionError || membershipActionError) && (
 <div style={membershipErrorStyle}>
 {membershipActionError || subscriptionError}
 </div>
 )}
 </div>

 <div style={sideTitleStyle}>Why add your Chess.com username?</div>

 <div style={tipBoxStyle}>
 The system will automatically analyze your recent games and build a personalized training plan based on your mistakes, weaknesses, openings, tactics, and endgames.
 </div>

 <ul style={listStyle}>
 <li>Automatic game analysis</li>
 <li>Personalized training priorities</li>
 <li>Your most common mistakes identified</li>
 <li>Training matched to your current level</li>
 <li>Better recommendations over time</li>
 </ul>
 </div>
 </div>
 </div>
 </div>
 )
}

const pageStyle: React.CSSProperties = {
 minHeight: "100vh",
 background: "var(--theme-page-bg)",
 padding: "20px 24px calc(var(--site-fixed-bottom-clearance) + 18px)",
 fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
 position: "relative",
 overflow: "hidden",
}

const glowStyle: React.CSSProperties = {
 position: "absolute",
 top: -120,
 left: "50%",
 transform: "translateX(-50%)",
 width: 520,
 height: 520,
 borderRadius: "50%",
 background: "radial-gradient(circle, color-mix(in srgb, var(--theme-accent) 20%, transparent) 0%, transparent 70%)",
 pointerEvents: "none",
}

const shellStyle: React.CSSProperties = {
 position: "relative",
 zIndex: 1,
 maxWidth: 1580,
 margin: "0 auto",
 display: "grid",
 gap: 12,
}

const headerCardStyle: React.CSSProperties = {
 background: "var(--theme-panel)",
 border: "1px solid var(--theme-border)",
 borderRadius: 24,
 padding: "18px 22px",
 boxShadow: "var(--theme-shadow)",
}

const eyebrowStyle: React.CSSProperties = {
 color: "var(--theme-accent-strong)",
 fontSize: 12,
 fontWeight: 800,
 letterSpacing: 1.2,
 textTransform: "uppercase",
 marginBottom: 10,
}

const titleStyle: React.CSSProperties = {
 color: "var(--theme-text)",
 fontSize: 30,
 lineHeight: 1.1,
 margin: 0,
 fontWeight: 800,
}

const subtitleStyle: React.CSSProperties = {
 color: "var(--theme-muted)",
 fontSize: 15,
 lineHeight: 1.6,
 marginTop: 6,
 maxWidth: 700,
}

const contentGridStyle: React.CSSProperties = {
 display: "grid",
 gridTemplateColumns: "minmax(240px, 0.95fr) minmax(360px, 1.18fr) minmax(250px, 0.78fr)",
 gap: 12,
}

const mainCardStyle: React.CSSProperties = {
 background: "var(--theme-panel)",
 border: "1px solid var(--theme-border)",
 borderRadius: 24,
 padding: 20,
 boxShadow: "var(--theme-shadow)",
}

const sideCardStyle: React.CSSProperties = {
 background: "var(--theme-panel)",
 border: "1px solid var(--theme-border)",
 borderRadius: 24,
 padding: 20,
 boxShadow: "var(--theme-shadow)",
 color: "var(--theme-text)",
 alignSelf: "start",
}

const sectionTitleStyle: React.CSSProperties = {
 color: "var(--theme-text)",
 fontSize: 22,
 fontWeight: 800,
 marginBottom: 14,
}

const fieldBlockStyle: React.CSSProperties = {
 display: "grid",
 gap: 8,
 marginBottom: 14,
}

const labelStyle: React.CSSProperties = {
 color: "var(--theme-text)",
 fontSize: 13,
 fontWeight: 700,
}

const inputStyle: React.CSSProperties = {
 padding: "11px 13px",
 borderRadius: 12,
 border: "1px solid var(--theme-border)",
 background: "var(--theme-panel-input)",
 color: "var(--theme-text)",
 fontSize: 15,
 outline: "none",
}

const disabledInputStyle: React.CSSProperties = {
 ...inputStyle,
 opacity: 0.75,
 cursor: "not-allowed",
}

const helperStyle: React.CSSProperties = {
 color: "var(--theme-muted)",
 fontSize: 12,
 lineHeight: 1.5,
}

const actionsRowStyle: React.CSSProperties = {
 display: "flex",
 alignItems: "center",
 gap: 12,
 marginTop: 8,
}

const saveButtonStyle: React.CSSProperties = {
 border: "none",
 borderRadius: 12,
 padding: "13px 18px",
 background: "var(--theme-accent)",
 color: "var(--theme-text)",
 fontWeight: 800,
 fontSize: 14,
 cursor: "pointer",
 boxShadow: "0 12px 25px rgba(0,0,0,0.25)",
}

const importButtonStyle: React.CSSProperties = {
 border: "1px solid var(--theme-border)",
 borderRadius: 12,
 padding: "13px 18px",
 background: "var(--theme-button-bg)",
 color: "var(--theme-text)",
 fontWeight: 800,
 fontSize: 14,
 cursor: "pointer",
}

const successStyle: React.CSSProperties = {
 marginTop: 16,
 padding: "12px 14px",
 borderRadius: 12,
 background: "rgba(129,182,76,0.15)",
 border: "1px solid rgba(129,182,76,0.35)",
 color: "#d7efb8",
 fontSize: 13,
 fontWeight: 700,
}

const errorStyle: React.CSSProperties = {
 marginTop: 16,
 padding: "12px 14px",
 borderRadius: 12,
 background: "rgba(255,107,107,0.12)",
 border: "1px solid rgba(255,107,107,0.3)",
 color: "#ff9d9d",
 fontSize: 13,
 fontWeight: 700,
}

const progressStyle: React.CSSProperties = {
 marginTop: 16,
 padding: "12px 14px",
 borderRadius: 12,
 background: "rgba(111,91,214,0.14)",
 border: "1px solid rgba(111,91,214,0.38)",
 color: "#ddd6ff",
 fontSize: 13,
 fontWeight: 700,
}

const sideTitleStyle: React.CSSProperties = {
 fontSize: 20,
 fontWeight: 800,
 marginBottom: 14,
}

const listStyle: React.CSSProperties = {
 margin: 0,
 paddingLeft: 18,
 color: "var(--theme-text)",
 fontSize: 14,
 lineHeight: 1.7,
}

const tipBoxStyle: React.CSSProperties = {
 marginTop: 18,
 borderRadius: 16,
 padding: "14px 16px",
 background: "var(--theme-panel-input)",
 border: "1px solid var(--theme-border)",
 color: "var(--theme-muted)",
 fontSize: 13,
 lineHeight: 1.6,
}
const membershipBoxStyle: React.CSSProperties = {
 marginBottom: 24,
 padding: "18px",
 borderRadius: 18,
 background: "linear-gradient(135deg, rgba(129,182,76,0.18), rgba(129,182,76,0.06))",
 border: "1px solid rgba(129,182,76,0.35)",
}

const membershipEyebrowStyle: React.CSSProperties = {
 color: "#b9dd91",
 fontSize: 11,
 fontWeight: 800,
 letterSpacing: 1.1,
 textTransform: "uppercase",
 marginBottom: 8,
}

const membershipPlanStyle: React.CSSProperties = {
 color: "#ffffff",
 fontSize: 26,
 fontWeight: 800,
 marginBottom: 8,
}

const membershipTextStyle: React.CSSProperties = {
 color: "var(--theme-muted)",
 fontSize: 13,
 lineHeight: 1.55,
}

const membershipDetailStyle: React.CSSProperties = {
 color: "var(--theme-muted)",
 fontSize: 12,
 marginTop: 10,
}

const membershipErrorStyle: React.CSSProperties = {
 color: "#ff9d9d",
 fontSize: 12,
 marginTop: 10,
}

const membershipPrimaryButtonStyle: React.CSSProperties = {
 width: "100%",
 marginTop: 14,
 border: "none",
 borderRadius: 11,
 padding: "11px 13px",
 background: "var(--theme-accent)",
 color: "#fff",
 fontWeight: 800,
 cursor: "pointer",
}

const cancelButtonStyle: React.CSSProperties = {
 width: "100%",
 marginTop: 14,
 borderRadius: 11,
 padding: "11px 13px",
 background: "rgba(255,255,255,0.05)",
 border: "1px solid rgba(255,170,120,0.35)",
 color: "#ffd2b7",
 fontWeight: 800,
 cursor: "pointer",
}

const membershipSuccessStyle: React.CSSProperties = {
 marginTop: 12,
 padding: "10px 11px",
 borderRadius: 10,
 background: "rgba(129,182,76,0.13)",
 border: "1px solid rgba(129,182,76,0.3)",
 color: "#d7efb8",
 fontSize: 12,
 lineHeight: 1.45,
}
