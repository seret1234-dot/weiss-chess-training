import { useEffect, useRef, useState } from "react"
import type { CSSProperties } from "react"
import {
 assessGoalFeasibility,
 goalFeasibilityMessage,
 goalStatusLabel,
 type TrainingGoals,
} from "../training/trainingGoals"

const practiceChoices = [10, 20, 30, 45, 60]
const timeframeChoices = [
 { label: "1 month", months: 1 },
 { label: "2 months", months: 2 },
 { label: "3 months", months: 3 },
 { label: "6 months", months: 6 },
 { label: "12 months", months: 12 },
 { label: "Long-term / no deadline", months: null },
]

type Props = {
 goals: TrainingGoals
 onChange: (goals: TrainingGoals) => void
 automaticCurrentRating?: number | null
 inputStyle: CSSProperties
 labelStyle: CSSProperties
 helperStyle: CSSProperties
 accentColor?: string
 compact?: boolean
 disabled?: boolean
}

function numericOrNull(value: string) {
 const parsed = Number.parseInt(value, 10)
 return Number.isFinite(parsed) ? parsed : null
}

function customDailyMinutesOrInvalid(value: string) {
 if (!/^\d+$/.test(value)) return 0
 const parsed = Number(value)
 return Number.isSafeInteger(parsed) ? parsed : 0
}

export default function TrainingGoalsFields({
 goals,
 onChange,
 automaticCurrentRating = null,
 inputStyle,
 labelStyle,
 helperStyle,
 accentColor = "#81b64c",
 compact = false,
 disabled = false,
}: Props) {
 const [customMinutesText, setCustomMinutesText] = useState(() =>
  practiceChoices.includes(goals.dailyMinutes) ? "" : String(goals.dailyMinutes),
 )
 const customInputChangedRef = useRef(false)

 useEffect(() => {
  if (!customInputChangedRef.current) {
   setCustomMinutesText(
    practiceChoices.includes(goals.dailyMinutes) ? "" : String(goals.dailyMinutes),
   )
  }
  customInputChangedRef.current = false
 }, [goals.dailyMinutes])

 const current = automaticCurrentRating ?? goals.manualCurrentRating
 const customMinutesValue = customDailyMinutesOrInvalid(customMinutesText)
 const customMinutesInvalid = customMinutesText !== "" && (
  customMinutesValue < 1 || customMinutesValue > 600
 )
 const feasibility = current && goals.targetRating
  ? assessGoalFeasibility({
    currentRating: current,
    targetRating: goals.targetRating,
    dailyMinutes: goals.dailyMinutes,
    timeframeMonths: goals.timeframeMonths,
   })
  : null

 return (
  <div className={`training-goals-fields${compact ? " training-goals-fields--compact" : ""}`} style={{ display: "grid", gap: compact ? 11 : 16 }}>
   <div className="training-goals-fields__rating-field">
    <label style={labelStyle} htmlFor="training-current-rating">Current rating (optional)</label>
    <input
     id="training-current-rating"
     style={{ ...inputStyle, marginTop: 8 }}
     value={goals.manualCurrentRating ?? ""}
     onChange={(event) => onChange({ ...goals, manualCurrentRating: numericOrNull(event.target.value) })}
     placeholder={automaticCurrentRating ? `Detected training rating: ${automaticCurrentRating}` : "Optional if we cannot detect it"}
     inputMode="numeric"
     disabled={disabled}
    />
    <div style={{ ...helperStyle, marginTop: 6 }}>
     {automaticCurrentRating
      ? `Your normalized training rating (${automaticCurrentRating}) is used for planning; this is only a fallback.`
      : "Your current training rating will be estimated from your imported games. Add a manual fallback only if no imported rating is available."}
    </div>
   </div>

   <div className="training-goals-fields__rating-field">
    <label style={labelStyle} htmlFor="training-target-rating">What rating would you like to reach?</label>
    <input
     id="training-target-rating"
     style={{ ...inputStyle, marginTop: 8 }}
     value={goals.targetRating ?? ""}
     onChange={(event) => onChange({ ...goals, targetRating: numericOrNull(event.target.value) })}
     placeholder="Example: 1500"
     inputMode="numeric"
     disabled={disabled}
    />
   </div>

   <div className="training-goals-fields__practice-block">
    <div style={labelStyle}>How much time can you practice each day?</div>
     <div className="training-goals-fields__practice-options" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
     {practiceChoices.map((minutes) => (
      <button
       key={minutes}
       type="button"
       onClick={() => {
        customInputChangedRef.current = true
        setCustomMinutesText("")
        onChange({ ...goals, dailyMinutes: minutes })
       }}
       aria-pressed={goals.dailyMinutes === minutes}
       disabled={disabled}
       style={{
        border: `1px solid ${goals.dailyMinutes === minutes ? accentColor : "rgba(255,255,255,0.18)"}`,
        background: goals.dailyMinutes === minutes ? `${accentColor}33` : "rgba(255,255,255,0.04)",
        color: "inherit",
        borderRadius: 10,
        padding: "9px 12px",
        fontWeight: 800,
        cursor: "pointer",
       }}
      >
       {minutes} minutes
      </button>
     ))}
     <div className="training-goals-fields__custom-minutes" style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 38 }}>
      <input
       aria-label="Custom daily practice minutes"
       type="number"
       min={1}
       max={600}
       step={1}
       value={customMinutesText}
       aria-invalid={customMinutesInvalid}
       onChange={(event) => {
        const nextValue = event.target.value
        customInputChangedRef.current = true
        setCustomMinutesText(nextValue)
        onChange({ ...goals, dailyMinutes: nextValue === "" ? 0 : customDailyMinutesOrInvalid(nextValue) })
       }}
       disabled={disabled}
       placeholder="Custom"
       style={{
        ...inputStyle,
        width: 82,
        minWidth: 82,
        padding: "8px 9px",
        fontSize: 14,
        opacity: disabled ? 0.7 : 1,
        borderColor: customMinutesInvalid ? "#ffb3b3" : inputStyle.border,
       }}
      />
      <span style={{ fontSize: 13, fontWeight: 800, color: "inherit" }}>min</span>
     </div>
     {customMinutesInvalid && (
      <div style={{ flexBasis: "100%", color: "#ffb3b3", fontSize: 12, lineHeight: 1.35 }}>
       Enter a whole number from 1 to 600 minutes.
      </div>
     )}
    </div>
   </div>

   <div className="training-goals-fields__timeframe-block">
    <div style={labelStyle}>When would you like to reach this goal?</div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
     {timeframeChoices.map((choice) => (
      <button
       key={choice.label}
       type="button"
       onClick={() => onChange({ ...goals, timeframeMonths: choice.months })}
       aria-pressed={goals.timeframeMonths === choice.months}
       disabled={disabled}
       style={{
        border: `1px solid ${goals.timeframeMonths === choice.months ? accentColor : "rgba(255,255,255,0.18)"}`,
        background: goals.timeframeMonths === choice.months ? `${accentColor}33` : "rgba(255,255,255,0.04)",
        color: "inherit",
        borderRadius: 10,
        padding: "9px 12px",
        fontWeight: 800,
        cursor: "pointer",
       }}
      >
       {choice.label}
      </button>
     ))}
    </div>
   </div>

   {feasibility ? (
    <div className="training-goals-fields__feedback" style={{ border: `1px solid ${accentColor}66`, background: `${accentColor}1f`, borderRadius: 14, padding: compact ? "10px 12px" : "13px 14px", lineHeight: 1.45 }}>
     <strong>Goal status: {goalStatusLabel(feasibility.status)}</strong>
     <div style={{ marginTop: 5 }}>{goalFeasibilityMessage(feasibility)}</div>
     <div style={{ ...helperStyle, marginTop: 7 }}>
      {feasibility.effectiveDailyMinutes.toFixed(1)} effective practice minutes/day (65% planning capacity)
      {feasibility.daysAvailable ? ` ? ${feasibility.daysAvailable} days available` : ""}.
     </div>
     {feasibility.status === "UNREALISTIC" && feasibility.recommendedMilestone && (
      <div style={{ marginTop: 9 }}>
       Suggested next milestone: <strong>{feasibility.recommendedMilestone}</strong>
       <button
        type="button"
        onClick={() => onChange({ ...goals, currentMilestoneRating: feasibility.recommendedMilestone })}
        disabled={disabled}
        style={{ marginLeft: 10, border: "none", borderRadius: 8, background: accentColor, color: "#fff", padding: "6px 9px", fontWeight: 800, cursor: "pointer" }}
       >
        Use this milestone
       </button>
      </div>
     )}
     {feasibility.estimatedMonthsForTarget && (
      <div style={{ ...helperStyle, marginTop: 6 }}>
       At this practice pace, the heuristic estimates about {Math.ceil(feasibility.estimatedMonthsForTarget)} months for the original target.
      </div>
     )}
    </div>
   ) : (
    <div className="training-goals-fields__feedback" style={{ ...helperStyle, borderRadius: 12, padding: compact ? "9px 11px" : "11px 12px", background: "rgba(255,255,255,0.05)" }}>
     {goals.targetRating ? "We?ll check the goal after analyzing your recent games, or use the manual current rating above." : "Add a target rating to see a transparent feasibility check before saving."}
    </div>
   )}

   <div className="training-goals-fields__milestone-field">
    <label style={labelStyle} htmlFor="training-milestone-rating">Current training milestone (optional)</label>
    <input
     id="training-milestone-rating"
     style={{ ...inputStyle, marginTop: 8 }}
     value={goals.currentMilestoneRating ?? ""}
     onChange={(event) => onChange({ ...goals, currentMilestoneRating: numericOrNull(event.target.value) })}
     placeholder="A nearer step toward your long-term goal"
     inputMode="numeric"
     disabled={disabled}
    />
   </div>
  </div>
 )
}
