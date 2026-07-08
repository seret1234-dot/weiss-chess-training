import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";
import { BNEngine } from "../lib/bnEngine";
import type { EngineResult } from "../lib/bnEngine";
import { supabase } from "../lib/supabase";

type Goal = "win" | "draw" | "mixed";

type KPKPosition = {
 id: string;
 fen: string;
 subjectId: string;
 subjectName: string;
 goal: Goal;
 sideToMove: "w" | "b";
 explanation?: string;
};

type KPKChunk = {
 id: string;
 subjectId: string;
 subjectName: string;
 subjectChunkNumber: number;
 subjectTotalChunks: number;
 globalChunkNumber: number;
 goal: Goal;
 positions: KPKPosition[];
};

type ProgressionFile = {
 title: string;
 totalChunks: number;
 totalPositions: number;
 files: Array<{
 id: string;
 path: string;
 subjectId: string;
 subjectName: string;
 subjectChunkNumber: number;
 subjectTotalChunks: number;
 globalChunkNumber: number;
 positionCount: number;
 goal: Goal;
 }>;
};

type PositionProgress = {
 fastSolves: number;
 totalSolves: number;
 mastered: boolean;
};

const TRAINER_ID = "kpk";
const PROGRESS_KEY = "kpk_progress_v1";
const BOARD_WIDTH_KEY = "kpk_board_width_v1";
const FAST_SOLVES_TO_MASTER = 5;
const FAST_MS = 3000;
const ENGINE_DEPTH = 14;
const CORRECT_DELAY_MS = 900;
const WRONG_DELAY_MS = 1100;
const ENGINE_REPLY_DELAY_MS = 450;

function normalizeFen(fen: string) {
 const parts = fen.trim().split(/\s+/);
 if (parts.length === 4) return `${fen.trim()} 0 1`;
 return fen.trim();
}

function moveToUci(move: { from: string; to: string; promotion?: string }) {
 return `${move.from}${move.to}${move.promotion ?? ""}`;
}

function parseUciMove(uci?: string | null) {
 if (!uci || uci.length < 4) return null;
 return {
 from: uci.slice(0, 2),
 to: uci.slice(2, 4),
 promotion: uci.length > 4 ? uci.slice(4, 5) : undefined,
 };
}

function sleep(ms: number) {
 return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isWhiteWinning(info: EngineResult | null) {
 if (!info) return false;

 if (typeof info.mate === "number") {
 return info.mate > 0;
 }

 if (typeof info.eval === "number") {
 return info.eval >= 2.5;
 }

 return false;
}

function getResultLabel(goal: Goal, engineInfo: EngineResult | null) {
 if (goal === "win") return "Win";
 if (goal === "draw") return "Draw / hold";
 return isWhiteWinning(engineInfo) ? "Win" : "Draw / hold";
}

function getEngineLabel(info: EngineResult | null) {
 if (!info) return "Engine: - ";
 if (typeof info.mate === "number") return `Engine: M${Math.abs(info.mate)}`;
 if (typeof info.eval === "number") {
 const value = info.eval > 0 ? `+${info.eval}` : `${info.eval}`;
 return `Engine: ${value}`;
 }
 return "Engine: - ";
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

async function loadSupabaseProgress() {
 const { data: authData } = await supabase.auth.getUser();
 const user = authData.user;
 if (!user) return {};

 const { data, error } = await supabase
 .from("training_progress")
 .select("item_id, mastery")
 .eq("user_id", user.id)
 .eq("course", "endgame")
 .eq("theme", TRAINER_ID);

 if (error || !data) return {};

 const out: Record<string, PositionProgress> = {};

 for (const row of data) {
 const mastery = Number(row.mastery ?? 0);
 const id = String(row.item_id ?? "");
 if (!id) continue;

 out[id] = {
 fastSolves: mastery,
 totalSolves: mastery,
 mastered: mastery >= FAST_SOLVES_TO_MASTER,
 };
 }

 return out;
}

async function saveOneProgress(positionId: string, stats: PositionProgress) {
 localStorage.setItem(
 PROGRESS_KEY,
 JSON.stringify({
 ...loadLocalProgress(),
 [positionId]: stats,
 }),
 );

 const { data: authData } = await supabase.auth.getUser();
 const user = authData.user;
 if (!user) return;

 await supabase.from("training_progress").upsert(
 {
 user_id: user.id,
 course: "endgame",
 theme: TRAINER_ID,
 item_id: positionId,
 mastery: stats.fastSolves,
 updated_at: new Date().toISOString(),
 },
 { onConflict: "user_id,course,theme,item_id" },
 );
}

function chooseFirstUnmasteredIndex(
 positions: KPKPosition[],
 progress: Record<string, PositionProgress>,
) {
 const index = positions.findIndex((p) => !progress[p.id]?.mastered);
 return index === -1 ? 0 : index;
}

export default function KPKTrainer() {
 const [progression, setProgression] = useState<ProgressionFile | null>(null);
 const [chunkIndex, setChunkIndex] = useState(0);
 const [chunk, setChunk] = useState<KPKChunk | null>(null);
 const [positionIndex, setPositionIndex] = useState(0);
 const [game, setGame] = useState(new Chess());
 const [progress, setProgress] = useState<Record<string, PositionProgress>>({});
 const [status, setStatus] = useState("Loading...");
 const [message, setMessage] = useState("");
 const [engineInfo, setEngineInfo] = useState<EngineResult | null>(null);
 const [inputLocked, setInputLocked] = useState(false);
 const [lastMove, setLastMove] = useState<{ from?: string; to?: string }>({});
 const [hintSquares, setHintSquares] = useState<string[]>([]);
 const [boardWidth, setBoardWidth] = useState(() => {
 const saved = localStorage.getItem(BOARD_WIDTH_KEY);
 return saved ? Number(saved) : 560;
 });

 const engineRef = useRef<BNEngine | null>(null);
 const startTimeRef = useRef(Date.now());
 const analysisTokenRef = useRef(0);

 const currentPosition = chunk?.positions[positionIndex] ?? null;

 const currentStats = currentPosition
 ? progress[currentPosition.id] ?? {
 fastSolves: 0,
 totalSolves: 0,
 mastered: false,
 }
 : null;

 const chunkMastered = useMemo(() => {
 if (!chunk) return 0;
 return chunk.positions.filter((p) => progress[p.id]?.mastered).length;
 }, [chunk, progress]);

 const chunkFastSolves = useMemo(() => {
 if (!chunk) return 0;
 return chunk.positions.reduce(
 (sum, p) => sum + (progress[p.id]?.fastSolves ?? 0),
 0,
 );
 }, [chunk, progress]);

 useEffect(() => {
 localStorage.setItem(BOARD_WIDTH_KEY, String(boardWidth));
 }, [boardWidth]);

 useEffect(() => {
 engineRef.current = new BNEngine();

 return () => {
 engineRef.current?.destroy();
 };
 }, []);

 async function analyzeFen(fen: string) {
 if (!engineRef.current) return null;

 const token = ++analysisTokenRef.current;

 try {
 const result = await engineRef.current.analyze(fen, ENGINE_DEPTH);
 if (token === analysisTokenRef.current) {
 setEngineInfo(result);
 }
 return result;
 } catch {
 if (token === analysisTokenRef.current) {
 setEngineInfo(null);
 }
 return null;
 }
 }

 useEffect(() => {
 async function boot() {
 const [progressionResponse, localProgress, cloudProgress] =
 await Promise.all([
 fetch("/data/endgames/kpk/progression.json"),
 Promise.resolve(loadLocalProgress()),
 loadSupabaseProgress(),
 ]);

 const data = await progressionResponse.json();

 setProgression(data);
 setProgress({ ...localProgress, ...cloudProgress });
 setChunkIndex(0);
 }

 void boot();
 }, []);

 useEffect(() => {
 if (!progression) return;

 async function loadChunk() {
 const file = progression.files[chunkIndex];
 if (!file) {
 setStatus("All KPK chunks complete.");
 setMessage("");
 setInputLocked(true);
 return;
 }

 setStatus("Loading chunk...");
 setMessage("");

 const response = await fetch(`/data/endgames/kpk/${file.path}`);
 const data = await response.json();

 setChunk(data);

 const firstIndex = chooseFirstUnmasteredIndex(data.positions, progress);
 setPositionIndex(firstIndex);
 }

 void loadChunk();
 }, [progression, chunkIndex]);

 useEffect(() => {
 if (!currentPosition) return;

 const nextGame = new Chess(normalizeFen(currentPosition.fen));
 setGame(nextGame);
 setLastMove({});
 setHintSquares([]);
 setInputLocked(false);
 startTimeRef.current = Date.now();

 const side = nextGame.turn() === "w" ? "White" : "Black";

 setStatus(`${side} to move`);
 setMessage(currentPosition.explanation || "Find a move that keeps the correct KPK result.");

 void analyzeFen(nextGame.fen());
 }, [currentPosition?.id]);

 function customSquareStyles() {
 const styles: Record<string, React.CSSProperties> = {};

 if (lastMove.from) {
 styles[lastMove.from] = {
 boxShadow: "inset 0 0 0 4px rgba(255,255,0,0.45)",
 };
 }

 if (lastMove.to) {
 styles[lastMove.to] = {
 boxShadow: "inset 0 0 0 4px rgba(255,255,0,0.45)",
 backgroundColor: "rgba(118,150,86,0.45)",
 };
 }

 for (const sq of hintSquares) {
 styles[sq] = {
 boxShadow: "inset 0 0 0 4px rgba(80,180,255,0.9)",
 backgroundColor: "rgba(80,180,255,0.22)",
 };
 }

 return styles;
 }

 function goNextPosition(updatedProgress = progress) {
 if (!chunk) return;

 const allMastered = chunk.positions.every((p) => updatedProgress[p.id]?.mastered);

 if (allMastered) {
 setChunkIndex((i) => i + 1);
 return;
 }

 const nextIndex = chooseFirstUnmasteredIndex(chunk.positions, updatedProgress);
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

 const nextFastSolves = wasFast
 ? Math.min(FAST_SOLVES_TO_MASTER, oldStats.fastSolves + 1)
 : oldStats.fastSolves;

 const nextStats: PositionProgress = {
 fastSolves: nextFastSolves,
 totalSolves: oldStats.totalSolves + 1,
 mastered: nextFastSolves >= FAST_SOLVES_TO_MASTER,
 };

 const updatedProgress = {
 ...progress,
 [currentPosition.id]: nextStats,
 };

 setProgress(updatedProgress);
 await saveOneProgress(currentPosition.id, nextStats);

 setStatus("Correct.");
 setMessage(
 wasFast
 ? `Fast solve ${nextFastSolves}/${FAST_SOLVES_TO_MASTER}.`
 : "Correct, but slower than 3 seconds.",
 );

 window.setTimeout(() => {
 goNextPosition(updatedProgress);
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
 startTimeRef.current = Date.now();
 void analyzeFen(resetGame.fen());
 }, WRONG_DELAY_MS);
 }

 async function playEngineReply(afterUserGame: Chess) {
 const replyInfo = await analyzeFen(afterUserGame.fen());
 const bestMove = replyInfo?.bestMove;

 if (!bestMove || afterUserGame.isGameOver()) {
 setInputLocked(false);
 startTimeRef.current = Date.now();
 return;
 }

 const parsed = parseUciMove(bestMove);
 if (!parsed) {
 setInputLocked(false);
 startTimeRef.current = Date.now();
 return;
 }

 await sleep(ENGINE_REPLY_DELAY_MS);

 const replyGame = new Chess(afterUserGame.fen());
 const moveObj = replyGame.move({
 from: parsed.from,
 to: parsed.to,
 promotion: parsed.promotion || "q",
 });

 if (!moveObj) {
 setInputLocked(false);
 startTimeRef.current = Date.now();
 return;
 }

 setGame(replyGame);
 setLastMove({ from: moveObj.from, to: moveObj.to });
 setStatus(`${replyGame.turn() === "w" ? "White" : "Black"} to move`);
 setMessage("Engine replied. Continue.");
 setInputLocked(false);
 startTimeRef.current = Date.now();
 void analyzeFen(replyGame.fen());
 }

 async function validateMove(beforeInfo: EngineResult | null, afterInfo: EngineResult | null) {
 if (!currentPosition) {
 return { ok: false, reason: "No position loaded." };
 }

 const target =
 currentPosition.goal === "mixed"
 ? isWhiteWinning(beforeInfo)
 ? "win"
 : "draw"
 : currentPosition.goal;

 const afterWhiteWinning = isWhiteWinning(afterInfo);

 if (target === "win") {
 if (afterWhiteWinning) return { ok: true, reason: "" };

 return {
 ok: false,
 reason: "This move lets the win slip. Keep the king/pawn position winning.",
 };
 }

 if (target === "draw") {
 if (!afterWhiteWinning) return { ok: true, reason: "" };

 return {
 ok: false,
 reason: "This move loses the draw. Keep the white king out or reach the drawn setup.",
 };
 }

 return { ok: true, reason: "" };
 }

 async function onDrop(sourceSquare: string, targetSquare: string) {
 if (!currentPosition || inputLocked) return false;

 const beforeFen = game.fen();
 const beforeInfo = engineInfo ?? (await analyzeFen(beforeFen));

 const nextGame = new Chess(beforeFen);
 const moveObj = nextGame.move({
 from: sourceSquare,
 to: targetSquare,
 promotion: "q",
 });

 if (!moveObj) return false;

 const userMove = {
 from: moveObj.from,
 to: moveObj.to,
 promotion: moveObj.promotion,
 };

 setGame(nextGame);
 setLastMove({ from: userMove.from, to: userMove.to });
 setHintSquares([]);
 setInputLocked(true);
 setStatus("Checking move...");
 setMessage("Engine is evaluating KPK result.");

 const afterInfo = await analyzeFen(nextGame.fen());
 const validation = await validateMove(beforeInfo, afterInfo);

 if (!validation.ok) {
 showWrong(validation.reason);
 return true;
 }

 if (nextGame.isGameOver()) {
 await markSolved();
 return true;
 }

 setStatus("Good move.");
 setMessage("Result preserved. Engine will reply.");
 await playEngineReply(nextGame);

 return true;
 }

 async function showHint() {
 setMessage("Finding best engine move...");

 const info = await analyzeFen(game.fen());
 setEngineInfo(info);

 const bestMove = info?.bestMove;
 const parsed = parseUciMove(bestMove);

 if (!parsed) {
 setMessage("No engine hint available yet. Try again.");
 setHintSquares([]);
 return;
 }

 setHintSquares([parsed.from, parsed.to]);

 const promotionText = parsed.promotion
 ? " (" + parsed.promotion + ")"
 : "";

 setMessage(
 "Best engine move: " +
 parsed.from +
 " → " +
 parsed.to +
 promotionText,
 );
 }

 async function restartChunk() {
 if (!chunk) return;

 const ids = chunk.positions.map((p) => p.id);
 const nextProgress = { ...progress };

 for (const id of ids) {
 delete nextProgress[id];
 }

 localStorage.setItem(PROGRESS_KEY, JSON.stringify(nextProgress));
 setProgress(nextProgress);

 const { data: authData } = await supabase.auth.getUser();
 const user = authData.user;

 if (user) {
 await supabase
 .from("training_progress")
 .delete()
 .eq("user_id", user.id)
 .eq("course", "endgame")
 .eq("theme", TRAINER_ID)
 .in("item_id", ids);
 }

 setPositionIndex(0);
 setStatus("Chunk restarted.");
 setMessage("");
 }

 if (!progression || !chunk || !currentPosition) {
 return <div style={{ padding: 24 }}>Loading KPK trainer...</div>;
 }

 return (
 <div
 style={{
 padding: 20,
 display: "grid",
 gridTemplateColumns: `${boardWidth}px 340px`,
 gap: 20,
 alignItems: "start",
 }}
 >
 <div>
 <div style={{ marginBottom: 12 }}>
 <h2 style={{ margin: "0 0 6px" }}>KPK - King and Pawn vs King</h2>
 <div style={{ fontSize: 14, opacity: 0.8 }}>
 Subject: <strong>{chunk.subjectName}</strong>
 </div>
 <div style={{ fontSize: 14, opacity: 0.8 }}>
 Subject chunk {chunk.subjectChunkNumber} / {chunk.subjectTotalChunks}
 {" - "}
 Global chunk {chunk.globalChunkNumber} / {progression.totalChunks}
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

 <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
 <button onClick={() => setBoardWidth((w) => Math.max(420, w - 40))}>
 Smaller
 </button>
 <button onClick={() => setBoardWidth((w) => Math.min(820, w + 40))}>
 Bigger
 </button>
 <button onClick={showHint}>Hint</button>
 </div>
 </div>

 <div
 style={{
 border: "1px solid rgba(255,255,255,0.12)",
 borderRadius: 14,
 padding: 16,
 background: "rgba(255,255,255,0.04)",
 }}
 >
 <h3 style={{ marginTop: 0 }}>{status}</h3>

 <div style={{ marginBottom: 10 }}>{message}</div>

 <div style={{ fontSize: 14, lineHeight: 1.7 }}>
 <div>
 <strong>Goal:</strong> {getResultLabel(currentPosition.goal, engineInfo)}
 </div>
 <div>
 <strong>Position:</strong> {positionIndex + 1} / {chunk.positions.length}
 </div>
 <div>
 <strong>Fast solves:</strong> {currentStats?.fastSolves ?? 0} /{" "}
 {FAST_SOLVES_TO_MASTER}
 </div>
 <div>
 <strong>Chunk mastered:</strong> {chunkMastered} /{" "}
 {chunk.positions.length}
 </div>
 <div>
 <strong>Chunk fast solves:</strong> {chunkFastSolves} /{" "}
 {chunk.positions.length * FAST_SOLVES_TO_MASTER}
 </div>
 <div>
 <strong>{getEngineLabel(engineInfo)}</strong>
 </div>
 </div>

 <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
 <button onClick={() => goNextPosition()}>Next position</button>
 <button onClick={() => setChunkIndex((i) => Math.max(0, i - 1))}>
 Previous chunk
 </button>
 <button onClick={() => setChunkIndex((i) => i + 1)}>Next chunk</button>
 <button onClick={restartChunk}>Restart chunk</button>
 </div>

 <div style={{ marginTop: 16, fontSize: 13, opacity: 0.75 }}>
 {currentPosition.explanation}
 </div>
 </div>
 </div>
 );
}