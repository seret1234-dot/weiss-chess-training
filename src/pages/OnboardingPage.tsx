import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { supabase } from "../lib/supabase"

function inputStyle(): React.CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    background: "#262421",
    color: "#ffffff",
    border: "1px solid #4b4847",
    borderRadius: "12px",
    padding: "14px 16px",
    fontSize: "15px",
    outline: "none",
  }
}

function labelStyle(): React.CSSProperties {
  return {
    display: "block",
    fontSize: "14px",
    fontWeight: 700,
    marginBottom: "8px",
    color: "#f0ece8",
  }
}

function sectionCardStyle(): React.CSSProperties {
  return {
    background: "#1f1d1c",
    borderRadius: 24,
    padding: 30,
    border: "1px solid rgba(255,255,255,0.06)",
    boxShadow: "0 14px 34px rgba(0,0,0,0.2)",
  }
}

export default function OnboardingPage() {
  const navigate = useNavigate()

  const [targetRating, setTargetRating] = useState("")
  const [studyTimeValue, setStudyTimeValue] = useState("20")
  const [studyTimeUnit, setStudyTimeUnit] = useState<"minutes" | "hours">("minutes")
  const [chesscomUsername, setChesscomUsername] = useState("")
  const [lichessUsername, setLichessUsername] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function handleSave() {
    setSaving(true)
    setError("")

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError) throw userError
      if (!user) {
        navigate("/auth")
        return
      }

      const parsedTarget =
        targetRating.trim() === "" ? null : Number.parseInt(targetRating, 10)

      const parsedStudyTime = Number.parseInt(studyTimeValue, 10)

      if (parsedTarget !== null && Number.isNaN(parsedTarget)) {
        throw new Error("Target rating must be a number")
      }

      if (Number.isNaN(parsedStudyTime) || parsedStudyTime <= 0) {
        throw new Error("Choose how much time you want to study each day")
      }

      const parsedMinutes =
        studyTimeUnit === "hours" ? parsedStudyTime * 60 : parsedStudyTime

      // Save profile
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          target_rating: parsedTarget,
          minutes_per_day: parsedMinutes,
          chesscom_username: chesscomUsername.trim() || null,
          lichess_username: lichessUsername.trim() || null,
        })
        .eq("id", user.id)

      if (profileError) throw profileError

      const hasUsername =
        chesscomUsername.trim().length > 0 || lichessUsername.trim().length > 0

      // Save auto profile
      const { error: autoProfileError } = await supabase
        .from("user_auto_profile")
        .upsert({
          user_id: user.id,
          estimated_rating: parsedTarget,
          daily_minutes: parsedMinutes,
          chesscom_username: chesscomUsername.trim() || null,
          lichess_username: lichessUsername.trim() || null,
          rating_source: hasUsername ? "manual" : null,
          onboarding_step: 1,
          onboarding_complete: true,
        })

      if (autoProfileError) throw autoProfileError

      // Build study plan
      let maxActive = 3
      let pace = "moderate"

      if (parsedMinutes <= 10) {
        maxActive = 2
        pace = "slow"
      } else if (parsedMinutes >= 45 && parsedMinutes < 120) {
        maxActive = 4
        pace = "fast"
      } else if (parsedMinutes >= 120) {
        maxActive = 5
        pace = "fast"
      }

      let mates = 30
      let endgames = 25
      let boardVision = 20
      let openings = 15
      let masterGames = 10

      if (hasUsername) {
        openings = 20
        masterGames = 15
        mates = 25
      }

      const { error: planError } = await supabase
        .from("user_study_plan")
        .upsert({
          user_id: user.id,
          max_active_trainers: maxActive,
          new_content_pace: pace,
          mates_weight: mates,
          endgames_weight: endgames,
          board_vision_weight: boardVision,
          openings_weight: openings,
          master_games_weight: masterGames,
        })

      if (planError) throw planError

      // ✅ FIX: go to AUTO (not hardcoded trainer)
      window.location.replace("/auto")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save onboarding")
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
          maxWidth: 900,
          display: "grid",
          gridTemplateColumns: "1.15fr 0.85fr",
          gap: 20,
        }}
      >
        {/* LEFT */}
        <div style={sectionCardStyle()}>
          <h1>Set your study plan</h1>

          <div style={{ display: "grid", gap: 20 }}>
            <input
              style={inputStyle()}
              value={targetRating}
              onChange={(e) => setTargetRating(e.target.value)}
              placeholder="Target rating (optional)"
            />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 160px", gap: 10 }}>
              <input
                style={inputStyle()}
                value={studyTimeValue}
                onChange={(e) => setStudyTimeValue(e.target.value)}
              />
              <select
                style={inputStyle()}
                value={studyTimeUnit}
                onChange={(e) =>
                  setStudyTimeUnit(e.target.value as "minutes" | "hours")
                }
              >
                <option value="minutes">Minutes</option>
                <option value="hours">Hours</option>
              </select>
            </div>

            <input
              style={inputStyle()}
              value={chesscomUsername}
              onChange={(e) => setChesscomUsername(e.target.value)}
              placeholder="Chess.com username"
            />

            <input
              style={inputStyle()}
              value={lichessUsername}
              onChange={(e) => setLichessUsername(e.target.value)}
              placeholder="Lichess username"
            />
          </div>

          {error && <div style={{ marginTop: 20 }}>{error}</div>}

          <button onClick={handleSave} disabled={saving} style={{ marginTop: 20 }}>
            {saving ? "Saving..." : "Start training"}
          </button>
        </div>

        {/* RIGHT */}
        <div style={sectionCardStyle()}>
          <h2>What this affects</h2>
          <p>Study pacing, openings, and training mix.</p>
        </div>
      </div>
    </div>
  )
}