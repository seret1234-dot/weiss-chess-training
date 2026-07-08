import { useEffect, useMemo, useState } from "react"
import { getEndgameExplanation } from "./endgameExplanations"

function readPageText() {
 if (typeof window === "undefined" || typeof document === "undefined") return ""

 const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
 .map((el) => el.textContent || "")
 .join(" ")

 return [
 window.location.pathname,
 window.location.search,
 window.location.hash,
 document.title,
 headings,
 ].join(" ")
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
 return (
 <div style={{ marginTop: 16 }}>
 <div style={{ fontWeight: 900, fontSize: 17, color: "#f5deb3", marginBottom: 8 }}>
 {title}
 </div>
 <ul style={{ margin: 0, paddingLeft: 22, display: "grid", gap: 7, fontSize: 16, lineHeight: 1.45 }}>
 {items.map((item) => (
 <li key={item}>{item}</li>
 ))}
 </ul>
 </div>
 )
}

export default function EndgameExplanationOverlay() {
 const [pageText, setPageText] = useState("")
 const [open, setOpen] = useState(false)

 useEffect(() => {
 const update = () => setPageText(readPageText())
 update()

 const id = window.setInterval(update, 700)
 return () => window.clearInterval(id)
 }, [])

 const explanation = useMemo(() => getEndgameExplanation(pageText), [pageText])

 if (!explanation) return null

 return (
 <aside
 style={{
 position: "fixed",
 left: 18,
 bottom: 18,
 width: open ? "min(430px, calc(100vw - 36px))" : "min(390px, calc(100vw - 36px))",
 maxHeight: "58vh",
 zIndex: 8000,
 borderRadius: 16,
 overflow: "hidden",
 background: "rgba(28, 25, 20, 0.97)",
 border: "1px solid rgba(255, 255, 255, 0.18)",
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
 padding: "14px 16px",
 background: "rgba(255, 255, 255, 0.08)",
 color: "#fff4dc",
 display: "flex",
 justifyContent: "space-between",
 gap: 12,
 fontWeight: 900,
 fontSize: 18,
 }}
 >
 <span>Endgame help: {explanation.title}</span>
 <span>{open ? "Hide" : "Show"}</span>
 </button>

 {open && (
 <div style={{ padding: "16px 18px 18px", maxHeight: "calc(58vh - 58px)", overflowY: "auto" }}>
 <div
 style={{
 fontSize: 16,
 lineHeight: 1.5,
 background: "rgba(255, 255, 255, 0.06)",
 border: "1px solid rgba(255, 255, 255, 0.08)",
 borderRadius: 12,
 padding: 12,
 }}
 >
 {explanation.goal}
 </div>

 <ListBlock title="Main plan" items={explanation.plan} />
 <ListBlock title="Key rules" items={explanation.rules} />
 <ListBlock title="Common mistakes" items={explanation.mistakes} />
 </div>
 )}
 </aside>
 )
}