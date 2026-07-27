import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "./lib/supabase"
import { useSubscription } from "./context/SubscriptionContext"
import ThemeSelector from "./theme/ThemeSelector"
import { runChessComImport } from "./training/chesscomImport"
import { analyzeImportedGamesWithStockfish } from "./training/engineAnalyzeImportedGames"
import { getOrCreateAutoProfile } from "./training/getOrCreateAutoProfile"

function formatDate(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString()
}

export default function AccountPage() {
 const navigate = useNavigate()
 const [email, setEmail] = useState("")
 const [chessCom, setChessCom] = useState("")
 const [savedChessComUsername, setSavedChessComUsername] = useState("")
 const [importedGamesCount, setImportedGamesCount] = useState(0)
 const [needsChessComImport, setNeedsChessComImport] = useState(false)
 const [lichess, setLichess] = useState("")
 const [message, setMessage] = useState("")
 const [error, setError] = useState("")
 const [saving, setSaving] = useState(false)
 const [importingGames, setImportingGames] = useState(false)
 const [importProgress, setImportProgress] = useState("")
 const [importSummary, setImportSummary] = useState("")
 const [cancelling, setCancelling] = useState(false)
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
     const meta = user?.user_metadata
     const savedUsername = String(
       meta?.chess_com_username || meta?.chessComUsername || "",
     ).trim()

     setEmail(user?.email || "")
     setChessCom(savedUsername)
     setSavedChessComUsername(savedUsername)
     setLichess(meta?.lichess_username || "")

     if (user) {
       const autoProfile = await getOrCreateAutoProfile(user.id)
       const importedCount = Math.max(
         0,
         Number(autoProfile?.imported_games_count) || 0,
       )
       const importedUsername = String(
         autoProfile?.chesscom_username || "",
       ).trim()

       setImportedGamesCount(importedCount)
       setNeedsChessComImport(
         Boolean(savedUsername) &&
           (importedCount === 0 || importedUsername !== savedUsername),
       )
     }
   }

   void load()
 }, [])

 async function save() {
   setSaving(true)
   setMessage("")
   setError("")

   const { error } = await supabase.auth.updateUser({
     data: {
       chess_com_username: chessCom.trim(),
       lichess_username: lichess.trim(),
     },
   })

   setSaving(false)

   if (error) {
     setError(error.message)
     return
   }

   const savedUsername = chessCom.trim()
   const usernameChanged = savedUsername !== savedChessComUsername

   setSavedChessComUsername(savedUsername)
   setNeedsChessComImport(
     Boolean(savedUsername) &&
       (usernameChanged || importedGamesCount === 0),
   )
   setImportSummary("")
   setImportProgress("")
   setMessage(
     usernameChanged && savedUsername
       ? "Saved successfully. Import Chess.com games when you are ready."
       : "Saved successfully",
   )
 }

 async function importChessComGames() {
   const username = savedChessComUsername.trim()

   if (!username) {
     setError("Save a Chess.com username before importing games.")
     return
   }

   setImportingGames(true)
   setError("")
   setImportSummary("")
   setImportProgress("Fetching and importing Chess.com games...")

   try {
     const { data, error: sessionError } = await supabase.auth.getUser()
     const user = data.user

     if (sessionError || !user) {
       throw new Error("Please log in again before importing games.")
     }

     const imported = await runChessComImport(username, user.id)
     setImportProgress(
       `Imported ${imported.importedGamesCount} games. Starting Stockfish analysis...`,
     )

     const analysis = await analyzeImportedGamesWithStockfish(user.id, {
       maxGames: 150,
       depth: 8,
       minLossCp: 70,
       onProgress: (progress) => {
         setImportProgress(progress.message)
       },
     })

     const autoProfile = await getOrCreateAutoProfile(user.id)
     if (!autoProfile) {
       throw new Error(
         "Chess.com games were processed, but your updated training profile could not be loaded.",
       )
     }

     setImportedGamesCount(
       Math.max(0, Number(autoProfile.imported_games_count) || 0),
     )
     setNeedsChessComImport(false)
     setImportSummary(
       `Imported ${imported.importedGamesCount} games. Analyzed ${analysis.gamesAnalyzed} games and found ${analysis.mistakesFound} training mistakes.`,
     )
     setImportProgress("")
   } catch (importError) {
     console.error("Chess.com import from Account failed", importError)
     setError(
       importError instanceof Error
         ? importError.message
         : "Could not import and analyze Chess.com games.",
     )
   } finally {
     setImportingGames(false)
   }
 }

 const chessComActionLabel =
   !needsChessComImport && importedGamesCount > 0
     ? "Refresh Chess.com games"
     : "Import Chess.com games"

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
 <div style={pageStyle}>
 <div style={glowStyle} />

 <div style={shellStyle}>
 <div style={headerCardStyle}>
 <div style={eyebrowStyle}>Profile</div>
 <h1 style={titleStyle}>Account Settings</h1>
 <div style={subtitleStyle}>
 Update your chess usernames, appearance and membership.
 </div>
 </div>

 <ThemeSelector />

 <div style={contentGridStyle}>
 <div style={mainCardStyle}>
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

 <div style={actionsRowStyle}>
 <button onClick={save} disabled={saving} style={saveButtonStyle}>
 {saving ? "Saving..." : "Save changes"}
 </button>
 {savedChessComUsername && (
  <button
   onClick={importChessComGames}
   disabled={importingGames}
   style={importButtonStyle}
  >
   {importingGames ? "Importing Chess.com games..." : chessComActionLabel}
  </button>
 )}
 </div>

 {message && <div style={successStyle}>{message}</div>}
 {importProgress && <div style={progressStyle}>{importProgress}</div>}
 {importSummary && <div style={successStyle}>{importSummary}</div>}
 {error && <div style={errorStyle}>{error}</div>}
 </div>

 <div style={sideCardStyle}>
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

 <div style={sideTitleStyle}>Why add usernames?</div>

 <ul style={listStyle}>
 <li>Start from a more accurate level</li>
 <li>Spot weak areas faster</li>
 <li>Adjust endgame priorities</li>
 <li>Build better future recommendations</li>
 </ul>

 <div style={tipBoxStyle}>
 You can leave fields empty now and update them later anytime.
 </div>
 </div>
 </div>
 </div>
 </div>
 )
}

const pageStyle: React.CSSProperties = {
 minHeight: "100vh",
 background: "var(--theme-page-bg)",
 padding: "48px 20px 80px",
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
 maxWidth: 1060,
 margin: "0 auto",
 display: "grid",
 gap: 18,
}

const headerCardStyle: React.CSSProperties = {
 background: "var(--theme-panel)",
 border: "1px solid var(--theme-border)",
 borderRadius: 24,
 padding: "28px 28px 24px",
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
 fontSize: 34,
 lineHeight: 1.1,
 margin: 0,
 fontWeight: 800,
}

const subtitleStyle: React.CSSProperties = {
 color: "var(--theme-muted)",
 fontSize: 15,
 lineHeight: 1.6,
 marginTop: 10,
 maxWidth: 700,
}

const contentGridStyle: React.CSSProperties = {
 display: "grid",
 gridTemplateColumns: "minmax(0, 1.4fr) minmax(280px, 0.8fr)",
 gap: 18,
}

const mainCardStyle: React.CSSProperties = {
 background: "var(--theme-panel)",
 border: "1px solid var(--theme-border)",
 borderRadius: 24,
 padding: 28,
 boxShadow: "var(--theme-shadow)",
}

const sideCardStyle: React.CSSProperties = {
 background: "var(--theme-panel)",
 border: "1px solid var(--theme-border)",
 borderRadius: 24,
 padding: 28,
 boxShadow: "var(--theme-shadow)",
 color: "var(--theme-text)",
 alignSelf: "start",
}

const sectionTitleStyle: React.CSSProperties = {
 color: "var(--theme-text)",
 fontSize: 22,
 fontWeight: 800,
 marginBottom: 20,
}

const fieldBlockStyle: React.CSSProperties = {
 display: "grid",
 gap: 8,
 marginBottom: 18,
}

const labelStyle: React.CSSProperties = {
 color: "var(--theme-text)",
 fontSize: 13,
 fontWeight: 700,
}

const inputStyle: React.CSSProperties = {
 padding: "14px 16px",
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
 marginTop: 10,
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
