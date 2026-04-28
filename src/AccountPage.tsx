import { useEffect, useState } from "react"
import { supabase } from "./lib/supabase"

export default function AccountPage() {
  const [email, setEmail] = useState("")
  const [chessCom, setChessCom] = useState("")
  const [lichess, setLichess] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.auth.getUser()

      if (error) {
        setError(error.message)
        return
      }

      const user = data.user
      const meta = user?.user_metadata

      setEmail(user?.email || "")
      setChessCom(meta?.chess_com_username || "")
      setLichess(meta?.lichess_username || "")
    }

    load()
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

    setMessage("Saved successfully")
  }

  return (
    <div style={pageStyle}>
      <div style={glowStyle} />

      <div style={shellStyle}>
        <div style={headerCardStyle}>
          <div style={eyebrowStyle}>Profile</div>
          <h1 style={titleStyle}>Account Settings</h1>
          <div style={subtitleStyle}>
            Update your chess usernames so your training can become more personal over time.
          </div>
        </div>

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
            </div>

            {message && <div style={successStyle}>{message}</div>}
            {error && <div style={errorStyle}>{error}</div>}
          </div>

          <div style={sideCardStyle}>
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
  background: "linear-gradient(180deg, #2b2623 0%, #231f1d 100%)",
  padding: "48px 20px 80px",
  fontFamily: "Arial, sans-serif",
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
  background: "radial-gradient(circle, rgba(129,182,76,0.18) 0%, rgba(129,182,76,0) 70%)",
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
  background: "rgba(31,29,28,0.92)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 24,
  padding: "28px 28px 24px",
  boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
}

const eyebrowStyle: React.CSSProperties = {
  color: "#81b64c",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  marginBottom: 10,
}

const titleStyle: React.CSSProperties = {
  color: "#f5f5f5",
  fontSize: 34,
  lineHeight: 1.1,
  margin: 0,
  fontWeight: 800,
}

const subtitleStyle: React.CSSProperties = {
  color: "#c9c9c9",
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
  background: "#1f1d1c",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 24,
  padding: 28,
  boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
}

const sideCardStyle: React.CSSProperties = {
  background: "#1f1d1c",
  border: "1px solid rgba(255,255,255,0.06)",
  borderRadius: 24,
  padding: 28,
  boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
  color: "#f3f3f3",
  alignSelf: "start",
}

const sectionTitleStyle: React.CSSProperties = {
  color: "#f3f3f3",
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
  color: "#dbdbdb",
  fontSize: 13,
  fontWeight: 700,
}

const inputStyle: React.CSSProperties = {
  padding: "14px 16px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "#2a2523",
  color: "#fff",
  fontSize: 15,
  outline: "none",
}

const disabledInputStyle: React.CSSProperties = {
  ...inputStyle,
  opacity: 0.75,
  cursor: "not-allowed",
}

const helperStyle: React.CSSProperties = {
  color: "#a7a7a7",
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
  background: "#81b64c",
  color: "#fff",
  fontWeight: 800,
  fontSize: 14,
  cursor: "pointer",
  boxShadow: "0 12px 25px rgba(0,0,0,0.25)",
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

const sideTitleStyle: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 800,
  marginBottom: 14,
}

const listStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: 18,
  color: "#e9e9e9",
  fontSize: 14,
  lineHeight: 1.7,
}

const tipBoxStyle: React.CSSProperties = {
  marginTop: 18,
  borderRadius: 16,
  padding: "14px 16px",
  background: "#2a2523",
  border: "1px solid rgba(255,255,255,0.06)",
  color: "#d7d7d7",
  fontSize: 13,
  lineHeight: 1.6,
}