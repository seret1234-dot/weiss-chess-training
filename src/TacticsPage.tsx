import { Link } from "react-router-dom"
import { tacticDistanceLabels } from "./tacticThemeCatalog"

const levels = [
 {
 id: "m1",
 icon: "1",
 subtitle: "One move tactics",
 description: "Fast tactical recognition and simple shots.",
 },
 {
 id: "m2",
 icon: "2",
 subtitle: "Two move tactics",
 description: "Find the forcing first move and follow-up.",
 },
 {
 id: "m3",
 icon: "3",
 subtitle: "Three move tactics",
 description: "Longer forcing lines with replies.",
 },
 {
 id: "m4",
 icon: "4+",
 subtitle: "Four moves and longer",
 description: "Deeper tactical calculation sequences.",
 },
] as const

export default function TacticsPage() {
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
 <section style={{ maxWidth: 1040, margin: "0 auto" }}>
 <div style={{ marginBottom: 20 }}>
 <div
 style={{
 fontSize: 21,
 fontWeight: 950,
 letterSpacing: "0.01em",
 marginBottom: 18,
 }}
 >
 Weiss Chess Trainer
 </div>

 <div
 style={{
 borderRadius: 20,
 padding: "26px 28px",
 background:
 "linear-gradient(135deg, rgba(73, 66, 42, 0.92), rgba(56, 48, 34, 0.94))",
 border: "1px solid rgba(255,255,255,0.08)",
 boxShadow: "0 20px 55px rgba(0,0,0,0.30)",
 marginBottom: 18,
 }}
 >
 <h1
 style={{
 margin: 0,
 fontSize: "clamp(34px, 5vw, 52px)",
 lineHeight: 1.02,
 letterSpacing: "-0.045em",
 }}
 >
 Tactics
 </h1>

 <p
 style={{
 maxWidth: 660,
 margin: "12px 0 18px",
 color: "rgba(244,244,240,0.78)",
 lineHeight: 1.5,
 fontSize: 18,
 }}
 >
 Train tactical motifs by solution length. Puzzles are ordered easy to hard
 and split into focused subthemes.
 </p>

 <Link
 to="/auto"
 style={{
 display: "inline-flex",
 alignItems: "center",
 justifyContent: "center",
 textDecoration: "none",
 color: "#211a10",
 background: "#f5c33b",
 borderRadius: 999,
 padding: "10px 18px",
 fontWeight: 950,
 boxShadow: "0 10px 22px rgba(245,195,59,0.18)",
 }}
 >
 Start Auto Training
 </Link>
 </div>
 </div>

 <div
 style={{
 display: "grid",
 gridTemplateColumns: "repeat(auto-fit, minmax(245px, 1fr))",
 gap: 14,
 }}
 >
 {levels.map((level) => (
 <Link
 key={level.id}
 to={`/tactics/${level.id}`}
 style={{
 textDecoration: "none",
 color: "inherit",
 minHeight: 172,
 borderRadius: 18,
 padding: 24,
 border: "1px solid rgba(255,255,255,0.07)",
 background: "rgba(255,255,255,0.035)",
 boxShadow: "0 14px 34px rgba(0,0,0,0.22)",
 }}
 >
 <div
 style={{
 width: 70,
 height: 70,
 borderRadius: 18,
 display: "grid",
 placeItems: "center",
 marginBottom: 20,
 color: "#201a13",
 background: "linear-gradient(135deg, #f5c33b, #d1874f)",
 fontWeight: 950,
 fontSize: 24,
 }}
 >
 {level.icon}
 </div>

 <div style={{ fontSize: 28, fontWeight: 950, letterSpacing: "-0.02em" }}>
 {tacticDistanceLabels[level.id]}
 </div>

 <div
 style={{
 marginTop: 7,
 color: "rgba(244,244,240,0.82)",
 fontWeight: 750,
 fontSize: 16,
 }}
 >
 {level.subtitle}
 </div>

 <p
 style={{
 margin: "10px 0 0",
 color: "rgba(244,244,240,0.62)",
 lineHeight: 1.5,
 fontSize: 16,
 }}
 >
 {level.description}
 </p>
 </Link>
 ))}
 </div>

 <div
 style={{
 display: "grid",
 gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
 gap: 12,
 marginTop: 18,
 }}
 >
 {[
 ["300", "Puzzles per theme"],
 ["600", "Mixed pools"],
 ["30", "Puzzles per chunk"],
 ["Easy", "Sorted by rating"],
 ].map(([value, label]) => (
 <div
 key={label}
 style={{
 borderRadius: 18,
 padding: 15,
 textAlign: "center",
 background: "rgba(255,255,255,0.035)",
 border: "1px solid rgba(255,255,255,0.06)",
 }}
 >
 <div style={{ color: "#f5c33b", fontSize: 24, fontWeight: 950 }}>
 {value}
 </div>
 <div style={{ color: "rgba(244,244,240,0.68)", fontSize: 12 }}>
 {label}
 </div>
 </div>
 ))}
 </div>
 </section>
 </main>
 )
}