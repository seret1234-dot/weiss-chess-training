import React, { useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import TrainerShell from "../../components/trainer/TrainerShell";
import {
 PanelCard,
 PrimaryButton,
 SecondaryButton,
 SectionTitle,
} from "../../components/trainer/ui";

const START_FEN = new Chess().fen();

const PIECE_URLS: Record<string, string> = {
 wP: "https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wp.png",
 wN: "https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wn.png",
 wB: "https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wb.png",
 wR: "https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wr.png",
 wQ: "https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wq.png",
 wK: "https://images.chesscomfiles.com/chess-themes/pieces/neo/150/wk.png",
 bP: "https://images.chesscomfiles.com/chess-themes/pieces/neo/150/bp.png",
 bN: "https://images.chesscomfiles.com/chess-themes/pieces/neo/150/bn.png",
 bB: "https://images.chesscomfiles.com/chess-themes/pieces/neo/150/bb.png",
 bR: "https://images.chesscomfiles.com/chess-themes/pieces/neo/150/br.png",
 bQ: "https://images.chesscomfiles.com/chess-themes/pieces/neo/150/bq.png",
 bK: "https://images.chesscomfiles.com/chess-themes/pieces/neo/150/bk.png",
};

const toolButtonStyle: React.CSSProperties = {
 width: "100%",
 minHeight: 52,
 border: "1px solid rgba(255,255,255,0.08)",
 borderRadius: 10,
 background: "linear-gradient(#3a3734, #2b2825)",
 color: "#f3f3f3",
 fontWeight: 900,
 fontSize: 15,
 cursor: "pointer",
 boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
};

export default function AnalyzePage() {
 const containerRef = useRef<HTMLDivElement | null>(null);
 const [boardSize, setBoardSize] = useState(720);
 const [isDragging, setIsDragging] = useState(false);
 const [isHandleHovered, setIsHandleHovered] = useState(false);
 const [inputText, setInputText] = useState("");
 const [message, setMessage] = useState("Paste FEN or PGN, or choose a tool.");

 useEffect(() => {
 function resize() {
 const availableWidth = window.innerWidth - 720;
 const availableHeight = window.innerHeight - 150;
 setBoardSize(Math.max(420, Math.min(760, availableWidth, availableHeight)));
 }

 resize();
 window.addEventListener("resize", resize);
 return () => window.removeEventListener("resize", resize);
 }, []);

 const pieces = Object.fromEntries(
 Object.entries(PIECE_URLS).map(([code, src]) => [
 code,
 ({ squareWidth }: { squareWidth: number }) => (
 <img
 src={src}
 alt={code}
 draggable={false}
 style={{
 width: squareWidth,
 height: squareWidth,
 display: "block",
 userSelect: "none",
 pointerEvents: "none",
 }}
 />
 ),
 ]),
 );

 function inputLooksLikePgn(text: string) {
 return text.includes("[Event") || /\d+\./.test(text);
 }

 function startAnalysis() {
 const text = inputText.trim();

 if (!text) {
 window.location.href = `/analyze/board?fen=${encodeURIComponent(START_FEN)}`;
 return;
 }

 if (inputLooksLikePgn(text)) {
 window.location.href = `/analyze/board?pgn=${encodeURIComponent(text)}`;
 return;
 }

 try {
 const fen = new Chess(text).fen();
 window.location.href = `/analyze/board?fen=${encodeURIComponent(fen)}`;
 } catch {
 setMessage("Invalid FEN or PGN.");
 }
 }

 function openSetup() {
 const text = inputText.trim();

 try {
 const fen = text && !inputLooksLikePgn(text) ? new Chess(text).fen() : START_FEN;
 window.location.href = `/analyze/setup?fen=${encodeURIComponent(fen)}`;
 } catch {
 window.location.href = `/analyze/setup?fen=${encodeURIComponent(START_FEN)}`;
 }
 }

 const board = (
 <div>
 <div
 style={{
 width: boardSize,
 minHeight: 30,
 boxSizing: "border-box",
 display: "flex",
 alignItems: "center",
 justifyContent: "space-between",
 gap: 10,
 padding: "5px 9px",
 margin: "4px 0",
 borderRadius: 8,
 background: "#211e1b",
 color: "#f3f3f3",
 border: "1px solid rgba(255,255,255,0.08)",
 fontSize: 13,
 fontWeight: 800,
 }}
 >
 <span>Black</span>
 </div>

 <Chessboard
 id="AnalyzeHomeBoard"
 position={START_FEN}
 boardWidth={boardSize}
 customPieces={pieces}
 arePiecesDraggable={false}
 showBoardNotation={true}
 customDarkSquareStyle={{ backgroundColor: "#769656" }}
 customLightSquareStyle={{ backgroundColor: "#eeeed2" }}
 customBoardStyle={{ borderRadius: "8px", overflow: "hidden" }}
 />

 <div
 style={{
 width: boardSize,
 minHeight: 30,
 boxSizing: "border-box",
 display: "flex",
 alignItems: "center",
 justifyContent: "space-between",
 gap: 10,
 padding: "5px 9px",
 margin: "4px 0",
 borderRadius: 8,
 background: "#211e1b",
 color: "#f3f3f3",
 border: "1px solid rgba(255,255,255,0.08)",
 fontSize: 13,
 fontWeight: 800,
 }}
 >
 <span>White</span>
 </div>
 </div>
 );

 const sidePanel = (
 <PanelCard>
 <div style={{ textAlign: "center", marginBottom: 12 }}>
 <SectionTitle>🔍 Analysis</SectionTitle>
 </div>

 <div style={{ display: "grid", gap: 8 }}>
 <button onClick={openSetup} style={toolButtonStyle}>
 📝 Set Up Position
 </button>

 <button
 onClick={() => {
 window.location.href = "/analyze/board";
 }}
 style={toolButtonStyle}
 >
 🔎 Board Analysis
 </button>

 <button
 onClick={() => {
 window.location.href = "/analyze/review";
 }}
 style={toolButtonStyle}
 >
 🧠 Game Review
 </button>

 <button
 onClick={() => { window.location.href = "/analyze/image"; }}
 style={toolButtonStyle}
 >
 📷 Image to Position
 </button>
 </div>

 <textarea
 value={inputText}
 onChange={(e) => setInputText(e.target.value)}
 placeholder="Paste your FEN or PGN here."
 style={{
 width: "100%",
 minHeight: 340,
 resize: "vertical",
 marginTop: 12,
 background: "#2b2724",
 color: "#f3f3f3",
 border: "1px solid rgba(255,255,255,0.12)",
 borderRadius: 10,
 padding: 10,
 boxSizing: "border-box",
 fontSize: 13,
 lineHeight: 1.4,
 }}
 />

 <div style={{ marginTop: 10 }}>
 <PrimaryButton onClick={startAnalysis}>Start Analysis</PrimaryButton>
 </div>

 <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
 <SecondaryButton onClick={() => setInputText("")}>New</SecondaryButton>
 <SecondaryButton onClick={() => setInputText(START_FEN)}>Start FEN</SecondaryButton>
 </div>

 <div style={{ marginTop: 10, fontSize: 12, color: "#aaa", lineHeight: 1.5 }}>
 {message}
 </div>
 </PanelCard>
 );

 return (
 <TrainerShell
 title="Analyze"
 subtitle="Choose an analysis tool"
 boardSize={boardSize}
 isDragging={isDragging}
 isHandleHovered={isHandleHovered}
 setIsDragging={setIsDragging}
 setIsHandleHovered={setIsHandleHovered}
 containerRef={containerRef}
 footerLeft="Analyze"
 footerRight={`${boardSize}px`}
 board={board}
 sidePanel={sidePanel}
 sidePanelWidth={520}
 />
 );
}