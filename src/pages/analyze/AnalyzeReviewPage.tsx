import React, { useEffect, useRef, useState } from "react";
import { Chess } from "chess.js";
import ThemedChessboard from "../../theme/ThemedChessboard"
import TrainerShell from "../../components/trainer/TrainerShell";
import "./AnalyzeSubpages.css";
import {
 PanelCard,
 PrimaryButton,
 SecondaryButton,
 SectionTitle,
} from "../../components/trainer/ui";

const START_FEN = new Chess().fen();

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

export default function AnalyzeReviewPage() {
 const containerRef = useRef<HTMLDivElement | null>(null);
 const pgnFileInputRef = useRef<HTMLInputElement | null>(null);

 const [boardSize, setBoardSize] = useState(720);
 const [isDragging, setIsDragging] = useState(false);
 const [isHandleHovered, setIsHandleHovered] = useState(false);
 const [pgnText, setPgnText] = useState("");
 const [message, setMessage] = useState("Paste, upload, or drop a PGN anywhere.");
 const [isPgnDragActive, setIsPgnDragActive] = useState(false);

 useEffect(() => {
 const params = new URLSearchParams(window.location.search);
 const pgnFromUrl = params.get("pgn");

 if (!pgnFromUrl) return;

 setPgnText(pgnFromUrl);
 setMessage("Weekly game loaded. Click Review Game.");
 }, []);

 useEffect(() => {
 function resize() {
 if (window.innerWidth <= 768) {
 setBoardSize(Math.min(760, Math.max(0, window.innerWidth - 16)));
 return;
 }

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

 function looksLikePgn(text: string) {
 return text.includes("[Event") || /\d+\./.test(text);
 }

 function isPgnFile(file: File) {
 const name = file.name.toLowerCase();

 return (
 name.endsWith(".pgn") ||
 name.endsWith(".txt") ||
 file.type.startsWith("text/") ||
 file.type === "application/vnd.chess-pgn" ||
 file.type === "application/x-chess-pgn"
 );
 }

 async function loadPgnFile(file: File) {
 if (!isPgnFile(file)) {
 setMessage("Drop or upload a .pgn / .txt PGN file.");
 return;
 }

 try {
 const text = await file.text();

 if (!text.trim()) {
 setMessage("PGN file is empty.");
 return;
 }

 if (!looksLikePgn(text)) {
 setPgnText(text);
 setMessage(`Loaded ${file.name}, but it does not look like a normal PGN.`);
 return;
 }

 setPgnText(text);
 setMessage(`Loaded ${file.name}. Click Review Game.`);
 } catch {
 setMessage("Could not read the PGN file.");
 }
 }

 function reviewGame() {
 const text = pgnText.trim();

 if (!text) {
 setMessage("Paste, upload, or drop a PGN first.");
 return;
 }

 if (!looksLikePgn(text)) {
 setMessage("This does not look like a PGN.");
 return;
 }

 try {
 const test = new Chess();
 test.loadPgn(text);
 if (test.history().length === 0) {
 setMessage("PGN loaded, but no moves were found. Check the move text.");
 return;
 }
 } catch {
 setMessage("Invalid PGN. Check the format and try again.");
 return;
 }

 window.sessionStorage.setItem("weissAnalyzeReviewPgn", text);
 window.location.href = "/analyze/board?review=1";
 }

 async function uploadPgnFile(event: React.ChangeEvent<HTMLInputElement>) {
 const file = event.target.files?.[0];
 if (!file) return;

 await loadPgnFile(file);
 event.target.value = "";
 }

 async function handlePageDrop(event: React.DragEvent<HTMLDivElement>) {
 event.preventDefault();
 setIsPgnDragActive(false);

 const file = event.dataTransfer.files?.[0];

 if (!file) {
 setMessage("Drop a PGN file.");
 return;
 }

 await loadPgnFile(file);
 }

 function handlePageDragOver(event: React.DragEvent<HTMLDivElement>) {
 if (event.dataTransfer.types.includes("Files")) {
 event.preventDefault();
 setIsPgnDragActive(true);
 }
 }

 function handlePageDragLeave(event: React.DragEvent<HTMLDivElement>) {
 if (event.currentTarget.contains(event.relatedTarget as Node)) return;
 setIsPgnDragActive(false);
 }

 function loadSample() {
 setPgnText(`[Event "Sample Game"]
[Site "?"]
[Date "2026.01.01"]
[Round "?"]
[White "White"]
[Black "Black"]
[Result "*"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *`);
 setMessage("Sample PGN loaded.");
 }

 const board = (
 <div className="analyze-review-board">
 <ThemedChessboard
 id="AnalyzeReviewBoard"
 position={START_FEN}
 boardWidth={boardSize}

 arePiecesDraggable={false}
 showBoardNotation={true}
 customDarkSquareStyle={{ backgroundColor: "#769656" }}
 customLightSquareStyle={{ backgroundColor: "#eeeed2" }}
 customBoardStyle={{ borderRadius: "8px", overflow: "hidden" }}
 />
 </div>
 );

 const sidePanel = (
 <PanelCard>
 <div className="analyze-review-heading" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
 <SecondaryButton onClick={() => (window.location.href = "/analyze")}>
 ← Back
 </SecondaryButton>
 <SectionTitle>🧠 Game Analysis</SectionTitle>
 </div>

 <div style={{ fontSize: 13, color: "#cfcfcf", lineHeight: 1.5, marginBottom: 10 }}>
 Paste, upload, or drag a PGN file anywhere onto this page.
 </div>

 <textarea
 value={pgnText}
 onChange={(e) => setPgnText(e.target.value)}
 placeholder="Paste PGN here..."
 style={{
 width: "100%",
 minHeight: 420,
 resize: "vertical",
 background: "#2b2724",
 color: "#f3f3f3",
 border: "1px solid rgba(255,255,255,0.12)",
 borderRadius: 10,
 padding: 10,
 boxSizing: "border-box",
 fontSize: 13,
 lineHeight: 1.4,
 marginBottom: 10,
 whiteSpace: "pre-wrap",
 }}
 />

 <input
 ref={pgnFileInputRef}
 type="file"
 accept=".pgn,.txt,text/plain,application/x-chess-pgn"
 onChange={uploadPgnFile}
 style={{ display: "none" }}
 />

 <div className="analyze-review-actions" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
 <SecondaryButton onClick={() => pgnFileInputRef.current?.click()}>
 Upload PGN
 </SecondaryButton>
 <SecondaryButton onClick={loadSample}>Sample</SecondaryButton>
 </div>

 <PrimaryButton onClick={reviewGame}>Review Game</PrimaryButton>

 <div style={{ marginTop: 10, fontSize: 12, color: "#aaa", lineHeight: 1.5 }}>
 {message}
 </div>
 </PanelCard>
 );

 return (
 <div
 className="analyze-review-page"
 onDragOver={handlePageDragOver}
 onDragLeave={handlePageDragLeave}
 onDrop={handlePageDrop}
 style={{
 position: "relative",
 minHeight: "100vh",
 }}
 >
 {isPgnDragActive && (
 <div
 style={{
 position: "fixed",
 inset: 0,
 zIndex: 99999,
 background: "rgba(0, 0, 0, 0.55)",
 border: "3px dashed #7fa650",
 display: "flex",
 alignItems: "center",
 justifyContent: "center",
 color: "#f3f3f3",
 fontSize: 30,
 fontWeight: 900,
 pointerEvents: "none",
 }}
 >
 Drop PGN to review game
 </div>
 )}

 <TrainerShell
 title="Game Analysis"
 subtitle="Paste PGN and review the game"
 boardSize={boardSize}
 isDragging={isDragging}
 isHandleHovered={isHandleHovered}
 setIsDragging={setIsDragging}
 setIsHandleHovered={setIsHandleHovered}
 containerRef={containerRef}
 footerLeft="Review"
 footerRight={`${boardSize}px`}
 board={board}
 sidePanel={sidePanel}
 sidePanelWidth={520}
 />
 </div>
 );
}
