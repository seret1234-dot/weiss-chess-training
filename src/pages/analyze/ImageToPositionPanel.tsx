import React, { useMemo, useState } from "react";
import { Chess } from "chess.js";
import {
 PrimaryButton,
 SecondaryButton,
 SectionTitle,
} from "../../components/trainer/ui";

type PieceCode =
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

type BoardMap = Record<string, PieceCode>;

type ImageToPositionPanelProps = {
 initialFen: string;
 onLoadFen: (fen: string) => void;
 onClose: () => void;
};

const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

const PIECE_SYMBOLS: Record<PieceCode, string> = {
 wP: "♙",
 wN: "♘",
 wB: "♗",
 wR: "♖",
 wQ: "♕",
 wK: "♔",
 bP: "♟",
 bN: "♞",
 bB: "♝",
 bR: "♜",
 bQ: "♛",
 bK: "♚",
};

const PIECE_TO_FEN: Record<PieceCode, string> = {
 wP: "P",
 wN: "N",
 wB: "B",
 wR: "R",
 wQ: "Q",
 wK: "K",
 bP: "p",
 bN: "n",
 bB: "b",
 bR: "r",
 bQ: "q",
 bK: "k",
};

const FEN_TO_PIECE: Record<string, PieceCode> = {
 P: "wP",
 N: "wN",
 B: "wB",
 R: "wR",
 Q: "wQ",
 K: "wK",
 p: "bP",
 n: "bN",
 b: "bB",
 r: "bR",
 q: "bQ",
 k: "bK",
};

function fenToBoardMap(fen: string): BoardMap {
 const board: BoardMap = {};

 try {
 const placement = fen.split(" ")[0];
 const ranks = placement.split("/");

 ranks.forEach((rankText, rankIndex) => {
 const rank = 8 - rankIndex;
 let fileIndex = 0;

 for (const char of rankText) {
 if (/\d/.test(char)) {
 fileIndex += Number(char);
 continue;
 }

 const piece = FEN_TO_PIECE[char];
 const file = FILES[fileIndex];
 if (piece && file) board[`${file}${rank}`] = piece;
 fileIndex++;
 }
 });
 } catch {
 return {};
 }

 return board;
}

function boardMapToFenPlacement(board: BoardMap) {
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
 row += String(empty);
 empty = 0;
 }

 row += PIECE_TO_FEN[piece];
 }

 if (empty > 0) row += String(empty);
 ranks.push(row);
 }

 return ranks.join("/");
}

function squareFromDisplay(row: number, col: number, orientation: "white" | "black") {
 if (orientation === "white") {
 return `${FILES[col]}${8 - row}`;
 }

 return `${FILES[7 - col]}${row + 1}`;
}

function displaySquares(orientation: "white" | "black") {
 return Array.from({ length: 64 }, (_, index) => {
 const row = Math.floor(index / 8);
 const col = index % 8;
 return squareFromDisplay(row, col, orientation);
 });
}

function hasOriginalPiece(board: BoardMap, square: string, piece: PieceCode) {
 return board[square] === piece;
}

function guessCastling(board: BoardMap) {
 let rights = "";

 if (
 hasOriginalPiece(board, "e1", "wK") &&
 hasOriginalPiece(board, "h1", "wR")
 ) {
 rights += "K";
 }

 if (
 hasOriginalPiece(board, "e1", "wK") &&
 hasOriginalPiece(board, "a1", "wR")
 ) {
 rights += "Q";
 }

 if (
 hasOriginalPiece(board, "e8", "bK") &&
 hasOriginalPiece(board, "h8", "bR")
 ) {
 rights += "k";
 }

 if (
 hasOriginalPiece(board, "e8", "bK") &&
 hasOriginalPiece(board, "a8", "bR")
 ) {
 rights += "q";
 }

 return rights || "-";
}

function normalizeCastling(value: string) {
 const ordered = ["K", "Q", "k", "q"].filter((char) => value.includes(char));
 return ordered.join("") || "-";
}

export default function ImageToPositionPanel({
 initialFen,
 onLoadFen,
 onClose,
}: ImageToPositionPanelProps) {
 const [imageUrl, setImageUrl] = useState("");
 const [board, setBoard] = useState<BoardMap>(() => fenToBoardMap(initialFen));
 const [selectedPiece, setSelectedPiece] = useState<PieceCode | "erase">("wP");
 const [orientation, setOrientation] = useState<"white" | "black">("white");
 const [sideToMove, setSideToMove] = useState<"w" | "b">(() =>
 initialFen.split(" ")[1] === "b" ? "b" : "w",
 );
 const [castling, setCastling] = useState(() => {
 const fenCastle = initialFen.split(" ")[2];
 return fenCastle && fenCastle !== "-" ? normalizeCastling(fenCastle) : "-";
 });
 const [status, setStatus] = useState(
 "Upload a board image, then place/correct the pieces and load the FEN.",
 );

 const squares = useMemo(() => displaySquares(orientation), [orientation]);

 const fen = useMemo(() => {
 const placement = boardMapToFenPlacement(board);
 const castle = normalizeCastling(castling);
 return `${placement} ${sideToMove} ${castle} - 0 1`;
 }, [board, sideToMove, castling]);

 function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>) {
 const file = event.target.files?.[0];
 if (!file) return;

 const url = URL.createObjectURL(file);
 setImageUrl(url);
 setStatus("Image loaded. Use the piece palette and click squares to build the position.");
 event.target.value = "";
 }

 function setStandardBoard() {
 const start = new Chess().fen();
 setBoard(fenToBoardMap(start));
 setSideToMove("w");
 setCastling("KQkq");
 setStatus("Starting position loaded into the editor.");
 }

 function clearBoard() {
 setBoard({});
 setCastling("-");
 setStatus("Board cleared.");
 }

 function loadCurrentFen() {
 setBoard(fenToBoardMap(initialFen));
 setSideToMove(initialFen.split(" ")[1] === "b" ? "b" : "w");
 setCastling(normalizeCastling(initialFen.split(" ")[2] || "-"));
 setStatus("Current Analyze position loaded into the editor.");
 }

 function placePiece(square: string) {
 setBoard((current) => {
 const next = { ...current };

 if (selectedPiece === "erase") {
 delete next[square];
 } else {
 next[square] = selectedPiece;
 }

 return next;
 });
 }

 function toggleCastling(right: string) {
 setCastling((current) => {
 const normalized = normalizeCastling(current);
 const active = normalized !== "-" && normalized.includes(right);
 const next = active
 ? normalized.replace(right, "")
 : `${normalized === "-" ? "" : normalized}${right}`;

 return normalizeCastling(next);
 });
 }

 function loadFen() {
 const castle = normalizeCastling(castling);
 const finalFen = `${boardMapToFenPlacement(board)} ${sideToMove} ${castle} - 0 1`;

 try {
 new Chess(finalFen);
 onLoadFen(finalFen);
 onClose();
 } catch {
 setStatus("Invalid position. Make sure each side has exactly one king and the side to move is legal.");
 }
 }

 function useGuessedCastling() {
 setCastling(guessCastling(board));
 setStatus("Castling rights guessed from king and rook home squares. Check this manually.");
 }

 return (
 <div
 style={{
 position: "fixed",
 inset: 0,
 zIndex: 10000,
 background: "rgba(0,0,0,0.72)",
 display: "flex",
 alignItems: "center",
 justifyContent: "center",
 padding: 18,
 boxSizing: "border-box",
 }}
 >
 <div
 style={{
 width: "min(1180px, 96vw)",
 maxHeight: "94vh",
 overflow: "hidden",
 borderRadius: 14,
 background: "#171513",
 border: "1px solid rgba(255,255,255,0.12)",
 boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
 color: "#f3f3f3",
 display: "grid",
 gridTemplateColumns: "minmax(420px, 1fr) 380px",
 gap: 14,
 padding: 14,
 boxSizing: "border-box",
 }}
 >
 <div>
 <div
 style={{
 display: "flex",
 alignItems: "center",
 justifyContent: "space-between",
 marginBottom: 10,
 }}
 >
 <div>
 <SectionTitle>Image to Position</SectionTitle>
 <div style={{ color: "#aaa", fontSize: 12 }}>
 First version: image background + manual correction to FEN.
 </div>
 </div>
 <SecondaryButton onClick={onClose}>Close</SecondaryButton>
 </div>

 <div
 style={{
 position: "relative",
 width: "min(66vh, 620px)",
 height: "min(66vh, 620px)",
 maxWidth: "100%",
 margin: "0 auto",
 background: "#211e1b",
 borderRadius: 10,
 overflow: "hidden",
 border: "1px solid rgba(255,255,255,0.12)",
 }}
 >
 {imageUrl ? (
 <img
 src={imageUrl}
 alt="Uploaded chess board"
 style={{
 position: "absolute",
 inset: 0,
 width: "100%",
 height: "100%",
 objectFit: "cover",
 opacity: 0.72,
 }}
 />
 ) : (
 <div
 style={{
 position: "absolute",
 inset: 0,
 display: "flex",
 alignItems: "center",
 justifyContent: "center",
 textAlign: "center",
 color: "#aaa",
 padding: 20,
 lineHeight: 1.5,
 }}
 >
 Upload a board image. For now, the image is used as a guide and you place/correct the pieces manually.
 </div>
 )}

 <div
 style={{
 position: "absolute",
 inset: 0,
 display: "grid",
 gridTemplateColumns: "repeat(8, 1fr)",
 gridTemplateRows: "repeat(8, 1fr)",
 }}
 >
 {squares.map((square, index) => {
 const row = Math.floor(index / 8);
 const col = index % 8;
 const isLight = (row + col) % 2 === 0;
 const piece = board[square];

 return (
 <button
 key={square}
 onClick={() => placePiece(square)}
 title={square}
 style={{
 border: "1px solid rgba(255,255,255,0.12)",
 background: isLight
 ? "rgba(238,238,210,0.28)"
 : "rgba(118,150,86,0.38)",
 color: piece?.startsWith("w") ? "#fff" : "#111",
 textShadow: piece?.startsWith("w")
 ? "0 2px 4px #000"
 : "0 1px 3px #fff",
 fontSize: "clamp(24px, 6vh, 54px)",
 lineHeight: 1,
 fontWeight: 900,
 cursor: "pointer",
 display: "flex",
 alignItems: "center",
 justifyContent: "center",
 padding: 0,
 }}
 >
 {piece ? PIECE_SYMBOLS[piece] : ""}
 </button>
 );
 })}
 </div>
 </div>
 </div>

 <div
 style={{
 display: "flex",
 flexDirection: "column",
 gap: 10,
 minHeight: 0,
 overflowY: "auto",
 paddingRight: 4,
 }}
 >
 <div
 style={{
 background: "#211e1b",
 borderRadius: 10,
 padding: 10,
 border: "1px solid rgba(255,255,255,0.08)",
 }}
 >
 <SectionTitle>1. Image</SectionTitle>
 <input
 type="file"
 accept="image/*"
 onChange={handleImageUpload}
 style={{ width: "100%" }}
 />
 </div>

 <div
 style={{
 background: "#211e1b",
 borderRadius: 10,
 padding: 10,
 border: "1px solid rgba(255,255,255,0.08)",
 }}
 >
 <SectionTitle>2. Pieces</SectionTitle>
 <div
 style={{
 display: "grid",
 gridTemplateColumns: "repeat(6, 1fr)",
 gap: 6,
 marginBottom: 8,
 }}
 >
 {(Object.keys(PIECE_SYMBOLS) as PieceCode[]).map((piece) => (
 <button
 key={piece}
 onClick={() => setSelectedPiece(piece)}
 style={{
 borderRadius: 8,
 border:
 selectedPiece === piece
 ? "2px solid #7fa650"
 : "1px solid rgba(255,255,255,0.12)",
 background: selectedPiece === piece ? "#31451f" : "#2b2724",
 color: piece.startsWith("w") ? "#fff" : "#111",
 textShadow: piece.startsWith("w")
 ? "0 2px 4px #000"
 : "0 1px 3px #fff",
 fontSize: 30,
 lineHeight: 1.1,
 padding: "6px 0",
 cursor: "pointer",
 }}
 >
 {PIECE_SYMBOLS[piece]}
 </button>
 ))}
 </div>

 <button
 onClick={() => setSelectedPiece("erase")}
 style={{
 width: "100%",
 borderRadius: 8,
 border:
 selectedPiece === "erase"
 ? "2px solid #f87171"
 : "1px solid rgba(255,255,255,0.12)",
 background: selectedPiece === "erase" ? "#5a2626" : "#2b2724",
 color: "#f3f3f3",
 padding: "8px 0",
 cursor: "pointer",
 fontWeight: 800,
 }}
 >
 Erase piece
 </button>
 </div>

 <div
 style={{
 background: "#211e1b",
 borderRadius: 10,
 padding: 10,
 border: "1px solid rgba(255,255,255,0.08)",
 }}
 >
 <SectionTitle>3. Position details</SectionTitle>

 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
 <SecondaryButton onClick={() => setOrientation("white")}>
 View White
 </SecondaryButton>
 <SecondaryButton onClick={() => setOrientation("black")}>
 View Black
 </SecondaryButton>
 </div>

 <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
 <label style={{ fontSize: 12, color: "#cfcfcf" }}>
 Side to move
 <select
 value={sideToMove}
 onChange={(e) => setSideToMove(e.target.value as "w" | "b")}
 style={{
 width: "100%",
 marginTop: 4,
 background: "#2b2724",
 color: "#f3f3f3",
 border: "1px solid rgba(255,255,255,0.12)",
 borderRadius: 8,
 padding: 8,
 }}
 >
 <option value="w">White</option>
 <option value="b">Black</option>
 </select>
 </label>

 <label style={{ fontSize: 12, color: "#cfcfcf" }}>
 Castling
 <input
 value={castling}
 onChange={(e) => setCastling(e.target.value)}
 placeholder="KQkq or -"
 style={{
 width: "100%",
 marginTop: 4,
 boxSizing: "border-box",
 background: "#2b2724",
 color: "#f3f3f3",
 border: "1px solid rgba(255,255,255,0.12)",
 borderRadius: 8,
 padding: 8,
 }}
 />
 </label>
 </div>

 <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 8 }}>
 {["K", "Q", "k", "q"].map((right) => (
 <button
 key={right}
 onClick={() => toggleCastling(right)}
 style={{
 border: "1px solid rgba(255,255,255,0.12)",
 borderRadius: 8,
 background:
 normalizeCastling(castling).includes(right) && castling !== "-"
 ? "#31451f"
 : "#2b2724",
 color: "#f3f3f3",
 padding: "6px 0",
 cursor: "pointer",
 fontWeight: 800,
 }}
 >
 {right}
 </button>
 ))}
 </div>

 <SecondaryButton onClick={useGuessedCastling}>
 Guess castling from pieces
 </SecondaryButton>
 </div>

 <div
 style={{
 background: "#211e1b",
 borderRadius: 10,
 padding: 10,
 border: "1px solid rgba(255,255,255,0.08)",
 }}
 >
 <SectionTitle>4. Board tools</SectionTitle>
 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
 <SecondaryButton onClick={loadCurrentFen}>Use current</SecondaryButton>
 <SecondaryButton onClick={setStandardBoard}>Start position</SecondaryButton>
 <SecondaryButton onClick={clearBoard}>Clear</SecondaryButton>
 <SecondaryButton onClick={() => navigator.clipboard.writeText(fen)}>
 Copy FEN
 </SecondaryButton>
 </div>
 </div>

 <div
 style={{
 background: "#211e1b",
 borderRadius: 10,
 padding: 10,
 border: "1px solid rgba(255,255,255,0.08)",
 }}
 >
 <SectionTitle>FEN preview</SectionTitle>
 <div
 style={{
 fontSize: 11,
 color: "#cfcfcf",
 lineHeight: 1.4,
 wordBreak: "break-all",
 background: "#171513",
 borderRadius: 8,
 padding: 8,
 marginBottom: 8,
 }}
 >
 {fen}
 </div>
 <div style={{ color: "#aaa", fontSize: 12, lineHeight: 1.4, marginBottom: 8 }}>
 {status}
 </div>
 <PrimaryButton onClick={loadFen}>Load Position into Analyze</PrimaryButton>
 </div>
 </div>
 </div>
 </div>
 );
}
