import React, { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { stockfishService } from "../../lib/chess/stockfishService";
import TrainerShell from "../../components/trainer/TrainerShell";
import ThemePiece from "../../theme/ThemePiece";
import { useGlobalBoard } from "../../hooks/useGlobalBoard";
import "./AnalyzeSubpages.css";
import {
 PanelCard,
 PrimaryButton,
 SecondaryButton,
 SectionTitle,
} from "../../components/trainer/ui";

type SetupPieceCode =
 | "wP"
 | "wN"
 | "wB"
 | "wR"
 | "wQ"
 | "wK"
 | "bP"
 | "bN"
 | "bB"
 | "bR"
 | "bQ"
 | "bK";

type DragGhost = {
 piece: SetupPieceCode;
 x: number;
 y: number;
 dropping: boolean;
 origin: "palette" | "board";
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

function setupSideToMove(fen: string) {
 return fen.split(" ")[1] === "b" ? "black" : "white"
}

function formatSetupEvalFromEngine(
 info: { scoreCp?: number; cp?: number; mate?: number },
 fen: string,
) {
 const turn = setupSideToMove(fen)

 if (typeof info.mate === "number") {
 const whiteMate = turn === "white" ? info.mate : -info.mate
 return "M" + whiteMate
 }

 const rawCp =
 typeof info.scoreCp === "number"
 ? info.scoreCp
 : typeof info.cp === "number"
 ? info.cp
 : 0

 const whiteCp = turn === "white" ? rawCp : -rawCp
 const pawns = whiteCp / 100

 if (Math.abs(pawns) < 0.05) return "0.0"
 return (pawns > 0 ? "+" : "") + pawns.toFixed(1)
}

function getSetupEvalBarPercent(evalText: string) {
 const text = evalText.trim()

 if (!text || text === " - " || text === "..." || text === "-" || text === " - ") {
 return 50
 }

 let whiteScore = 0

 if (text.startsWith("M")) {
 const mateNumber = Number(text.slice(1))

 if (!Number.isFinite(mateNumber) || mateNumber === 0) return 50

 whiteScore = mateNumber > 0 ? 100 : -100
 } else {
 const parsed = Number(text.replace("+", ""))

 if (!Number.isFinite(parsed)) return 50

 whiteScore = parsed
 }

 const percent = 50 + Math.tanh(whiteScore / 6) * 48

 return Math.max(2, Math.min(98, percent))
}
const START_FEN = new Chess().fen();


const SETUP_PIECES: { code: SetupPieceCode; label: string }[] = [
 { code: "bP", label: "Black pawn" },
 { code: "bB", label: "Black bishop" },
 { code: "bN", label: "Black knight" },
 { code: "bR", label: "Black rook" },
 { code: "bQ", label: "Black queen" },
 { code: "bK", label: "Black king" },
 { code: "wP", label: "White pawn" },
 { code: "wB", label: "White bishop" },
 { code: "wN", label: "White knight" },
 { code: "wR", label: "White rook" },
 { code: "wQ", label: "White queen" },
 { code: "wK", label: "White king" },
];

function isSetupPieceCode(value: string): value is SetupPieceCode {
 return SETUP_PIECES.some((piece) => piece.code === value);
}

export default function SetupPositionPage() {
 const containerRef = useRef<HTMLDivElement | null>(null);
 const setupBoardWrapRef = useRef<HTMLDivElement | null>(null);

 const [boardSize, setBoardSize] = useState(720);
 const [isDragging, setIsDragging] = useState(false);
 const [isHandleHovered, setIsHandleHovered] = useState(false);
 const [board, setBoard] = useState<Record<string, SetupPieceCode>>({});
 const [selectedPiece, setSelectedPiece] = useState<SetupPieceCode | "clear">("wK");
 const [turn, setTurn] = useState<"w" | "b">("w");
 const [boardOrientation, setBoardOrientation] = useState<"white" | "black">("white");
 const [castling, setCastling] = useState({
 K: true,
 Q: true,
 k: true,
 q: true,
 });
 const [message, setMessage] = useState("Build a position, then load it in analysis.");
 const [dragGhost, setDragGhost] = useState<DragGhost | null>(null);
 const [setupEvalText, setSetupEvalText] = useState(" - ");

 const squareSize = boardSize / 8;

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

 useEffect(() => {
 const params = new URLSearchParams(window.location.search);
 loadFenToSetup(params.get("fen") || START_FEN);
 }, []);
 // setup-live-eval-effect
 useEffect(() => {
 let cancelled = false

 setSetupEvalText(" - ")

 const timer = window.setTimeout(async () => {
 try {
 const currentFen = buildFen()

 new Chess(currentFen)

 await stockfishService.init()

 const info = await stockfishService.getEvaluation(currentFen, {
 moveTime: 250,
 })

 if (cancelled) return

 setSetupEvalText(formatSetupEvalFromEngine(info, currentFen))
 } catch {
 if (!cancelled) {
 setSetupEvalText(" - ")
 }
 }
 }, 350)

 return () => {
 cancelled = true
 window.clearTimeout(timer)
 }
 }, [board, turn, castling])


 useEffect(() => {
 if (!dragGhost || dragGhost.dropping) return;

 function onPointerMove(event: PointerEvent) {
 setDragGhost((current) =>
 current && !current.dropping
 ? { ...current, x: event.clientX, y: event.clientY }
 : current,
 );
 }

 function onPointerUp(event: PointerEvent) {
 const square = squareFromClientPoint(event.clientX, event.clientY);

 if (!square) {
 if (dragGhost.origin === "board") {
 setMessage("Piece removed from board.");
 }

 setDragGhost(null);
 return;
 }

 const droppedPiece = dragGhost.piece;
 const center = clientPointFromSetupSquare(square);

 if (center) {
 setDragGhost({
 piece: droppedPiece,
 x: center.x,
 y: center.y,
 dropping: true,
 origin: dragGhost.origin,
 });
 }

 requestAnimationFrame(() => {
 setBoard((current) => ({
 ...current,
 [square]: droppedPiece,
 }));
 });

 window.setTimeout(() => {
 setDragGhost(null);
 }, 650);
 }

 window.addEventListener("pointermove", onPointerMove);
 window.addEventListener("pointerup", onPointerUp);
 window.addEventListener("pointercancel", onPointerUp);

 return () => {
 window.removeEventListener("pointermove", onPointerMove);
 window.removeEventListener("pointerup", onPointerUp);
 window.removeEventListener("pointercancel", onPointerUp);
 };
 }, [dragGhost]);

 function loadFenToSetup(fen: string) {
 try {
 const temp = new Chess(fen);
 const nextBoard: Record<string, SetupPieceCode> = {};

 temp.board().forEach((rank, rankIndex) => {
 const boardRank = 8 - rankIndex;

 rank.forEach((piece, fileIndex) => {
 if (!piece) return;

 const square = `${FILES[fileIndex]}${boardRank}`;
 const code = `${piece.color}${piece.type.toUpperCase()}`;

 if (isSetupPieceCode(code)) nextBoard[square] = code;
 });
 });

 const parts = temp.fen().split(" ");
 const castlingText = parts[2] || "-";

 setBoard(nextBoard);
 setTurn(parts[1] === "b" ? "b" : "w");
 setCastling({
 K: castlingText.includes("K"),
 Q: castlingText.includes("Q"),
 k: castlingText.includes("k"),
 q: castlingText.includes("q"),
 });
 } catch {
 const temp = new Chess();
 const nextBoard: Record<string, SetupPieceCode> = {};

 temp.board().forEach((rank, rankIndex) => {
 const boardRank = 8 - rankIndex;

 rank.forEach((piece, fileIndex) => {
 if (!piece) return;

 const square = `${FILES[fileIndex]}${boardRank}`;
 const code = `${piece.color}${piece.type.toUpperCase()}`;

 if (isSetupPieceCode(code)) nextBoard[square] = code;
 });
 });

 setBoard(nextBoard);
 setTurn("w");
 setCastling({ K: true, Q: true, k: true, q: true });
 }
 }

 function buildFen() {
 const ranks: string[] = [];

 for (let rank = 8; rank >= 1; rank--) {
 let row = "";
 let empty = 0;

 for (const file of FILES) {
 const piece = board[`${file}${rank}`];

 if (!piece) {
 empty++;
 continue;
 }

 if (empty > 0) {
 row += empty;
 empty = 0;
 }

 const pieceLetter = piece[1];
 row += piece[0] === "w" ? pieceLetter : pieceLetter.toLowerCase();
 }

 if (empty > 0) row += empty;
 ranks.push(row);
 }

 const castlingText =
 (castling.K ? "K" : "") +
 (castling.Q ? "Q" : "") +
 (castling.k ? "k" : "") +
 (castling.q ? "q" : "");

 return `${ranks.join("/")} ${turn} ${castlingText || "-"} - 0 1`;
 }

 function squareFromClientPoint(clientX: number, clientY: number) {
 const rect = setupBoardWrapRef.current?.getBoundingClientRect();
 if (!rect) return "";

 const x = clientX - rect.left;
 const y = clientY - rect.top;

 if (x < 0 || y < 0 || x > rect.width || y > rect.height) return "";

 const rawFileIndex = Math.max(0, Math.min(7, Math.floor((x / rect.width) * 8)));
 const rawRankIndex = Math.max(0, Math.min(7, Math.floor((y / rect.height) * 8)));

 const fileIndex = boardOrientation === "white" ? rawFileIndex : 7 - rawFileIndex;
 const rank = boardOrientation === "white" ? 8 - rawRankIndex : rawRankIndex + 1;

 return `${FILES[fileIndex]}${rank}`;
 }

 function clientPointFromSetupSquare(square: string) {
 const rect = setupBoardWrapRef.current?.getBoundingClientRect();
 if (!rect || square.length < 2) return null;

 const rawFileIndex = FILES.indexOf(square[0] as (typeof FILES)[number]);
 const rank = Number(square[1]);
 const rawRankIndex = 8 - rank;

 if (rawFileIndex < 0 || rawRankIndex < 0 || rawRankIndex > 7) return null;

 const fileIndex = boardOrientation === "white" ? rawFileIndex : 7 - rawFileIndex;
 const rankIndex = boardOrientation === "white" ? rawRankIndex : 7 - rawRankIndex;
 const size = rect.width / 8;

 return {
 x: rect.left + fileIndex * size + size / 2,
 y: rect.top + rankIndex * size + size / 2,
 };
 }

 function startBoardSquarePointerDown(
 event: React.PointerEvent<HTMLDivElement>,
 square: string,
 ) {
 event.preventDefault();
 event.stopPropagation();

 if (dragGhost) return;

 const piece = board[square];

 if (selectedPiece === "clear") {
 if (!piece) return;

 setBoard((current) => {
 const next = { ...current };
 delete next[square];
 return next;
 });
 return;
 }

 if (!piece) {
 setBoard((current) => ({
 ...current,
 [square]: selectedPiece,
 }));
 return;
 }

 setSelectedPiece(piece);

 setBoard((current) => {
 const next = { ...current };
 delete next[square];
 return next;
 });

 setDragGhost({
 piece,
 x: event.clientX,
 y: event.clientY,
 dropping: false,
 origin: "board",
 });
 }

 function startPaletteDrag(
 event: React.PointerEvent<HTMLButtonElement>,
 piece: SetupPieceCode,
 ) {
 event.preventDefault();

 setSelectedPiece(piece);
 setDragGhost({
 piece,
 x: event.clientX,
 y: event.clientY,
 dropping: false,
 origin: "palette",
 });
 }

 function clearBoard() {
 setBoard({});
 setCastling({ K: false, Q: false, k: false, q: false });
 setMessage("Board cleared. Add both kings before loading.");
 }

 function downloadPgn() {
 const fen = buildFen()

 try {
 new Chess(fen)
 } catch {
 setMessage('Invalid position. PGN was not downloaded.')
 return
 }

 const date = new Date().toISOString().slice(0, 10).replace(/-/g, '.')
 const fileStamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
 const safeFenPart = fen
 .split(' ')[0]
 .replace(/[^a-zA-Z0-9]+/g, '-')
 .replace(/^-+|-+$/g, '')
 .slice(0, 36)

 const pgn = [
 '[Event "Setup Position"]',
 '[Site "Weiss Chess Trainer"]',
 '[Date "' + date + '"]',
 '[Round "-"]',
 '[White "?"]',
 '[Black "?"]',
 '[Result "*"]',
 '[SetUp "1"]',
 '[FEN "' + fen + '"]',
 '',
 '*',
 '',
 ].join('\n')

 const blob = new Blob([pgn], {
 type: 'application/x-chess-pgn;charset=utf-8',
 })

 const url = URL.createObjectURL(blob)
 const link = document.createElement('a')
 link.href = url
 link.download = 'setup-position-' + (safeFenPart || fileStamp) + '.pgn'
 document.body.appendChild(link)
 link.click()
 link.remove()
 URL.revokeObjectURL(url)

 setMessage('PGN downloaded.')
 }

 function createSetupPgn() {
 const fen = buildFen()
 const date = new Date().toISOString().slice(0, 10).replace(/-/g, '.')

 return [
 '[Event "Setup Position"]',
 '[Site "Weiss Chess Trainer"]',
 '[Date "' + date + '"]',
 '[Round "-"]',
 '[White "?"]',
 '[Black "?"]',
 '[Result "*"]',
 '[SetUp "1"]',
 '[FEN "' + fen + '"]',
 '',
 '*',
 '',
 ].join('\n')
 }

 function checkPosition() {
 const fen = buildFen()

 try {
 new Chess(fen)
 setMessage('Position is legal.')
 return true
 } catch {
 setMessage('Invalid position. Check kings, side to move, and castling rights.')
 return false
 }
 }

 async function copyFen() {
 const fen = buildFen()

 try {
 new Chess(fen)
 await navigator.clipboard.writeText(fen)
 setMessage('FEN copied.')
 } catch {
 setMessage('Could not copy FEN. Check that the position is legal.')
 }
 }

 async function copyPgn() {
 try {
 new Chess(buildFen())
 await navigator.clipboard.writeText(createSetupPgn())
 setMessage('PGN copied.')
 } catch {
 setMessage('Could not copy PGN. Check that the position is legal.')
 }
 }

 function loadStartPosition() {
 loadFenToSetup(START_FEN)
 setMessage('Starting position loaded.')
 }

 function loadInAnalyze() {
 const fen = buildFen();
 const setupEvalPercent = getSetupEvalBarPercent(setupEvalText)

 const setupEvalMiniBar = (
 <div
 data-name="setup-panel-eval-bar"
 title={"Evaluation: " + setupEvalText}
 style={{
 margin: "8px 0 10px",
 padding: 8,
 borderRadius: 10,
 background: "#211e1b",
 border: "1px solid rgba(255,255,255,0.08)",
 }}
 >
 <div
 style={{
 display: "flex",
 justifyContent: "space-between",
 alignItems: "center",
 fontSize: 11,
 fontWeight: 800,
 marginBottom: 6,
 }}
 >
 <span>Live Eval</span>
 <span>{setupEvalText}</span>
 </div>

 <div
 style={{
 position: "relative",
 height: 14,
 borderRadius: 999,
 overflow: "hidden",
 background: "#302d2a",
 border: "1px solid rgba(255,255,255,0.1)",
 }}
 >
 <div
 style={{
 width: setupEvalPercent + "%",
 height: "100%",
 background: "#f1f1e8",
 transition: "width 0.25s ease",
 }}
 />
 <div
 style={{
 position: "absolute",
 left: "50%",
 top: 0,
 bottom: 0,
 width: 1,
 background: "rgba(0,0,0,0.35)",
 }}
 />
 </div>
 </div>
 )


 try {
 new Chess(fen);
 window.location.href = `/analyze/board?fen=${encodeURIComponent(fen)}`;
 } catch {
 setMessage("Invalid position. Make sure both kings are legal.");
 }
 }

 const fen = buildFen();
 const setupEvalPercent = getSetupEvalBarPercent(setupEvalText)

 const setupEvalMiniBar = (
 <div
 data-name="setup-panel-eval-bar"
 title={"Evaluation: " + setupEvalText}
 style={{
 margin: "8px 0 10px",
 padding: 8,
 borderRadius: 10,
 background: "#211e1b",
 border: "1px solid rgba(255,255,255,0.08)",
 }}
 >
 <div
 style={{
 display: "flex",
 justifyContent: "space-between",
 alignItems: "center",
 fontSize: 11,
 fontWeight: 800,
 marginBottom: 6,
 }}
 >
 <span>Live Eval</span>
 <span>{setupEvalText}</span>
 </div>

 <div
 style={{
 position: "relative",
 height: 14,
 borderRadius: 999,
 overflow: "hidden",
 background: "#302d2a",
 border: "1px solid rgba(255,255,255,0.1)",
 }}
 >
 <div
 style={{
 width: setupEvalPercent + "%",
 height: "100%",
 background: "#f1f1e8",
 transition: "width 0.25s ease",
 }}
 />
 <div
 style={{
 position: "absolute",
 left: "50%",
 top: 0,
 bottom: 0,
 width: 1,
 background: "rgba(0,0,0,0.35)",
 }}
 />
 </div>
 </div>
 )


 function flipSetupBoard() {
 setBoardOrientation((current) => (current === "white" ? "black" : "white"));
 }

 const setupGlobalBoardState = useMemo(
 () => ({
 isAvailable: true,
 fen,
 suggestedColor: boardOrientation,
 canFlip: true,
 onFlip: flipSetupBoard,
 }),
 [fen, boardOrientation],
 );

 useGlobalBoard(setupGlobalBoardState);

 const boardArea = (
 <div
 ref={setupBoardWrapRef}
 style={{
 width: boardSize,
 height: boardSize,
 display: "grid",
 gridTemplateColumns: "repeat(8, 1fr)",
 gridTemplateRows: "repeat(8, 1fr)",
 borderRadius: 8,
 overflow: "hidden",
 touchAction: "none",
 boxShadow: "0 0 0 1px rgba(0,0,0,0.25)",
 }}
 >
 {Array.from({ length: 64 }).map((_, index) => {
 const rawFileIndex = index % 8;
 const rawRankIndex = Math.floor(index / 8);
 const fileIndex = boardOrientation === "white" ? rawFileIndex : 7 - rawFileIndex;
 const rankIndex = boardOrientation === "white" ? rawRankIndex : 7 - rawRankIndex;
 const file = FILES[fileIndex];
 const rank = 8 - rankIndex;
 const square = `${file}${rank}`;
 const piece = board[square];
 const isLight = (rawFileIndex + rawRankIndex) % 2 === 0;

 return (
 <div
 key={square}
 onPointerDown={(event) => startBoardSquarePointerDown(event, square)}
 style={{
 position: "relative",
 width: "100%",
 height: "100%",
 background: isLight ? "#eeeed2" : "#769656",
 cursor:
 selectedPiece === "clear"
 ? "not-allowed"
 : piece
 ? "grab"
 : "copy",
 touchAction: "none",
 userSelect: "none",
 }}
 >
 {piece && (
 <ThemePiece
 code={piece}
 size={squareSize}
 label={piece}
 style={{
 width: "100%",
 height: "100%",
 display: "block",
 pointerEvents: "none",
 userSelect: "none",
 }}
 />
 )}

 {rawFileIndex === 0 && (
 <span
 style={{
 position: "absolute",
 top: 2,
 left: 4,
 fontSize: 11,
 fontWeight: 800,
 color: isLight ? "#769656" : "#eeeed2",
 pointerEvents: "none",
 }}
 >
 {rank}
 </span>
 )}

 {rank === 1 && (
 <span
 style={{
 position: "absolute",
 right: 4,
 bottom: 2,
 fontSize: 11,
 fontWeight: 800,
 color: isLight ? "#769656" : "#eeeed2",
 pointerEvents: "none",
 }}
 >
 {file}
 </span>
 )}
 </div>
 );
 })}
 </div>
 );

 const sidePanel = (
 <PanelCard>
 <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
 <SecondaryButton onClick={() => (window.location.href = "/analyze")}>
 ← Back
 </SecondaryButton>
 <SectionTitle>＋ Setup Position</SectionTitle>
 </div>

 <div style={{ background: "#2b2724", borderRadius: 10, padding: 10, marginBottom: 10 }}>
 <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
 {SETUP_PIECES.map((piece) => (
 <button
 key={piece.code}
 onClick={() => setSelectedPiece(piece.code)}
 onPointerDown={(event) => startPaletteDrag(event, piece.code)}
 title={piece.label}
 draggable={false}
 style={{
 border:
 selectedPiece === piece.code
 ? "1px solid #b9e58a"
 : "1px solid rgba(255,255,255,0.12)",
 borderRadius: 8,
 background:
 selectedPiece === piece.code
 ? piece.code.startsWith("b")
   ? "#b7c99a"
   : "#3b4f27"
 : piece.code.startsWith("b")
   ? "#e8e4da"
   : "#33302d",
 padding: 4,
 cursor: "grab",
 touchAction: "none",
 minHeight: 48,
 }}
 >
 <ThemePiece
 code={piece.code}
 size={38}
 label={piece.label}
 style={{
 width: 38,
 height: 38,
 display: "block",
 margin: "0 auto",
 pointerEvents: "none",
 }}
 />
 </button>
 ))}
 </div>
 </div>

 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
 <SecondaryButton onClick={() => setSelectedPiece("clear")}>
 Clear Tool{selectedPiece === "clear" ? " *" : ""}
 </SecondaryButton>
 <SecondaryButton onClick={() => loadFenToSetup(START_FEN)}>
 Start
 </SecondaryButton>
 <SecondaryButton onClick={clearBoard}>🗑 Empty</SecondaryButton>
 </div>

 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
 <SecondaryButton onClick={() => setTurn("w")}>
 ⬜ White to move{turn === "w" ? " *" : ""}
 </SecondaryButton>
 <SecondaryButton onClick={() => setTurn("b")}>
 ⬛ Black to move{turn === "b" ? " *" : ""}
 </SecondaryButton>
 </div>

 <div
 style={{
 display: "grid",
 gridTemplateColumns: "1fr 1fr",
 gap: 8,
 fontSize: 13,
 color: "#cfcfcf",
 marginBottom: 10,
 }}
 >
 <label>
 <input
 type="checkbox"
 checked={castling.K}
 onChange={(e) => setCastling((c) => ({ ...c, K: e.target.checked }))}
 />{" "}
 White O-O
 </label>
 <label>
 <input
 type="checkbox"
 checked={castling.Q}
 onChange={(e) => setCastling((c) => ({ ...c, Q: e.target.checked }))}
 />{" "}
 White O-O-O
 </label>
 <label>
 <input
 type="checkbox"
 checked={castling.k}
 onChange={(e) => setCastling((c) => ({ ...c, k: e.target.checked }))}
 />{" "}
 Black O-O
 </label>
 <label>
 <input
 type="checkbox"
 checked={castling.q}
 onChange={(e) => setCastling((c) => ({ ...c, q: e.target.checked }))}
 />{" "}
 Black O-O-O
 </label>
 </div>

 <textarea
 value={fen}
 readOnly
 style={{
 width: "100%",
 minHeight: 58,
 resize: "vertical",
 background: "#2b2724",
 color: "#f3f3f3",
 border: "1px solid rgba(255,255,255,0.12)",
 borderRadius: 10,
 padding: 10,
 boxSizing: "border-box",
 fontSize: 12,
 lineHeight: 1.4,
 marginBottom: 10,
 }}
 />

 {setupEvalMiniBar}

 <PrimaryButton onClick={loadInAnalyze}>Load in Analysis</PrimaryButton>
 <SecondaryButton onClick={downloadPgn}>
 Download PGN
 </SecondaryButton>
 <SecondaryButton onClick={copyFen}>
 Copy FEN
 </SecondaryButton>

 <SecondaryButton onClick={copyPgn}>
 Copy PGN
 </SecondaryButton>

 <SecondaryButton onClick={checkPosition}>
 Check Position
 </SecondaryButton>

 <div style={{ marginTop: 10, fontSize: 12, color: "#aaa", lineHeight: 1.5 }}>
 {message}
 </div>
 </PanelCard>
 );

 const dragLayer = dragGhost ? (
 <ThemePiece
 code={dragGhost.piece}
 size={squareSize}
 label="Dragging piece"
 style={{
 position: "fixed",
 left: dragGhost.x - squareSize / 2,
 top: dragGhost.y - squareSize / 2,
 width: squareSize,
 height: squareSize,
 zIndex: 999999,
 pointerEvents: "none",
 userSelect: "none",
 opacity: 1,
 transition: "none",
 transform: "translate3d(0, 0, 0)",
 willChange: "left, top",
 }}
 />
 ) : null;

 return (
 <div className="setup-position-page">
 <TrainerShell
 title="Setup Position"
 subtitle="Build a custom FEN"
 boardSize={boardSize}
 isDragging={isDragging}
 isHandleHovered={isHandleHovered}
 setIsDragging={setIsDragging}
 setIsHandleHovered={setIsHandleHovered}
 containerRef={containerRef}
 footerLeft="Setup"
 footerRight={`${boardSize}px`}
 board={boardArea}
 sidePanel={sidePanel}
 sidePanelWidth={520}
 />
 {dragLayer}
 </div>
 );
}
