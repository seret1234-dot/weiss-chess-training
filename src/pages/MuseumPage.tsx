import { useMemo, useState } from "react"
import { chessMuseumItems, museumCategories } from "../data/chessMuseumItems"

export default function MuseumPage() {
 const [category, setCategory] = useState("All")
 const [search, setSearch] = useState("")

 const items = useMemo(() => {
 const q = search.trim().toLowerCase()

 return chessMuseumItems.filter((item) => {
 const categoryOk = category === "All" || item.category === category

 const searchOk =
 !q ||
 item.title.toLowerCase().includes(q) ||
 item.description.toLowerCase().includes(q) ||
 item.category.toLowerCase().includes(q) ||
 item.tags.some((tag) => tag.toLowerCase().includes(q)) ||
 item.players?.some((p) => p.toLowerCase().includes(q))

 return categoryOk && searchOk
 })
 }, [category, search])

 return (
 <div
 style={{
 minHeight: "100vh",
 background: "linear-gradient(180deg, #2b2623 0%, #231f1d 100%)",
 color: "#f3f3f3",
 fontFamily: "Arial, sans-serif",
 }}
 >
 <div style={{ maxWidth: 1240, margin: "0 auto", padding: "28px 20px 70px" }}>
 <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 24 }}>
 Weiss Chess Trainer
 </div>

 <div
 style={{
 background:
 "linear-gradient(135deg, rgba(139,92,246,0.25) 0%, rgba(242,193,78,0.12) 100%)",
 borderRadius: 28,
 padding: 34,
 border: "1px solid rgba(255,255,255,0.06)",
 marginBottom: 22,
 }}
 >
 <h1 style={{ fontSize: 48, margin: "0 0 12px" }}>Fun Chess</h1>
 <p style={{ fontSize: 18, color: "#d7d7d7", margin: 0, maxWidth: 760 }}>
 Weird games, impossible positions, immortal attacks, bizarre mates and legendary chess curiosities.
 </p>
 </div>

 <div
 style={{
 display: "flex",
 gap: 10,
 flexWrap: "wrap",
 alignItems: "center",
 marginBottom: 22,
 }}
 >
 {["All", ...museumCategories].map((cat) => (
 <button
 key={cat}
 onClick={() => setCategory(cat)}
 style={{
 padding: "9px 13px",
 borderRadius: 999,
 border: "1px solid rgba(255,255,255,0.08)",
 background: category === cat ? "#f2c14e" : "#1f1d1c",
 color: category === cat ? "#1f1d1c" : "#f3f3f3",
 fontWeight: 800,
 cursor: "pointer",
 }}
 >
 {cat}
 </button>
 ))}

 <input
 value={search}
 onChange={(e) => setSearch(e.target.value)}
 placeholder="Search queen, mate, Tal, Morphy..."
 style={{
 marginLeft: "auto",
 minWidth: 300,
 padding: "11px 14px",
 borderRadius: 999,
 border: "1px solid rgba(255,255,255,0.08)",
 background: "#1f1d1c",
 color: "white",
 outline: "none",
 fontWeight: 700,
 }}
 />
 </div>

 <div
 style={{
 display: "grid",
 gridTemplateColumns: "repeat(auto-fit, minmax(270px, 1fr))",
 gap: 20,
 }}
 >
 {items.map((item) => {
 const fenPlayColor = item.fen?.split(" ")[1] === "b" ? "black" : "white"
 const analyzeUrl = item.pgn
 ? `/analyze?pgn=${encodeURIComponent(item.pgn)}`
 : item.fen
 ? `/play-vs-computer?fen=${encodeURIComponent(item.fen)}&color=${fenPlayColor}&mode=play&autostart=1`
 : item.link

 return (
 <div
 key={item.id}
 style={{
 border: "1px solid rgba(255,255,255,0.06)",
 borderRadius: 22,
 padding: 22,
 background: "#1f1d1c",
 color: "#f3f3f3",
 boxShadow: "0 14px 34px rgba(0,0,0,0.2)",
 }}
 >
 <div
 style={{
 width: 54,
 height: 54,
 borderRadius: 16,
 background: categoryAccent(item.category),
 display: "flex",
 alignItems: "center",
 justifyContent: "center",
 fontSize: 24,
 fontWeight: 900,
 marginBottom: 16,
 }}
 >
 {categoryIcon(item.category)}
 </div>

 <h2 style={{ fontSize: 24, margin: "0 0 6px", fontWeight: 900 }}>
 {item.title}
 </h2>

 <div style={{ color: "#cfcfcf", fontSize: 14, marginBottom: 10 }}>
 {item.category}
 {item.year ? ` - ${item.year}` : ""}
 </div>

 <div
 style={{
 color: "#f2c14e",
 fontWeight: 900,
 marginBottom: 12,
 }}
 >
 Rarity: {item.rarity}/5
 </div>

 {item.players?.length ? (
 <div style={{ fontSize: 14, color: "#d7d7d7", marginBottom: 12 }}>
 {item.players.join(" vs / ")}
 </div>
 ) : null}

 <p style={{ color: "#d7d7d7", lineHeight: 1.55, marginBottom: 14 }}>
 {item.description}
 </p>

 {item.funFact ? (
 <div
 style={{
 padding: 12,
 borderRadius: 14,
 background: "rgba(255,255,255,0.04)",
 border: "1px solid rgba(255,255,255,0.05)",
 color: "#d7d7d7",
 marginBottom: 14,
 lineHeight: 1.45,
 }}
 >
 <b style={{ color: "#f3f3f3" }}>Fun fact:</b> {item.funFact}
 </div>
 ) : null}

 <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 16 }}>
 {item.tags.map((tag) => (
 <span
 key={tag}
 style={{
 fontSize: 12,
 padding: "5px 8px",
 borderRadius: 999,
 background: "rgba(127,166,80,0.16)",
 color: "#bbf7d0",
 fontWeight: 700,
 }}
 >
 #{tag}
 </span>
 ))}
 </div>

 <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
 {item.youtube ? (
 <a
 href={item.youtube}
 target="_blank"
 rel="noreferrer"
 style={buttonLinkStyle}
 >
 Watch Video
 </a>
 ) : null}

 {analyzeUrl ? (
 <a href={analyzeUrl} style={secondaryLinkStyle}>
 {item.fen && !item.pgn ? "Play Position" : "Open in Analyze"}
 </a>
 ) : null}
 </div>
 </div>
 )
 })}
 </div>
 </div>
 </div>
 )
}

function categoryIcon(category: string) {
 if (category.includes("Mate")) return "#"
 if (category.includes("Attack")) return "!"
 if (category.includes("Puzzle")) return "?"
 if (category.includes("Impossible")) return "*"
 if (category.includes("Game")) return "G"
 return "F"
}

function categoryAccent(category: string) {
 if (category.includes("Mate")) return "linear-gradient(135deg, #7fa650 0%, #5d7f38 100%)"
 if (category.includes("Attack")) return "linear-gradient(135deg, #e27d60 0%, #b45137 100%)"
 if (category.includes("Puzzle")) return "linear-gradient(135deg, #a96acb 0%, #7c3fa1 100%)"
 if (category.includes("Impossible")) return "linear-gradient(135deg, #d1a94a 0%, #9b7a27 100%)"
 if (category.includes("Game")) return "linear-gradient(135deg, #4f8cc9 0%, #2c5e91 100%)"
 return "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)"
}

const buttonLinkStyle: React.CSSProperties = {
 display: "inline-block",
 padding: "10px 13px",
 borderRadius: 999,
 background: "#f2c14e",
 color: "#1f1d1c",
 fontWeight: 900,
 textDecoration: "none",
}

const secondaryLinkStyle: React.CSSProperties = {
 display: "inline-block",
 padding: "10px 13px",
 borderRadius: 999,
 background: "#7fa650",
 color: "#10140c",
 fontWeight: 900,
 textDecoration: "none",
}
