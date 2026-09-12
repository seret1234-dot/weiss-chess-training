import { Link, useLocation } from "react-router-dom"
import { tacticDistanceLabels } from "./tacticThemeCatalog"
import { createHierarchyNavigationState } from "./navigation/hierarchicalBack.mjs"
import { useHierarchicalNavigation } from './navigation/useHierarchicalNavigation'

export type TacticsLevelCard = {
 id: string
 icon: string
 title: string
 subtitle: string
 description: string
 href: string
}

const regularLevels: TacticsLevelCard[] = [
 {
 id: "m1",
 icon: "1",
 title: tacticDistanceLabels.m1,
 subtitle: "One move tactics",
 description: "Fast tactical recognition and simple shots.",
 href: "/tactics/m1",
 },
 {
 id: "m2",
 icon: "2",
 title: tacticDistanceLabels.m2,
 subtitle: "Two move tactics",
 description: "Find the forcing first move and follow-up.",
 href: "/tactics/m2",
 },
 {
 id: "m3",
 icon: "3",
 title: tacticDistanceLabels.m3,
 subtitle: "Three move tactics",
 description: "Longer forcing lines with replies.",
 href: "/tactics/m3",
 },
 {
 id: "m4",
 icon: "4+",
 title: tacticDistanceLabels.m4,
 subtitle: "Four moves and longer",
 description: "Deeper tactical calculation sequences.",
 href: "/tactics/m4",
 },
] 

export type TacticsLandingPageProps = {
 title?: string
 description?: string
 levels?: TacticsLevelCard[]
 showAutoTraining?: boolean
 showRegularIntroduction?: boolean
 stats?: [string, string][]
 parentHref?: string
}

export function TacticsLandingPage({
 title = "Tactics",
 description = "Train tactical motifs by solution length. Puzzles are ordered easy to hard and split into focused subthemes.",
 levels = regularLevels,
 showAutoTraining = true,
 showRegularIntroduction = true,
 stats = [["300", "Puzzles per theme"], ["600", "Mixed pools"], ["30", "Puzzles per chunk"], ["Easy", "Sorted by rating"]],
 parentHref,
}: TacticsLandingPageProps) {
 const location = useLocation()
 const { backToParent } = useHierarchicalNavigation()
 return (
 <div
 style={{
 minHeight: "100vh",
 padding: "34px 22px 90px",
 color: "#f4f4f0",
 background:
 "radial-gradient(circle at top center, rgba(94, 72, 42, 0.28), transparent 35%), linear-gradient(135deg, #1f1b19 0%, #221d1a 48%, #181514 100%)",
 }}
 >
 <section style={{ maxWidth: 1040, margin: "0 auto" }}>
 {parentHref ? <button onClick={() => backToParent(parentHref)} style={{ marginBottom: 16, color: 'rgba(244,244,240,0.78)', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', fontWeight: 800 }}>Back to Home</button> : null}
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
 {title}
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
 {description}
 </p>

 {showAutoTraining ? (
 <Link
 to="/auto?continue=1"
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
 ) : null}
 </div>
 </div>

 {showRegularIntroduction ? (
 <section style={{ margin: "0 0 18px", maxWidth: 820 }}>
 <h2 style={{ margin: "0 0 10px", fontSize: 26, letterSpacing: "-0.025em" }}>
 Train tactical motifs with progression
 </h2>
 <p style={{ margin: 0, color: "rgba(244,244,240,0.78)", lineHeight: 1.7, fontSize: 16 }}>
 Random puzzle solving can be enjoyable, but it can make repeated tactical ideas hard to notice. This trainer organizes practice by motif and difficulty so you can work on a recognizable pattern before moving to longer or less obvious positions. Start with a focused level, identify the tactical idea, and build calculation gradually as the sequences become more demanding. Repeated practice helps connect recognition with the move you choose on the board. Work through <Link to="/tactics/m1" style={{ color: "#f5c33b" }}>Tactics level 1</Link>, add focused <Link to="/mates" style={{ color: "#f5c33b" }}>Mate training</Link>, or use <Link to="/auto" style={{ color: "#f5c33b" }}>Auto Training</Link> when you want a recommended next task.
 </p>
 </section>
 ) : null}

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
 to={level.href}
 state={createHierarchyNavigationState(location.pathname)}
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
 {level.title}
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
 {stats.map(([value, label]) => (
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
 </div>
 )
}

export default function TacticsPage() {
 return <TacticsLandingPage />
}
