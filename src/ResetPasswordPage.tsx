import { useEffect, useState, type CSSProperties, type FormEvent } from "react"
import { supabase } from "./lib/supabase"

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [status, setStatus] = useState("Checking password-reset link...")
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true
    let sessionFound = false

    const queryParams = new URLSearchParams(window.location.search)
    const hashParams = new URLSearchParams(
      window.location.hash.replace(/^#/, "")
    )

    const authError =
      queryParams.get("error_description") ||
      hashParams.get("error_description")

    if (authError) {
      setStatus(authError.replace(/\+/g, " "))
      return
    }

    async function checkSession() {
      const { data } = await supabase.auth.getSession()

      if (!active) return

      if (data.session) {
        sessionFound = true
        setReady(true)
        setStatus("")
      }
    }

    checkSession()

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!active) return

        if (event === "PASSWORD_RECOVERY" || session) {
          sessionFound = true
          setReady(true)
          setStatus("")
        }
      }
    )

    const timeout = window.setTimeout(() => {
      if (active && !sessionFound) {
        setStatus("This password-reset link is invalid or has expired.")
      }
    }, 3000)

    return () => {
      active = false
      window.clearTimeout(timeout)
      listener.subscription.unsubscribe()
    }
  }, [])

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (password.length < 8) {
      setStatus("Use at least 8 characters.")
      return
    }

    if (password !== confirmPassword) {
      setStatus("The passwords do not match.")
      return
    }

    setLoading(true)
    setStatus("")

    try {
      const { error } = await supabase.auth.updateUser({ password })

      if (error) {
        setStatus(error.message)
        return
      }

      setStatus("Password updated successfully. Opening the site...")

      window.setTimeout(() => {
        window.location.assign("/")
      }, 1200)
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={eyebrowStyle}>Account security</div>
        <h1 style={titleStyle}>Choose a new password</h1>

        {ready && (
          <form onSubmit={updatePassword}>
            <label style={labelStyle}>New password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              style={inputStyle}
            />

            <label style={labelStyle}>Confirm new password</label>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              style={inputStyle}
            />

            <button type="submit" disabled={loading} style={buttonStyle}>
              {loading ? "Updating..." : "Update password"}
            </button>
          </form>
        )}

        {status && <div style={statusStyle}>{status}</div>}

        {!ready && (
          <a href="/auth" style={linkStyle}>
            Return to login
          </a>
        )}
      </div>
    </div>
  )
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: 24,
  background: "linear-gradient(180deg, #2b2623 0%, #231f1d 100%)",
  fontFamily: "Arial, sans-serif",
  color: "#fff",
}

const cardStyle: CSSProperties = {
  boxSizing: "border-box",
  width: "100%",
  maxWidth: 460,
  padding: 30,
  borderRadius: 22,
  background: "#1f1d1c",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 24px 60px rgba(0,0,0,0.4)",
}

const eyebrowStyle: CSSProperties = {
  color: "#81b64c",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 1.1,
  textTransform: "uppercase",
}

const titleStyle: CSSProperties = {
  margin: "10px 0 24px",
  fontSize: 30,
}

const labelStyle: CSSProperties = {
  display: "block",
  margin: "14px 0 7px",
  color: "#dddddd",
  fontSize: 13,
  fontWeight: 700,
}

const inputStyle: CSSProperties = {
  boxSizing: "border-box",
  width: "100%",
  padding: "13px 15px",
  borderRadius: 11,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "#2a2523",
  color: "#fff",
  fontSize: 15,
}

const buttonStyle: CSSProperties = {
  width: "100%",
  marginTop: 22,
  padding: "13px 16px",
  border: "none",
  borderRadius: 11,
  background: "#81b64c",
  color: "#fff",
  fontSize: 15,
  fontWeight: 800,
  cursor: "pointer",
}

const statusStyle: CSSProperties = {
  marginTop: 18,
  padding: "12px 14px",
  borderRadius: 11,
  background: "rgba(129,182,76,0.12)",
  color: "#d7efb8",
  lineHeight: 1.5,
}

const linkStyle: CSSProperties = {
  display: "inline-block",
  marginTop: 18,
  color: "#b9dd91",
  fontWeight: 700,
}


