import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";

type Goal = "stalemate" | "avoid-stalemate" | "underpromotion";

type StalematePosition = {
 id: string;
 fen: string;
 solution: string;
 san?: string;
 promotion?: string;
 goal: Goal;
 theme: string;
 instruction?: string;
};

type StalemateChunk = {
 id: string;
 theme: string;
 puzzles: StalematePosition[];
};

type ManifestFile = {
 title: string;
 chunkSize: number;
 maxChunksPerTheme: number;
 chunks: Array<{
 id: string;
 theme: string;
 name: string;
 file: string;
 count: number;
 }>;
};

type PositionProgress = {
 fastSolves: number;
 totalSolves: number;
 mastered: boolean;
};

const PROGRESS_KEY = "stalemate_progress_v1";
const BOARD_WIDTH_KEY = "stalemate_board_width_v1";
const FAST_SOLVES_TO_MASTER = 5;
const FAST_MS = 3000;
const CORRECT_DELAY_MS = 700;
const WRONG_DELAY_MS = 900;

function normalizeFen(fen: string) {
 const parts = fen.trim().split(/\s+/);
 if (parts.length === 4) return `${fen.trim()} 0 1`;
 return fen.trim();
}

function moveToUci(move: { from: string; to: string; promotion?: string }) {
 return `${move.from}${move.to}${move.promotion ?? ""}`;
}

function loadLocalProgress(): Record<string, PositionProgress> {
 try {
 const raw = localStorage.getItem(PROGRESS_KEY);
 if (!raw) return {};
 return JSON.parse(raw);
 } catch {
 return {};
 }
}

function saveLocalProgress(progress: Record<string, PositionProgress>) {
 localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
}

function chooseFirstUnmasteredIndex(
 positions: StalematePosition[],
 progress: Record<string, PositionProgress>
) {
 const idx = positions.findIndex((p) => !progress[p.id]?.mastered);
 return idx >= 0 ? idx : 0;
}

export default function StalemateTrainer() {
 const [manifest, setManifest] = useState<ManifestFile | null>(null);
 const [chunkIndex, setChunkIndex] = useState(0);
 const [chunk, setChunk] = useState<StalemateChunk | null>(null);
 const [positionIndex, setPositionIndex] = useState(0);
 const [game, setGame] = useState(new Chess());
 const [progress, setProgress] = useState<Record<string, PositionProgress>>({});
 const [status, setStatus] = useState("Loading Stalemate trainer...");
 const [message, setMessage] = useState("");
 const [inputLocked, setInputLocked] = useState(false);
 const [lastMove, setLastMove] = useState<{ from?: string; to?: string }>({});
 const [hintSquares, setHintSquares] = useState<string[]>([]);

 const [boardWidth, setBoardWidth] = useState(() => {
 const saved = localStorage.getItem(BOARD_WIDTH_KEY);
 return saved ? Number(saved) : 560;
 });

 const startTimeRef = useRef(Date.now());

 const currentPosition = chunk?.puzzles[positionIndex] ?? null;

 const currentStats = currentPosition
 ? progress[currentPosition.id] ?? {
 fastSolves: 0,
 totalSolves: 0,
 mastered: false,
 }
 : null;

 const chunkMastered = useMemo(() => {
 if (!chunk) return 0;
 return chunk.puzzles.filter((p) => progress[p.id]?.mastered).length;
 }, [chunk, progress]);

 const chunkFastSolves = useMemo(() => {
 if (!chunk) return 0;
 return chunk.puzzles.reduce(
 (sum, p) => sum + (progress[p.id]?.fastSolves ?? 0),
 0
 );
 }, [chunk, progress]);

 useEffect(() => {
 localStorage.setItem(BOARD_WIDTH_KEY, String(boardWidth));
 }, [boardWidth]);

 useEffect(() => {
 async function boot() {
 try {
 const [manifestResponse] = await Promise.all([
 fetch("/data/endgames/stalemate/manifest.json"),
 ]);

 const manifestData = await manifestResponse.json();
 setManifest(manifestData);
 setProgress(loadLocalProgress());
 setChunkIndex(0);
 } catch {
 setStatus("Could not load stalemate manifest.");
 }
 }

 void boot();
 }, []);

 useEffect(() => {
 if (!manifest) return;

 async function loadChunk() {
 const file = manifest.chunks[chunkIndex];

 if (!file) {
 setStatus("All Stalemate chunks complete.");
 setMessage("");
 setInputLocked(true);
 return;
 }

 setStatus("Loading chunk...");
 setMessage("");

 try {
 const response = await fetch(`/data/endgames/stalemate/${file.file}`);
 const data = await response.json();

 setChunk(data);

 const firstIndex = chooseFirstUnmasteredIndex(
 data.puzzles || [],
 progress
 );

 setPositionIndex(firstIndex);
 } catch {
 setStatus("Could not load stalemate chunk.");
 }
 }

 void loadChunk();
 }, [manifest, chunkIndex]);

 useEffect(() => {
 if (!currentPosition) return;

 const nextGame = new Chess(normalizeFen(currentPosition.fen));
 setGame(nextGame);
 setStatus(currentPosition.instruction || getInstruction(currentPosition.goal));
 setMessage("");
 setInputLocked(false);
 setLastMove({});
 setHintSquares([]);
 startTimeRef.current = Date.now();
 }, [currentPosition]);

 function getInstruction(goal: Goal) {
 if (goal === "stalemate") return "Find the move that creates stalemate.";
 if (goal === "avoid-stalemate") {
 return "Avoid stalemate and finish correctly.";
 }
 return "Queen promotion stalemates. Find the correct underpromotion.";
 }

 function customSquareStyles() {
 const styles: Record<string, React.CSSProperties> = {};

 if (lastMove.from) {
 styles[lastMove.from] = {
 background: "rgba(255, 255, 0, 0.35)",
 };
 }

 if (lastMove.to) {
 styles[lastMove.to] = {
 background: "rgba(255, 255, 0, 0.45)",
 };
 }

 for (const sq of hintSquares) {
 styles[sq] = {
 background: "rgba(0, 180, 255, 0.45)",
 };
 }

 return styles;
 }

 function goNextPosition(updatedProgress = progress) {
 if (!chunk) return;

 const allMastered = chunk.puzzles.every((p) => updatedProgress[p.id]?.mastered);

 if (allMastered) {
 setChunkIndex((i) => i + 1);
 return;
 }

 const nextIndex = chooseFirstUnmasteredIndex(chunk.puzzles, updatedProgress);
 setPositionIndex(nextIndex);
 }

 async function markSolved() {
 if (!currentPosition) return;

 const elapsed = Date.now() - startTimeRef.current;
 const wasFast = elapsed <= FAST_MS;

 const oldStats = progress[currentPosition.id] ?? {
 fastSolves: 0,
 totalSolves: 0,
 mastered: false,
 };

 const nextStats: PositionProgress = {
 totalSolves: oldStats.totalSolves + 1,
 fastSolves: wasFast ? oldStats.fastSolves + 1 : oldStats.fastSolves,
 mastered:
 wasFast && oldStats.fastSolves + 1 >= FAST_SOLVES_TO_MASTER
 ? true
 : oldStats.mastered,
 };

 const nextProgress = {
 ...progress,
 [currentPosition.id]: nextStats,
 };

 setProgress(nextProgress);
 saveLocalProgress(nextProgress);

 setStatus(
 wasFast
 ? `Correct. Fast solve ${nextStats.fastSolves}/${FAST_SOLVES_TO_MASTER}.`
 : "Correct, but not fast."
 );

 setMessage(currentPosition.san ? `Solution: ${currentPosition.san}` : "");
 setInputLocked(true);

 window.setTimeout(() => {
 goNextPosition(nextProgress);
 }, CORRECT_DELAY_MS);
 }

 function showWrong(reason: string) {
 setStatus("Wrong move.");
 setMessage(reason);
 setInputLocked(true);

 window.setTimeout(() => {
 if (!currentPosition) return;
 const resetGame = new Chess(normalizeFen(currentPosition.fen));
 setGame(resetGame);
 setLastMove({});
 setHintSquares([]);
 setInputLocked(false);
 setStatus(currentPosition.instruction || getInstruction(currentPosition.goal));
 }, WRONG_DELAY_MS);
 }

 function validateMove(
 playedUci: string,
 afterGame: Chess,
 position: StalematePosition
 ) {
 const solution = position.solution;

 if (position.goal === "underpromotion") {
 if (playedUci !== solution) {
 return {
 ok: false,
 reason: "Wrong promotion. Queen promotion is not the answer here.",
 };
 }

 if (afterGame.isStalemate()) {
 return {
 ok: false,
 reason: "That still stalemates. Underpromote correctly.",
 };
 }

 return { ok: true, reason: "" };
 }

 if (playedUci !== solution) {
 return { ok: false, reason: "That is not the trained solution." };
 }

 if (position.goal === "stalemate") {
 if (!afterGame.isStalemate()) {
 return {
 ok: false,
 reason: "The final position is not stalemate.",
 };
 }

 return { ok: true, reason: "" };
 }

 if (position.goal === "avoid-stalemate") {
 if (afterGame.isStalemate()) {
 return {
 ok: false,
 reason: "That is stalemate. You must avoid it.",
 };
 }

 if (!afterGame.isCheckmate()) {
 return {
 ok: false,
 reason: "Avoiding stalemate is not enough here. Finish correctly.",
 };
 }

 return { ok: true, reason: "" };
 }

 return { ok: false, reason: "Unknown puzzle goal." };
 }

 async function onDrop(sourceSquare: string, targetSquare: string) {
 if (!currentPosition || inputLocked) return false;

 const before = new Chess(normalizeFen(currentPosition.fen));

 const promotion =
 currentPosition.goal === "underpromotion"
 ? currentPosition.promotion || currentPosition.solution.slice(4, 5) || "q"
 : "q";

 const move = before.move({
 from: sourceSquare,
 to: targetSquare,
 promotion,
 });

 if (!move) {
 showWrong("Illegal move.");
 return false;
 }

 const playedUci = moveToUci(move);
 setGame(before);
 setLastMove({ from: sourceSquare, to: targetSquare });

 const result = validateMove(playedUci, before, currentPosition);

 if (!result.ok) {
 showWrong(result.reason);
 return true;
 }

 await markSolved();
 return true;
 }

 function showHint() {
 if (!currentPosition) return;

 const from = currentPosition.solution.slice(0, 2);
 const to = currentPosition.solution.slice(2, 4);

 setHintSquares([from, to]);

 if (currentPosition.goal === "stalemate") {
 setMessage("Hint: create a position where the opponent has no legal moves and is not in check.");
 } else if (currentPosition.goal === "avoid-stalemate") {
 setMessage("Hint: do not remove the opponent's last legal move unless it is checkmate.");
 } else {
 setMessage("Hint: queen promotion stalemates. Use the underpromotion from the highlighted move.");
 }
 }

 function restartPosition() {
 if (!currentPosition) return;

 const resetGame = new Chess(normalizeFen(currentPosition.fen));
 setGame(resetGame);
 setLastMove({});
 setHintSquares([]);
 setInputLocked(false);
 setStatus(currentPosition.instruction || getInstruction(currentPosition.goal));
 setMessage("");
 startTimeRef.current = Date.now();
 }

 function restartChunk() {
 if (!chunk) return;

 const ids = chunk.puzzles.map((p) => p.id);
 const nextProgress = { ...progress };

 for (const id of ids) {
 delete nextProgress[id];
 }

 setProgress(nextProgress);
 saveLocalProgress(nextProgress);
 setPositionIndex(0);
 setStatus("Chunk restarted.");
 setMessage("");
 }

 if (!manifest || !chunk || !currentPosition) {
 return <div style={{ padding: 24 }}>Loading Stalemate trainer...</div>;
 }

 const currentManifestChunk = manifest.chunks[chunkIndex];
 const totalChunks = manifest.chunks.length;

 return (
 <div style={{ padding: 24 }}>
 <h1>Stalemate Trainer</h1>

 <div
 style={{
 display: "grid",
 gridTemplateColumns: `${boardWidth}px 340px`,
 gap: 20,
 alignItems: "start",
 }}
 >
 <div>
 <div style={{ marginBottom: 10 }}>
 <div style={{ fontSize: 14, opacity: 0.8 }}>
 Theme: <strong>{currentManifestChunk.theme}</strong>
 </div>

 <div style={{ fontSize: 14, opacity: 0.8 }}>
 Chunk {chunkIndex + 1} / {totalChunks}
 {" - "}
 {currentManifestChunk.name}
 </div>
 </div>

 <Chessboard
 position={game.fen()}
 onPieceDrop={onDrop}
 boardWidth={boardWidth}
 boardOrientation={game.turn() === "b" ? "black" : "white"}
 customSquareStyles={customSquareStyles()}
 promotionDialogVariant="modal"
 />

 <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
 <button onClick={() => setBoardWidth((w) => Math.max(420, w - 40))}>
 Smaller
 </button>

 <button onClick={() => setBoardWidth((w) => Math.min(820, w + 40))}>
 Bigger
 </button>

 <button onClick={showHint}>Hint</button>
 <button onClick={restartPosition}>Restart position</button>
 </div>
 </div>

 <div
 style={{
 border: "1px solid rgba(255,255,255,0.18)",
 borderRadius: 12,
 padding: 16,
 }}
 >
 <h2 style={{ marginTop: 0 }}>{currentManifestChunk.theme}</h2>

 <div style={{ marginBottom: 12 }}>
 <strong>Status:</strong> {status}
 </div>

 {message && (
 <div
 style={{
 marginBottom: 12,
 padding: 10,
 borderRadius: 8,
 background: "rgba(255,255,255,0.08)",
 }}
 >
 {message}
 </div>
 )}

 <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
 <div>
 <strong>Goal:</strong> {currentPosition.goal}
 </div>

 <div>
 <strong>Position:</strong> {positionIndex + 1} / {chunk.puzzles.length}
 </div>

 <div>
 <strong>Fast solves:</strong> {currentStats?.fastSolves ?? 0} /{" "}
 {FAST_SOLVES_TO_MASTER}
 </div>

 <div>
 <strong>Chunk mastered:</strong> {chunkMastered} / {chunk.puzzles.length}
 </div>

 <div>
 <strong>Chunk fast solves:</strong> {chunkFastSolves} /{" "}
 {chunk.puzzles.length * FAST_SOLVES_TO_MASTER}
 </div>
 </div>

 <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
 <button onClick={() => goNextPosition()}>Next position</button>

 <button onClick={() => setChunkIndex((i) => Math.max(0, i - 1))}>
 Previous chunk
 </button>

 <button onClick={() => setChunkIndex((i) => Math.min(totalChunks - 1, i + 1))}>
 Next chunk
 </button>

 <button onClick={restartChunk}>Restart chunk</button>
 </div>

 <div style={{ marginTop: 16, fontSize: 13, opacity: 0.75 }}>
 Fast solve means under {FAST_MS / 1000} seconds. Mastery requires{" "}
 {FAST_SOLVES_TO_MASTER} fast solves per position.
 </div>
 </div>
 </div>
 </div>
 );
}