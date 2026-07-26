import React, { useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import ThemedChessboard from "../../theme/ThemedChessboard"
import TrainerShell from "../../components/trainer/TrainerShell";
import "./AnalyzePage.css";
import {
 PanelCard,
 PrimaryButton,
 SecondaryButton,
 SectionTitle,
} from "../../components/trainer/ui";

const START_FEN = new Chess().fen();
const ANALYZE_MOBILE_BREAKPOINT = 768;
const ANALYZE_DESKTOP_MAX_BOARD_SIZE = 760;

function getAnalyzeBoardSize() {
 if (typeof window !== "undefined" && window.innerWidth <= ANALYZE_MOBILE_BREAKPOINT) {
 return Math.min(ANALYZE_DESKTOP_MAX_BOARD_SIZE, Math.max(0, window.innerWidth - 16));
 }

 return 720;
}

const PIECE_URLS: Record<string, string> = {
 wP: "/pieces/react-chessboard-default/wp.svg",
 wN: "/pieces/react-chessboard-default/wn.svg",
 wB: "/pieces/react-chessboard-default/wb.svg",
 wR: "/pieces/react-chessboard-default/wr.svg",
 wQ: "/pieces/react-chessboard-default/wq.svg",
 wK: "/pieces/react-chessboard-default/wk.svg",
 bP: "/pieces/react-chessboard-default/bp.svg",
 bN: "/pieces/react-chessboard-default/bn.svg",
 bB: "/pieces/react-chessboard-default/bb.svg",
 bR: "/pieces/react-chessboard-default/br.svg",
 bQ: "/pieces/react-chessboard-default/bq.svg",
 bK: "/pieces/react-chessboard-default/bk.svg",
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
 const [boardSize, setBoardSize] = useState(getAnalyzeBoardSize);
 const [isDragging, setIsDragging] = useState(false);
 const [isHandleHovered, setIsHandleHovered] = useState(false);
 const [inputText, setInputText] = useState("");
 const [message, setMessage] = useState("Paste FEN or PGN, or choose a tool.");

 useEffect(() => {
 function resize() {
 if (window.innerWidth <= ANALYZE_MOBILE_BREAKPOINT) {
 setBoardSize(
 Math.min(ANALYZE_DESKTOP_MAX_BOARD_SIZE, Math.max(0, window.innerWidth - 16)),
 );
 return;
 }

 const availableWidth = window.innerWidth - 720;
 const availableHeight = window.innerHeight - 150;
 setBoardSize(
 Math.max(420, Math.min(ANALYZE_DESKTOP_MAX_BOARD_SIZE, availableWidth, availableHeight)),
 );
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
 <div className="analyze-home-board">
 <div
 className="analyze-home-player-row"
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

 <ThemedChessboard
 id="AnalyzeHomeBoard"
 position={START_FEN}
 boardWidth={boardSize}

 arePiecesDraggable={false}
 showBoardNotation={true}
 customDarkSquareStyle={{ backgroundColor: "#769656" }}
 customLightSquareStyle={{ backgroundColor: "#eeeed2" }}
 customBoardStyle={{ borderRadius: "8px", overflow: "hidden" }}
 />

 <div
 className="analyze-home-player-row"
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
 <div className="analyze-home-panel">
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
 🧠 Game Analysis
 </button>

 <button
 onClick={() => { window.location.href = "/analyze/image"; }}
 style={toolButtonStyle}
 >
 📷 Image to Position
 </button>
 </div>

 <textarea
 className="analyze-home-input"
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

 <div className="analyze-home-primary-control" style={{ marginTop: 10 }}>
 <PrimaryButton onClick={startAnalysis}>Start Analysis</PrimaryButton>
 </div>

 <div className="analyze-home-final-controls" style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
 <SecondaryButton onClick={() => setInputText("")}>New</SecondaryButton>
 <SecondaryButton onClick={() => setInputText(START_FEN)}>Start FEN</SecondaryButton>
 </div>

 <div style={{ marginTop: 10, fontSize: 12, color: "#aaa", lineHeight: 1.5 }}>
 {message}
 </div>
 </PanelCard>
 </div>
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
