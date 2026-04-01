import { useMemo, useState } from "react"
import type { CSSProperties, FormEvent } from "react"

type AuthMode = "login" | "signup"

type FormState = {
  email: string
  password: string
  chessComUsername: string
  lichessUsername: string
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
  const [mode, setMode] = useState<AuthMode>("signup")

  const [form, setForm] = useState<FormState>({
    email: "",
    password: "",
    chessComUsername: "",
    lichessUsername: "",
  })

  const [status, setStatus] = useState("Ready for Supabase connection")

  const title = useMemo(
    () => (mode === "signup" ? "Create your account" : "Log in"),
    [mode]
  )

  function updateField<K extends keyof FormState>(
    key: K,
    value: FormState[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()

    if (!form.email || !form.password) {
      setStatus("Enter email and password")
      return
    }

    setStatus(
      mode === "signup"
        ? "Signup ready — connect Supabase next"
        : "Login ready — connect Supabase next"
    )
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#262421",
        color: "#fff",
        padding: "24px",
        fontFamily: "Arial",
      }}
    >
      <div
        style={{
          maxWidth: "1100px",
          margin: "0 auto",
          display: "grid",
          gridTemplateColumns: "520px 1fr",
          gap: "16px",
        }}
      >
        <div style={panelStyle()}>
          <h1 style={{ marginBottom: "16px" }}>{title}</h1>

          <div style={{ display: "flex", gap: "10px", marginBottom: "16px" }}>
            <button
              onClick={() => setMode("signup")}
              style={buttonStyle(mode === "signup" ? "#81b64c" : "#4b4847")}
            >
              Sign up
            </button>

            <button
              onClick={() => setMode("login")}
              style={buttonStyle(mode === "login" ? "#81b64c" : "#4b4847")}
            >
              Log in
            </button>
          </div>

          <form onSubmit={onSubmit}>
            <div style={{ marginBottom: "14px" }}>
              <label style={labelStyle()}>Email</label>
              <input
                style={inputStyle()}
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
              />
            </div>

            <div style={{ marginBottom: "14px" }}>
              <label style={labelStyle()}>Password</label>
              <input
                type="password"
                style={inputStyle()}
                value={form.password}
                onChange={(e) => updateField("password", e.target.value)}
              />
            </div>

            {mode === "signup" && (
              <>
                <div style={{ marginBottom: "14px" }}>
                  <label style={labelStyle()}>
                    Chess.com username (optional)
                  </label>
                  <input
                    style={inputStyle()}
                    value={form.chessComUsername}
                    onChange={(e) =>
                      updateField("chessComUsername", e.target.value)
                    }
                  />
                </div>

                <div style={{ marginBottom: "14px" }}>
                  <label style={labelStyle()}>
                    Lichess username (optional)
                  </label>
                  <input
                    style={inputStyle()}
                    value={form.lichessUsername}
                    onChange={(e) =>
                      updateField("lichessUsername", e.target.value)
                    }
                  />
                </div>
              </>
            )}

            <button
              type="submit"
              style={{
                ...buttonStyle("#81b64c"),
                width: "100%",
              }}
            >
              {mode === "signup" ? "Create account" : "Log in"}
            </button>
          </form>

          <div style={{ marginTop: "16px", color: "#cfcfcf" }}>
            {status}
          </div>
        </div>

        <div style={panelStyle("#262421")}>
          <h2>Personalized course</h2>

          <p>
            Connect your chess usernames to get:
          </p>

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