import { useEffect, useMemo, useState } from "react"
import {
 GENERIC_OPENING_EXPLANATION,
 getOpeningExplanation,
 type OpeningExplanation,
} from "./openingExplanations"

type PageData = {
 text: string
 title: string
 path: string
}

function clean(value: string) {
 return value
 .toLowerCase()
 .replace(/&/g, " and ")
 .replace(/[ - ']/g, "")
 .replace(/\+/g, " ")
 .replace(/[^a-z0-9]+/g, " ")
 .replace(/\s+/g, " ")
 .trim()
}

function titleFromSlug(path: string) {
 const last = path.split("/").filter(Boolean).pop() || ""
 return last
 .replace(/-/g, " ")
 .replace(/\b\w/g, (letter) => letter.toUpperCase())
 .replace(/\bS\b/g, "s")
 .trim()
}

function readPageData(): PageData {
 if (typeof window === "undefined" || typeof document === "undefined") {
 return { text: "", title: "", path: "" }
 }

 const path = window.location.pathname

 const h1 = document.querySelector("h1")?.textContent?.trim() || ""
 const title = h1 || titleFromSlug(path)

 const headings = Array.from(
 document.querySelectorAll("h1, h2, h3, [data-opening-title]")
 )
 .map((el) => el.textContent || "")
 .join(" ")

 const text = [
 path,
 window.location.search,
 window.location.hash,
 document.title,
 title,
 headings,
 ].join(" ")

 return { text, title, path }
}

function fallbackId(title: string) {
 return `fallback-${clean(title).replace(/\s+/g, "-") || "opening"}`
}

function makeTitleFallback(title: string): OpeningExplanation | null {
 const key = clean(title)

 if (!key || key === "openings") return null

 if (key.includes("gambit") || key.includes("countergambit")) {
 return {
 id: fallbackId(title),
 title,
 aliases: [],
 goal: "Use the sacrificed or offered material to gain time, open lines, and create active piece play.",
 plan: [
 "Develop quickly before the opponent consolidates.",
 "Open files and diagonals toward the enemy king or center.",
 "Use the initiative before the extra material becomes important."
 ],
 keyIdeas: [
 "A gambit must give activity, development, or structural damage.",
 "The side accepting the gambit should not waste tempi keeping every pawn.",
 "The side offering the gambit must play energetically."
 ],
 mistakes: [
 "Sacrificing material and then playing slowly.",
 "Chasing pawns instead of completing development.",
 "Attacking with too few pieces involved."
 ]
 }
 }

 if (key.includes("indian")) {
 return {
 id: fallbackId(title),
 title,
 aliases: [],
 goal: "Use a hypermodern setup: allow or invite a pawn center, then attack it with pieces and pawn breaks.",
 plan: [
 "Develop flexibly, often with knights first and sometimes a fianchetto.",
 "Watch the opponent's center and choose the right pawn break.",
 "Aim for pressure on central squares rather than early symmetry."
 ],
 keyIdeas: [
 "Indian openings usually attack the center instead of occupying it immediately.",
 "The main breaks are often ...c5, ...e5, ...d5, or White's e4.",
 "Piece activity and timing matter more than memorized move order."
 ],
 mistakes: [
 "Allowing a big center and never challenging it.",
 "Trading active pieces without a reason.",
 "Ignoring dark-square or long-diagonal pressure."
 ]
 }
 }

 if (key.includes("defense")) {
 return {
 id: fallbackId(title),
 title,
 aliases: [],
 goal: "Create a reliable defensive setup while fighting for central counterplay and piece activity.",
 plan: [
 "Develop pieces toward the center.",
 "Identify the main pawn break that challenges White's center.",
 "Secure the king before opening the position."
 ],
 keyIdeas: [
 "A defense should not mean passivity.",
 "The important question is how Black challenges the center.",
 "Rare defenses are playable only if development and king safety are respected."
 ],
 mistakes: [
 "Playing only waiting moves and giving White a free center.",
 "Ignoring the thematic central break.",
 "Weakening the king before development is complete."
 ]
 }
 }

 if (key.includes("attack")) {
 return {
 id: fallbackId(title),
 title,
 aliases: [],
 goal: "Create active attacking chances while still completing development and controlling the center.",
 plan: [
 "Develop the pieces that support the attack.",
 "Open lines only when your king is safe enough.",
 "Attack a real weakness, not only the enemy king in general."
 ],
 keyIdeas: [
 "An attack works best when it is supported by development.",
 "Pawn pushes create space but also weaknesses.",
 "The center often decides whether the attack is sound."
 ],
 mistakes: [
 "Launching pawns before pieces are ready.",
 "Ignoring counterplay in the center.",
 "Moving the queen too early without a concrete tactic."
 ]
 }
 }

 if (key.includes("formation") || key.includes("system")) {
 return {
 id: fallbackId(title),
 title,
 aliases: [],
 goal: "Reach a repeatable setup with clear piece placement, then use the right pawn break.",
 plan: [
 "Develop the pieces to their natural squares.",
 "Keep the pawn structure stable until the right break is ready.",
 "React to the opponent instead of playing the setup automatically."
 ],
 keyIdeas: [
 "Systems reduce memorization, but they still need plans.",
 "The main pawn break is essential.",
 "A system becomes weak if it ignores the opponent's setup."
 ],
 mistakes: [
 "Playing the same moves against every defense.",
 "Never challenging the center.",
 "Starting an attack before the setup is complete."
 ]
 }
 }

 if (key.includes("pawn")) {
 return {
 id: fallbackId(title),
 title,
 aliases: [],
 goal: "Use the first central pawn move to claim space and guide development into a playable middlegame.",
 plan: [
 "Support the central pawn with pieces or another pawn.",
 "Develop naturally before forcing the center open.",
 "Look for the correct central break based on the structure."
 ],
 keyIdeas: [
 "Pawn openings are mainly about center structure.",
 "The same first move can transpose into many systems.",
 "Understanding the pawn break matters more than memorizing names."
 ],
 mistakes: [
 "Pushing pawns without developing.",
 "Blocking your own bishops.",
 "Letting the opponent challenge the center for free."
 ]
 }
 }

 return {
 id: fallbackId(title),
 title,
 aliases: [],
 goal: "Reach a playable middlegame by following opening principles: center control, development, king safety, and a clear pawn break.",
 plan: [
 "Control central squares with pawns and pieces.",
 "Develop knights and bishops before moving the same piece repeatedly.",
 "Castle or secure the king before opening the position.",
 "Find the main pawn break instead of playing random improving moves."
 ],
 keyIdeas: [
 "Rare openings can work, but only if they still respect the center.",
 "Surprise value is useful, but development is more important.",
 "The position should lead to a clear middlegame plan."
 ],
 mistakes: [
 "Playing strange moves without a central idea.",
 "Moving too many pawns before developing pieces.",
 "Relying only on surprise instead of sound development."
 ]
 }
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
 return (
 <div style={{ marginTop: 12 }}>
 <div style={{ fontWeight: 800, fontSize: 13, color: "#f5deb3", marginBottom: 5 }}>
 {title}
 </div>
 <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4, fontSize: 13, lineHeight: 1.35 }}>
 {items.map((item) => (
 <li key={item}>{item}</li>
 ))}
 </ul>
 </div>
 )
}

export default function OpeningExplanationOverlay() {
 const [pageData, setPageData] = useState<PageData>(() => ({
 text: "",
 title: "",
 path: "",
 }))

 const [open, setOpen] = useState(() => {
 try {
 if (typeof window === "undefined") return true
 return window.localStorage.getItem("openingExplanationOpen") !== "closed"
 } catch {
 return true
 }
 })

 useEffect(() => {
 const update = () => setPageData(readPageData())
 update()

 const id = window.setInterval(update, 700)
 return () => window.clearInterval(id)
 }, [])

 useEffect(() => {
 try {
 window.localStorage.setItem("openingExplanationOpen", open ? "open" : "closed")
 } catch {
 // Ignore.
 }
 }, [open])

 const isOpeningPage = pageData.path.toLowerCase().includes("opening")

 const explanation = useMemo(() => {
 return (
 getOpeningExplanation(pageData.text) ||
 makeTitleFallback(pageData.title) ||
 GENERIC_OPENING_EXPLANATION
 )
 }, [pageData])

 if (!isOpeningPage) return null

 return (
 <aside
 style={{
 position: "fixed",
 right: 18,
 top: 86,
 width: open ? 390 : 260,
 maxWidth: "calc(100vw - 36px)",
 zIndex: 1000,
 borderRadius: 16,
 overflow: "hidden",
 background: "rgba(28, 25, 20, 0.96)",
 border: "1px solid rgba(255, 255, 255, 0.14)",
 boxShadow: "0 18px 50px rgba(0, 0, 0, 0.45)",
 color: "#f6f0e3",
 fontFamily: "Arial, sans-serif",
 }}
 >
 <button
 type="button"
 onClick={() => setOpen((x) => !x)}
 style={{
 width: "100%",
 border: 0,
 cursor: "pointer",
 textAlign: "left",
 padding: "12px 14px",
 background: "rgba(255, 255, 255, 0.07)",
 color: "#fff4dc",
 display: "flex",
 justifyContent: "space-between",
 gap: 12,
 fontWeight: 800,
 fontSize: 14,
 }}
 >
 <span>Opening explanation: {explanation.title}</span>
 <span>{open ? "Hide" : "Show"}</span>
 </button>

 {open && (
 <div style={{ padding: "13px 15px 15px", maxHeight: "calc(100vh - 120px)", overflowY: "auto" }}>
 <div
 style={{
 fontSize: 13.5,
 lineHeight: 1.45,
 background: "rgba(255, 255, 255, 0.06)",
 border: "1px solid rgba(255, 255, 255, 0.08)",
 borderRadius: 12,
 padding: 10,
 }}
 >
 {explanation.goal}
 </div>

 <ListBlock title="Main plan" items={explanation.plan} />
 <ListBlock title="Key ideas" items={explanation.keyIdeas} />
 <ListBlock title="Common mistakes" items={explanation.mistakes} />
 </div>
 )}
 </aside>
 )
}