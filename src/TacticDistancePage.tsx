import { Link, useParams } from "react-router-dom"
import {
 tacticDistanceLabels,
 tacticThemeCatalog,
 type TacticDistanceId,
} from "./tacticThemeCatalog"

function isTacticDistanceId(value: string | undefined): value is TacticDistanceId {
 return value === "m1" || value === "m2" || value === "m3" || value === "m4"
}

function getThemeInitial(title: string) {
 const cleaned = title
 .replace(/\/.*/, "")
 .replace(/\+.*/, "")
 .trim()

 const words = cleaned.split(/\s+/).filter(Boolean)
 if (words.length >= 2) {
 return `${words[0][0]}${words[1][0]}`.toUpperCase()
 }

 return cleaned.slice(0, 2).toUpperCase()
}

function getIconBackground(index: number, isMixed: boolean) {
 if (isMixed) {
 return "linear-gradient(135deg, #f5c33b, #6aa84f)"
 }

 const accents = [
 "linear-gradient(135deg, #6aa84f, #8cc152)",
 "linear-gradient(135deg, #d1874f, #c65f48)",
 "linear-gradient(135deg, #4c89c9, #3f6fab)",
 "linear-gradient(135deg, #9b6bd3, #7447b8)",
 "linear-gradient(135deg, #f5c33b, #d59a2f)",
 "linear-gradient(135deg, #5e9ca0, #417f83)",
 ]

 return accents[index % accents.length]
}

export default function TacticDistancePage() {
 const params = useParams()
 const level = isTacticDistanceId(params.level) ? params.level : "m1"
 const title = tacticDistanceLabels[level]

 const themes = tacticThemeCatalog.filter((theme) =>
 theme.distances.includes(level)
 )

 const total = themes.reduce(
 (sum, theme) => sum + ((theme.countByDistance as Record<string, number>)[level] ?? 0),
 0
 )

 return (
 <main
 style={{
 minHeight: "100vh",
 padding: "34px 22px 90px",
 color: "#f4f4f0",
 background:
 "radial-gradient(circle at top center, rgba(94, 72, 42, 0.28), transparent 35%), linear-gradient(135deg, #1f1b19 0%, #221d1a 48%, #181514 100%)",
 }}
 >
 <section style={{ maxWidth: 1160, margin: "0 auto" }}>
 <div style={{ marginBottom: 16 }}>
 <Link
 to="/tactics"
 style={{
 color: "rgba(244,244,240,0.78)",
 textDecoration: "none",
 fontWeight: 800,
 }}
 >
 Back to Tactics
 </Link>
 </div>

 <div
 style={{
 borderRadius: 20,
 padding: "24px 26px",
 background:
 "linear-gradient(135deg, rgba(73, 66, 42, 0.92), rgba(56, 48, 34, 0.94))",
 border: "1px solid rgba(255,255,255,0.08)",
 boxShadow: "0 20px 55px rgba(0,0,0,0.30)",
 marginBottom: 18,
 }}
 >
 <div
 style={{
 color: "#f5c33b",
 fontWeight: 950,
 fontSize: 16,
 marginBottom: 9,
 letterSpacing: "0.05em",
 }}
 >
 {themes.length} TRAINERS / {total.toLocaleString()} PUZZLES
 </div>

 <h1
 style={{
 margin: 0,
 fontSize: "clamp(32px, 5vw, 50px)",
 lineHeight: 1.02,
 letterSpacing: "-0.045em",
 }}
 >
 {title}
 </h1>

 <p
 style={{
 maxWidth: 710,
 margin: "12px 0 0",
 color: "rgba(244,244,240,0.76)",
 lineHeight: 1.5,
 fontSize: 18,
 }}
 >
 Choose a tactical motif. Each trainer is capped to keep the pool focused
 and sorted from easier puzzles to harder puzzles.
 </p>
 </div>

 <div
 style={{
 display: "grid",
 gridTemplateColumns: "repeat(auto-fit, minmax(285px, 1fr))",
 gap: 14,
 }}
 >
 {themes.map((theme, index) => {
 const count = (theme.countByDistance as Record<string, number>)[level] ?? 0
 const isMixed = theme.key === "mixed"

 return (
 <Link
 key={theme.key}
 to={`/tactics/${level}/${theme.slug}`}
 style={{
 textDecoration: "none",
 color: "inherit",
 minHeight: 150,
 borderRadius: 18,
 padding: 22,
 border: isMixed
 ? "1px solid rgba(245,195,59,0.28)"
 : "1px solid rgba(255,255,255,0.07)",
 background: isMixed
 ? "linear-gradient(135deg, rgba(245,195,59,0.12), rgba(255,255,255,0.04))"
 : "rgba(255,255,255,0.035)",
 boxShadow: "0 14px 34px rgba(0,0,0,0.22)",
 }}
 >
 <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
 <div
 style={{
 width: 62,
 height: 62,
 flex: "0 0 auto",
 borderRadius: 18,
 display: "grid",
 placeItems: "center",
 background: getIconBackground(index, isMixed),
 color: "#201a13",
 fontWeight: 950,
 fontSize: 20,
 }}
 >
 {getThemeInitial(theme.title)}
 </div>

 <div style={{ minWidth: 0 }}>
 <div
 style={{
 fontSize: 23,
 fontWeight: 950,
 lineHeight: 1.18,
 letterSpacing: "-0.015em",
 }}
 >
 {theme.title}
 </div>

 <div
 style={{
 marginTop: 8,
 color: isMixed ? "#f5c33b" : "rgba(244,244,240,0.64)",
 fontSize: 16,
 fontWeight: 800,
 }}
 >
 {count.toLocaleString()} puzzles
 </div>
 </div>
 </div>
 </Link>
 )
 })}
 </div>
 </section>
 </main>
 )
}