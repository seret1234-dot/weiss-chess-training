import React, { useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { stockfishService } from "../../lib/chess/stockfishService";
import { supabase } from "../../lib/supabase";
import TrainerShell from "../../components/trainer/TrainerShell";
import { Chessboard } from "react-chessboard";
import { useGlobalBoard } from "../../hooks/useGlobalBoard";
import ImageToPositionPanel from "./ImageToPositionPanel";
import { explainMistake } from "../../services/coach";
import {
 PanelCard,
 PrimaryButton,
 SecondaryButton,
 SectionTitle,
 ShellInput,
} from "../../components/trainer/ui";

type MoveRow = {
 ply: number;
 moveNumber: number;
 san: string;
 uci?: string;
 color: "w" | "b";
 nag?: string;
 fen: string;
};

type ReviewClass =
 | "Book"
 | "Brilliant"
 | "Best"
 | "Excellent"
 | "Good"
 | "Inaccuracy"
 | "Mistake"
 | "Miss"
 | "Blunder";

type GameInfo = {
 event: string;
 site: string;
 date: string;
 round: string;
 white: string;
 black: string;
 result: string;
 eco: string;
 opening: string;
 whiteElo: string;
 blackElo: string;
};

const EMPTY_GAME_INFO: GameInfo = {
 event: "",
 site: "",
 date: "",
 round: "",
 white: "White",
 black: "Black",
 result: "",
 eco: "",
 opening: "",
 whiteElo: "",
 blackElo: "",
};

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

const SETUP_FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

const SETUP_PIECES: { code: SetupPieceCode; label: string }[] = [
 { code: "wK", label: "White king" },
 { code: "wQ", label: "White queen" },
 { code: "wR", label: "White rook" },
 { code: "wB", label: "White bishop" },
 { code: "wN", label: "White knight" },
 { code: "wP", label: "White pawn" },
 { code: "bK", label: "Black king" },
 { code: "bQ", label: "Black queen" },
 { code: "bR", label: "Black rook" },
 { code: "bB", label: "Black bishop" },
 { code: "bN", label: "Black knight" },
 { code: "bP", label: "Black pawn" },
];

function isSetupPieceCode(value: string): value is SetupPieceCode {
 return SETUP_PIECES.some((piece) => piece.code === value);
}

const ANALYZE_SIDE_PANEL_WIDTH = 980;
const ANALYZE_PAGE_PADDING = 24;
const ANALYZE_BOARD_VERTICAL_CHROME = 90;
const ANALYZE_MAX_BOARD_SIZE = 600;
const ANALYZE_LAYOUT_SHIFT_LEFT = 120;

export default function AnalyzePage() {
 const containerRef = useRef<HTMLDivElement | null>(null);
 const pgnFileInputRef = useRef<HTMLInputElement | null>(null);
 const reviewRunIdRef = useRef(0);
 const reviewAutoStartedRef = useRef(false);
 const [showImageToPosition, setShowImageToPosition] = useState(false);

 const [game, setGame] = useState(() => new Chess());
 const [inputText, setInputText] = useState("");
 const [message, setMessage] = useState(
 "Paste FEN, PGN, or use Image to Position",
 );
 const [boardSize, setBoardSize] = useState(720);
 const [isDragging, setIsDragging] = useState(false);
 const [isHandleHovered, setIsHandleHovered] = useState(false);
 const [boardOrientation, setBoardOrientation] = useState<"white" | "black">(
 "white",
 );
 const [isPgnDragActive, setIsPgnDragActive] = useState(false);
 const [whitePlayer, setWhitePlayer] = useState("White");
 const [blackPlayer, setBlackPlayer] = useState("Black");
 const [gameInfo, setGameInfo] = useState<GameInfo>(EMPTY_GAME_INFO);
 const [reviewInProgress, setReviewInProgress] = useState(false);
 const [reviewProgress, setReviewProgress] = useState({ done: 0, total: 0 });

 const [engineReady, setEngineReady] = useState(false);
 const [evalCp, setEvalCp] = useState<number | null>(null);
 const [evalMate, setEvalMate] = useState<number | null>(null);
 const [depth, setDepth] = useState(0);
 const [bestMove, setBestMove] = useState("");
 const [openingName, setOpeningName] = useState("");
 const [openingVariation, setOpeningVariation] = useState("");
 const [openingEco, setOpeningEco] = useState("");
 const [openingSlug, setOpeningSlug] = useState("");
 const [reviewMap, setReviewMap] = useState<Record<number, ReviewClass>>({});
 const [reviewLossMap, setReviewLossMap] = useState<Record<number, number>>(
 {},
 );
 const [reviewBestMap, setReviewBestMap] = useState<Record<number, string>>(
 {},
 );
 const [reviewSummary, setReviewSummary] = useState("");

 const [accuracyWhite, setAccuracyWhite] = useState<number | null>(null);

 const [accuracyBlack, setAccuracyBlack] = useState<number | null>(null);

 const [reviewCounts, setReviewCounts] = useState<Record<ReviewClass, number>>(
 {
 Book: 0,
 Brilliant: 0,
 Best: 0,
 Excellent: 0,
 Good: 0,
 Inaccuracy: 0,
 Mistake: 0,
 Miss: 0,
 Blunder: 0,
 },
 );
 const [showBestMoveArrow, setShowBestMoveArrow] = useState(false);
 const [showCoordinates, setShowCoordinates] = useState(true);
 const [showLastMoveArrow, setShowLastMoveArrow] = useState(false);
 const [lastMoveArrow, setLastMoveArrow] = useState<string[][]>([]);
 const [autoAnalyze, setAutoAnalyze] = useState(true);
 const [topLines, setTopLines] = useState<string[]>([]);

 const isReviewMode = useMemo(
 () => new URLSearchParams(window.location.search).get("review") === "1",
 [],
 );
 const [isSetupPositionOpen, setIsSetupPositionOpen] = useState(false);
 const [setupBoard, setSetupBoard] = useState<Record<string, SetupPieceCode>>(
 {},
 );
 const [setupSelectedPiece, setSetupSelectedPiece] = useState<
 SetupPieceCode | "clear"
 >("wK");
 const [setupTurn, setSetupTurn] = useState<"w" | "b">("w");
 const [setupCastling, setSetupCastling] = useState({
 K: true,
 Q: true,
 k: true,
 q: true,
 });

 const [startFen, setStartFen] = useState(new Chess().fen());
 const [moveRows, setMoveRows] = useState<MoveRow[]>([]);
 const [currentPly, setCurrentPly] = useState(0);

 useEffect(() => {
 function setInitialBoardSize() {
 const width = window.innerWidth;
 const height = window.innerHeight;
 const availableWidth =
 width - ANALYZE_SIDE_PANEL_WIDTH - ANALYZE_PAGE_PADDING;
 const availableHeight = height - ANALYZE_BOARD_VERTICAL_CHROME;

 const reviewMode =
 new URLSearchParams(window.location.search).get("review") === "1";

 const size = reviewMode
 ? Math.max(620, Math.min(780, height - 150))
 : Math.max(320, Math.min(760, availableWidth, availableHeight));

 setBoardSize(size);
 }

 setInitialBoardSize();
 window.addEventListener("resize", setInitialBoardSize);

 return () => window.removeEventListener("resize", setInitialBoardSize);
 }, []);

 useEffect(() => {
 function onMouseMove(e: MouseEvent) {
 if (!isDragging || !containerRef.current) return;

 const rect = containerRef.current.getBoundingClientRect();
 const leftPadding = 16;
 const dividerWidth = 18;
 const minBoard = 320;
 const maxBoard = Math.min(
 ANALYZE_MAX_BOARD_SIZE,
 rect.width - ANALYZE_SIDE_PANEL_WIDTH - dividerWidth - leftPadding,
 window.innerHeight - ANALYZE_BOARD_VERTICAL_CHROME,
 );

 const nextSize = e.clientX - rect.left - leftPadding;
 const clamped = Math.max(minBoard, Math.min(maxBoard, nextSize));
 setBoardSize(clamped);
 }

 function onMouseUp() {
 setIsDragging(false);
 }

 window.addEventListener("mousemove", onMouseMove);
 window.addEventListener("mouseup", onMouseUp);

 return () => {
 window.removeEventListener("mousemove", onMouseMove);
 window.removeEventListener("mouseup", onMouseUp);
 };
 }, [isDragging]);

 const fenByPly = useMemo(() => {
 const list = [startFen];
 for (const row of moveRows) list[row.ply] = row.fen;
 return list;
 }, [startFen, moveRows]);

 function goToPly(ply: number) {
 const maxPly = moveRows.length;
 const nextPly = Math.max(0, Math.min(maxPly, ply));
 const fen = fenByPly[nextPly] || startFen;

 try {
 const next = new Chess(fen);
 setGame(next);
 setCurrentPly(nextPly);
 setMessage(nextPly === 0 ? "Start position" : `Move ${nextPly} loaded`);
 } catch {
 setMessage("Could not load move position");
 }
 }

 function loadFenOnly(text: string) {
 const next = new Chess(text);
 setGame(next);
 setStartFen(next.fen());
 setMoveRows([]);
 setCurrentPly(0);
 setReviewMap({});
 setReviewLossMap({});
 setReviewBestMap({});
 setReviewSummary("");
 setReviewProgress({ done: 0, total: 0 });
 setWhitePlayer("White");
 setBlackPlayer("Black");
 setGameInfo(EMPTY_GAME_INFO);
 setMessage(
 "FEN loaded. This is one position; use Analyze Now for this position, or upload a PGN for full game review.",
 );
 setAutoAnalyze(true);
 }

 function loadSetupBoardFromFen(fen: string) {
 try {
 const temp = new Chess(fen);
 const nextBoard: Record<string, SetupPieceCode> = {};

 temp.board().forEach((rank, rankIndex) => {
 const boardRank = 8 - rankIndex;

 rank.forEach((piece, fileIndex) => {
 if (!piece) return;

 const square = `${SETUP_FILES[fileIndex]}${boardRank}`;
 const setupCode = `${piece.color}${piece.type.toUpperCase()}`;

 if (isSetupPieceCode(setupCode)) {
 nextBoard[square] = setupCode;
 }
 });
 });

 const parts = temp.fen().split(" ");
 const castling = parts[2] || "-";

 setSetupBoard(nextBoard);
 setSetupTurn(parts[1] === "b" ? "b" : "w");
 setSetupCastling({
 K: castling.includes("K"),
 Q: castling.includes("Q"),
 k: castling.includes("k"),
 q: castling.includes("q"),
 });
 } catch {
 setMessage("Could not copy current position into setup board");
 }
 }

 function buildSetupFen() {
 const ranks: string[] = [];

 for (let rank = 8; rank >= 1; rank--) {
 let row = "";
 let empty = 0;

 for (const file of SETUP_FILES) {
 const piece = setupBoard[`${file}${rank}`];

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

 const castling =
 (setupCastling.K ? "K" : "") +
 (setupCastling.Q ? "Q" : "") +
 (setupCastling.k ? "k" : "") +
 (setupCastling.q ? "q" : "");

 return `${ranks.join("/")} ${setupTurn} ${castling || "-"} - 0 1`;
 }

 function openSetupPosition() {
 loadSetupBoardFromFen(game.fen());
 setIsSetupPositionOpen(true);
 setMessage(
 "Setup mode: choose a piece, then click squares. Use Load Setup when done.",
 );
 }

 function setupStartPosition() {
 loadSetupBoardFromFen(new Chess().fen());
 setMessage("Setup board changed to the normal starting position");
 }

 function setupClearBoard() {
 setSetupBoard({});
 setSetupCastling({ K: false, Q: false, k: false, q: false });
 setMessage("Setup board cleared. Add both kings before loading.");
 }

 function setupSquareClick(square: string) {
 setSetupBoard((current) => {
 const next = { ...current };

 if (setupSelectedPiece === "clear") {
 delete next[square];
 } else {
 next[square] = setupSelectedPiece;
 }

 return next;
 });
 }

 function setupPieceDrop(sourceSquare: string, targetSquare: string) {
 setSetupBoard((current) => {
 const piece = current[sourceSquare];
 if (!piece) return current;

 const next = { ...current };
 delete next[sourceSquare];
 next[targetSquare] = piece;

 return next;
 });

 return true;
 }

 function loadSetupPosition() {
 const fen = buildSetupFen();

 try {
 new Chess(fen);
 loadFenOnly(fen);
 setInputText(fen);
 setLastMoveArrow([]);
 setIsSetupPositionOpen(false);
 setMessage("Setup position loaded");
 } catch {
 setInputText(fen);
 setMessage(
 "Invalid setup. Check that both kings exist and the side not to move is not already in check.",
 );
 }
 }

 useEffect(() => {
 const params = new URLSearchParams(window.location.search);
 const fenFromUrl = params.get("fen");
 const pgnFromUrl = params.get("pgn");
 const colorFromUrl = params.get("color");
 const reviewFromSession =
 params.get("review") === "1"
 ? window.sessionStorage.getItem("weissAnalyzeReviewPgn")
 : "";

 const pgnToLoad = reviewFromSession || pgnFromUrl;

 if (pgnToLoad) {
 setInputText(pgnToLoad);
 loadPgn(pgnToLoad);
 setBoardOrientation("white");

 if (reviewFromSession) {
 setMessage("PGN loaded from Game Review. Click Review Now.");
 }

 return;
 }

 if (fenFromUrl) {
 loadFenOnly(fenFromUrl);

 if (colorFromUrl === "white" || colorFromUrl === "black") {
 setBoardOrientation(colorFromUrl);
 } else {
 setBoardOrientation(
 fenFromUrl.split(" ")[1] === "b" ? "black" : "white",
 );
 }
 }
 }, []);

 function extractPgnNags(text: string) {
 const nagByPly: Record<number, string> = {};
 let movetext = text
 .replace(/\r/g, "")
 .replace(/\[[^\]]*\]/g, " ")
 .replace(/\{[^}]*\}/g, " ")
 .replace(/;[^\n]*/g, " ");

 // Remove simple PGN variations so NAGs inside side lines do not attach to the main game.
 while (/\([^()]*\)/.test(movetext)) {
 movetext = movetext.replace(/\([^()]*\)/g, " ");
 }

 const tokens = movetext.split(/\s+/).filter(Boolean);
 let ply = 0;

 for (const token of tokens) {
 if (/^(1-0|0-1|1\/2-1\/2|\*)$/.test(token)) continue;
 if (/^\d+\.{1,3}$/.test(token)) continue;

 const attachedMove = token.match(/^\d+\.{1,3}(.+)$/)?.[1];
 const cleanToken = attachedMove || token;

 if (/^\$\d+$/.test(cleanToken)) {
 if (ply > 0) nagByPly[ply] = cleanToken;
 continue;
 }

 if (/^\$\d+$/.test(token)) {
 if (ply > 0) nagByPly[ply] = token;
 continue;
 }

 if (!cleanToken || /^\d+\.{1,3}$/.test(cleanToken)) continue;
 ply++;
 }

 return nagByPly;
 }

 function reviewClassFromNag(nag?: string): ReviewClass | null {
 if (nag === "$3") return "Brilliant";
 if (nag === "$1") return "Excellent";
 if (nag === "$2") return "Mistake";
 if (nag === "$4") return "Blunder";
 if (nag === "$5") return "Good";
 if (nag === "$6") return "Inaccuracy";
 if (nag === "$9") return "Miss";
 return null;
 }

 function cleanPgnText(text: string) {
 return text.replace(/\r/g, "").replace(/\$\d+/g, "").trim();
 }

 function resetReviewState() {
 setReviewMap({});
 setReviewLossMap({});
 setReviewBestMap({});
 setReviewCounts({
 Book: 0,
 Brilliant: 0,
 Best: 0,
 Excellent: 0,
 Good: 0,
 Inaccuracy: 0,
 Mistake: 0,
 Miss: 0,
 Blunder: 0,
 });
 setAccuracyWhite(null);
 setAccuracyBlack(null);
 setReviewSummary("");
 setReviewProgress({ done: 0, total: 0 });
 }

 function readHeader(headers: Record<string, string>, ...keys: string[]) {
 for (const key of keys) {
 const value = headers[key];
 if (typeof value === "string" && value.trim()) return value.trim();
 }

 return "";
 }

 function resultLabel(info: GameInfo) {
 if (info.result === "1-0") return `${info.white} won`;
 if (info.result === "0-1") return `${info.black} won`;
 if (info.result === "1/2-1/2") return "Draw";
 if (info.result && info.result !== "*") return info.result;
 return "Result not specified";
 }

 function loadPgn(text: string) {
 const rawText = text.replace(/\r/g, "").trim();
 const nagByPly = extractPgnNags(rawText);
 const cleaned = cleanPgnText(rawText);
 const parsed = new Chess();

 parsed.loadPgn(cleaned);

 const headers = parsed.header() as Record<string, string>;
 const nextGameInfo: GameInfo = {
 event: readHeader(headers, "Event"),
 site: readHeader(headers, "Site"),
 date: readHeader(headers, "Date", "UTCDate"),
 round: readHeader(headers, "Round"),
 white: readHeader(headers, "White") || "White",
 black: readHeader(headers, "Black") || "Black",
 result: readHeader(headers, "Result"),
 eco: readHeader(headers, "ECO"),
 opening: readHeader(headers, "Opening", "Variation"),
 whiteElo: readHeader(headers, "WhiteElo", "WhiteRating"),
 blackElo: readHeader(headers, "BlackElo", "BlackRating"),
 };

 const nextWhitePlayer = nextGameInfo.white;
 const nextBlackPlayer = nextGameInfo.black;

 const replay = new Chess();
 const history = parsed.history();

 const rows: MoveRow[] = [];

 history.forEach((san, index) => {
 const move = replay.move(san);
 if (!move) return;

 rows.push({
 ply: index + 1,
 moveNumber: Math.floor(index / 2) + 1,
 san,
 uci: `${move.from}${move.to}${move.promotion || ""}`,
 color: move.color,
 nag: nagByPly[index + 1],
 fen: replay.fen(),
 });
 });

 const freshStart = new Chess();
 setStartFen(freshStart.fen());
 setMoveRows(rows);
 setCurrentPly(0);
 setGame(freshStart);
 // Keep the original PGN text visible so $1/$3/$9 annotations are not lost after loading.
 setInputText(rawText);
 setBoardOrientation("white");
 setWhitePlayer(nextWhitePlayer);
 setBlackPlayer(nextBlackPlayer);
 setGameInfo(nextGameInfo);
 resetReviewState();
 setMessage(
 `PGN loaded: ${rows.length} plies. ${nextWhitePlayer} vs ${nextBlackPlayer}. ${resultLabel(nextGameInfo)}. Click Review Full Game.`,
 );
 }

 function loadInput() {
 const text = inputText.trim();
 if (!text) {
 setMessage("Paste FEN or PGN first");
 return;
 }

 try {
 if (text.includes("[Event") || text.includes("1.")) {
 loadPgn(text);
 } else {
 loadFenOnly(text);
 }
 } catch {
 try {
 loadFenOnly(text);
 } catch {
 setMessage("Invalid input. Paste a legal FEN or PGN.");
 }
 }
 }

 function isPgnFile(file: File) {
 const name = file.name.toLowerCase();
 return (
 name.endsWith(".pgn") ||
 name.endsWith(".txt") ||
 file.type.startsWith("text/") ||
 file.type === "application/vnd.chess-pgn"
 );
 }

 async function loadPgnFile(file: File) {
 if (!isPgnFile(file)) {
 setMessage("Drop or upload a .pgn / .txt PGN file");
 return;
 }

 try {
 const text = await file.text();
 const cleaned = cleanPgnText(text);

 if (!cleaned) {
 setMessage("PGN file is empty");
 return;
 }

 loadPgn(text);
 setMessage(
 `PGN uploaded: ${file.name}. Click Review Full Game to classify all moves.`,
 );
 } catch {
 setMessage("Could not read PGN file");
 }
 }

 async function handlePgnFileUpload(
 event: React.ChangeEvent<HTMLInputElement>,
 ) {
 const file = event.target.files?.[0];

 if (!file) return;

 await loadPgnFile(file);
 event.target.value = "";
 }

 async function handlePageDrop(event: React.DragEvent<HTMLDivElement>) {
 event.preventDefault();
 setIsPgnDragActive(false);

 const file = event.dataTransfer.files?.[0];
 if (!file) return;

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

 function withTimeout<T>(promise: Promise<T>, ms: number, label: string) {
 return Promise.race([
 promise,
 new Promise<T>((_, reject) => {
 window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
 }),
 ]);
 }

 function scoreCpForReviewSide(scoreCp: number, side: "w" | "b") {
 // stockfishService scoreCp is stored from White's point of view.
 // For review, eval loss must be from the mover's point of view:
 // White wants higher eval, Black wants lower eval.
 return side === "w" ? scoreCp : -scoreCp;
 }
 const REVIEW_ENGINE_TIMEOUT_MS = 9000;

 async function startGameReview() {
 if (moveRows.length < 2) {
 setReviewSummary(
 "Upload or paste a full PGN first. FEN positions use Analyze Now only.",
 );
 return;
 }

 if (!engineReady) {
 setReviewSummary("Engine is still loading");
 return;
 }

 const runId = reviewRunIdRef.current + 1;
 reviewRunIdRef.current = runId;
 setReviewInProgress(true);
 setReviewProgress({ done: 0, total: moveRows.length });

 const nextReviewMap: Record<number, ReviewClass> = {};
 const nextReviewLossMap: Record<number, number> = {};
 const nextReviewBestMap: Record<number, string> = {};
 const counts: Record<ReviewClass, number> = {
 Book: 0,
 Brilliant: 0,
 Best: 0,
 Excellent: 0,
 Good: 0,
 Inaccuracy: 0,
 Mistake: 0,
 Miss: 0,
 Blunder: 0,
 };

 let whiteLoss = 0;
 let blackLoss = 0;
 let whiteMoves = 0;
 let blackMoves = 0;

 setReviewMap({});
 setReviewLossMap({});
 setReviewBestMap({});
 setReviewCounts(counts);
 setAccuracyWhite(null);
 setAccuracyBlack(null);
 setReviewSummary(
 `Review running full game: ${whitePlayer} (White) and ${blackPlayer} (Black)`,
 );

 const reviewNagByPly = extractPgnNags(inputText);
 let openingBookLines: any[] = [];

 try {
 const { data } = await supabase
 .from("opening_lines")
 .select("uci_moves")
 .limit(5000);

 openingBookLines = (data || []).filter((line: any) =>
 Array.isArray(line.uci_moves),
 );
 } catch {
 openingBookLines = [];
 }

 for (const row of moveRows) {
 if (reviewRunIdRef.current !== runId) return;

 const beforeFen = fenByPly[row.ply - 1] || startFen;
 const sideName =
 row.color === "w" ? `${whitePlayer} (White)` : `${blackPlayer} (Black)`;

 const lineToMove = moveRows
 .slice(0, row.ply)
 .map((m) => m.uci)
 .filter(Boolean);
 const isBookMove = openingBookLines.some((line: any) =>
 lineToMove.every((move, index) => line.uci_moves[index] === move),
 );

 const annotationClass = reviewClassFromNag(
 row.nag || reviewNagByPly[row.ply],
 );

 if (annotationClass) {
 nextReviewMap[row.ply] = annotationClass;
 nextReviewLossMap[row.ply] = 0;
 nextReviewBestMap[row.ply] = row.san;
 counts[annotationClass]++;

 if (row.color === "w") {
 whiteMoves++;
 } else {
 blackMoves++;
 }

 setReviewMap({ ...nextReviewMap });
 setReviewLossMap({ ...nextReviewLossMap });
 setReviewBestMap({ ...nextReviewBestMap });
 setReviewCounts({ ...counts });
 setReviewProgress({ done: row.ply, total: moveRows.length });
 setReviewSummary(
 `Review running... ${row.ply}/${moveRows.length} - ${sideName} - PGN annotation`,
 );
 continue;
 }

 if (isBookMove) {
 nextReviewMap[row.ply] = "Book";
 nextReviewLossMap[row.ply] = 0;
 nextReviewBestMap[row.ply] = "Book";
 counts.Book++;

 setReviewMap({ ...nextReviewMap });
 setReviewLossMap({ ...nextReviewLossMap });
 setReviewBestMap({ ...nextReviewBestMap });
 setReviewCounts({ ...counts });
 setReviewProgress({ done: row.ply, total: moveRows.length });
 setReviewSummary(
 `Review running... ${row.ply}/${moveRows.length} - ${sideName}`,
 );
 continue;
 }

 try {
 const beforeEval = await withTimeout(
 stockfishService.getEvaluation(beforeFen),
 REVIEW_ENGINE_TIMEOUT_MS,
 "Before evaluation",
 );
 const bestUci = beforeEval.bestMove || "";

 let evalLossCp = 0;

 const afterPlayed = await withTimeout(
 stockfishService.getEvaluation(row.fen),
 REVIEW_ENGINE_TIMEOUT_MS,
 "After evaluation",
 );
 // stockfishService scoreCp is from the side-to-move point of view.
 // Before the move, side to move is the player being reviewed.
 // After the move, side to move is the opponent, so flip the sign.
 const beforeScore = beforeEval.scoreCp ?? 0;
 const playedScore = -(afterPlayed.scoreCp ?? 0);

 if (row.uci && bestUci && row.uci !== bestUci) {
 evalLossCp = Math.max(0, beforeScore - playedScore);

 const tacticalPunishCp = tacticalPunishCpAfterMove(
 row.fen,
 afterPlayed.bestMove || "",
 row.color,
 );

 evalLossCp = Math.max(evalLossCp, tacticalPunishCp);
 }

 const classification = classifyReviewMove({
 playedUci: row.uci,
 bestUci,
 evalLossCp,
 san: row.san,
 beforeFen,
 afterFen: row.fen,
 moverColor: row.color,
 });

 nextReviewMap[row.ply] = classification;
 nextReviewLossMap[row.ply] = evalLossCp;
 nextReviewBestMap[row.ply] = bestUci
 ? uciToSan(beforeFen, bestUci)
 : "";
 counts[classification]++;

 if (row.color === "w") {
 whiteLoss += evalLossCp;
 whiteMoves++;
 } else {
 blackLoss += evalLossCp;
 blackMoves++;
 }

 setReviewMap({ ...nextReviewMap });
 setReviewLossMap({ ...nextReviewLossMap });
 setReviewBestMap({ ...nextReviewBestMap });
 setReviewCounts({ ...counts });
 setReviewProgress({ done: row.ply, total: moveRows.length });
 setReviewSummary(
 `Review running... ${row.ply}/${moveRows.length} - ${sideName}`,
 );
 } catch {
 nextReviewMap[row.ply] = "Good";
 nextReviewLossMap[row.ply] = 0;
 nextReviewBestMap[row.ply] = "Engine timed out";
 counts.Good++;

 setReviewMap({ ...nextReviewMap });
 setReviewLossMap({ ...nextReviewLossMap });
 setReviewBestMap({ ...nextReviewBestMap });
 setReviewCounts({ ...counts });
 setReviewProgress({ done: row.ply, total: moveRows.length });
 setReviewSummary(
 `Engine was slow at move ${row.ply}; review continued.`,
 );
 }
 }

 setReviewInProgress(false);
 setReviewProgress({ done: moveRows.length, total: moveRows.length });
 setReviewLossMap({ ...nextReviewLossMap });
 setReviewBestMap({ ...nextReviewBestMap });

 const accuracyFromAcl = (acl: number) =>
 Math.max(0, Math.min(100, 100 * Math.exp(-acl / 180)));

 setAccuracyWhite(accuracyFromAcl(whiteLoss / Math.max(1, whiteMoves)));
 setAccuracyBlack(accuracyFromAcl(blackLoss / Math.max(1, blackMoves)));
 setReviewCounts({ ...counts });

 const jumpPriority: ReviewClass[] = [
 'Blunder',
 'Mistake',
 'Miss',
 'Inaccuracy',
 'Good',
 ]

 const firstInteresting =
 jumpPriority
 .map((label) =>
 moveRows.find((row) => nextReviewMap[row.ply] === label)?.ply,
 )
 .find((ply): ply is number => typeof ply === 'number') ??
 moveRows.length

 goToPly(firstInteresting);
 setReviewSummary(
 `Review complete: ${moveRows.length} moves analyzed - ${whitePlayer} vs ${blackPlayer}`,
 );
 }

 // Auto-start full review when arriving from /analyze/review.
 useEffect(() => {
 if (!isReviewMode) return;
 if (!engineReady) return;
 if (moveRows.length < 2) return;
 if (reviewInProgress) return;
 if (reviewAutoStartedRef.current) return;

 reviewAutoStartedRef.current = true;
 setReviewSummary("Game Review starting...");
 void startGameReview();
 }, [isReviewMode, engineReady, moveRows.length, reviewInProgress]);

 const PIECE_VALUE: Record<string, number> = {
 p: 100,
 n: 320,
 b: 330,
 r: 500,
 q: 900,
 k: 0,
 };

 function materialBalanceForSide(fen: string, side: "w" | "b") {
 try {
 const temp = new Chess(fen);

 return temp
 .board()
 .flat()
 .reduce((sum, piece: any) => {
 if (!piece) return sum;

 const value = PIECE_VALUE[piece.type] ?? 0;
 return sum + (piece.color === side ? value : -value);
 }, 0);
 } catch {
 return 0;
 }
 }

 function tacticalPunishCpAfterMove(
 fen: string,
 opponentBestUci: string,
 moverColor: "w" | "b",
 ) {
 if (!opponentBestUci || opponentBestUci.length < 4) return 0;

 try {
 const temp = new Chess(fen);
 const targetSquare = opponentBestUci.slice(2, 4) as Square;
 const captured = temp.get(targetSquare);

 if (!captured || captured.color !== moverColor) return 0;

 const value = PIECE_VALUE[captured.type] ?? 0;

 // If the played move allows the opponent's best reply to win material,
 // use a conservative tactical penalty. This catches "left queen hanging"
 // cases where raw eval-diff may come back too soft.
 if (value >= 900) return 900;
 if (value >= 500) return 450;
 if (value >= 300) return 180;

 return 0;
 } catch {
 return 0;
 }
 }
 function isBrilliantCandidate(args: {
 playedUci: string | undefined;
 evalLossCp: number;
 san?: string;
 beforeFen: string;
 afterFen: string;
 moverColor: "w" | "b";
 }) {
 const { playedUci, evalLossCp, san, beforeFen, afterFen, moverColor } =
 args;

 if (!playedUci || playedUci.length < 4) return false;
 if (evalLossCp > 30) return false;

 const from = playedUci.slice(0, 2);
 const to = playedUci.slice(2, 4);

 try {
 const before = new Chess(beforeFen);
 const movingPiece = before.get(from as Square);

 if (!movingPiece || movingPiece.type === "k") return false;

 const givesCheckOrMate =
 !!san && (san.includes("+") || san.includes("#"));
 const isCapture = !!san && san.includes("x");
 const isPromotion = playedUci.length > 4 || (!!san && san.includes("="));
 const moveHasTacticalShape = givesCheckOrMate || isCapture || isPromotion;

 const beforeMaterial = materialBalanceForSide(beforeFen, moverColor);
 const afterMaterial = materialBalanceForSide(afterFen, moverColor);
 const immediateMaterialDrop = beforeMaterial - afterMaterial;

 // Conservative fallback only:
 // A move is not brilliant just because the moved piece can be captured.
 // That caused ordinary defensive best moves like ...Qxd7 to be marked brilliant.
 // Without a PGN $3 annotation, require a real immediate material sacrifice.
 const isRealSacrifice = immediateMaterialDrop >= 250;

 return isRealSacrifice && moveHasTacticalShape;
 } catch {
 return false;
 }
 }

 function classifyReviewMove(args: {
 playedUci: string | undefined;
 bestUci: string;
 evalLossCp: number;
 san?: string;
 beforeFen: string;
 afterFen: string;
 moverColor: "w" | "b";
 }): ReviewClass {
 const { playedUci, bestUci, evalLossCp } = args;
 const isBestMove = !!playedUci && !!bestUci && playedUci === bestUci;

 if (isBestMove && isBrilliantCandidate(args)) return "Brilliant";
 if (isBestMove) return "Best";
 if (evalLossCp <= 20) return "Excellent";
 if (evalLossCp <= 50) return "Good";
 if (evalLossCp <= 100) return "Inaccuracy";
 if (evalLossCp <= 250) return "Mistake";
 return "Blunder";
 }

 function reviewScore(label: ReviewClass) {
 if (label === "Book") return "Book"
 if (label === "Brilliant") return 100;
 if (label === "Best") return "Best"
 if (label === "Excellent") return "Star"
 if (label === "Good") return "Good"
 if (label === "Inaccuracy") return 55;
 if (label === "Mistake") return 25;
 if (label === "Miss") return "x"
 if (label === "Blunder") return 0;
 return 0;
 }

 function reviewColor(label?: ReviewClass) {
 if (!label) return "#aaa";
 if (label === "Book") return "Book"
 if (label === "Brilliant") return "#67e8f9";
 if (label === "Best") return "Best"
 if (label === "Excellent") return "Star"
 if (label === "Good") return "Good"
 if (label === "Inaccuracy") return "#fde047";
 if (label === "Mistake") return "#fb923c";
 if (label === "Miss") return "x"
 if (label === "Blunder") return "#ef4444";
 return "#aaa";
 }
function reviewShort(label?: ReviewClass) {
 if (!label) return ""
 if (label === "Book") return "Book"
 if (label === "Brilliant") return "!!"
 if (label === "Best") return "Best"
 if (label === "Excellent") return "Star"
 if (label === "Good") return "Good"
 if (label === "Inaccuracy") return "?"
 if (label === "Mistake") return "?!"
 if (label === "Miss") return "x"
 if (label === "Blunder") return "??"
 return ""
}

 function reviewDisplayName(label?: ReviewClass) {
 if (!label) return "";
 if (label === "Excellent") return "Star"
 return label;
 }

 function playBestMove() {
 if (!bestMove || bestMove.length < 4) {
 setMessage("No engine move available");
 return;
 }

 const next = new Chess(game.fen());

 try {
 const move = next.move({
 from: bestMove.slice(0, 2),
 to: bestMove.slice(2, 4),
 promotion: bestMove.length > 4 ? bestMove[4] : undefined,
 });

 if (!move) {
 setMessage("Engine move is not legal here");
 return;
 }

 const row: MoveRow = {
 ply: currentPly + 1,
 moveNumber: Math.floor(currentPly / 2) + 1,
 san: move.san,
 uci: `${move.from}${move.to}${move.promotion || ""}`,
 color: move.color,
 fen: next.fen(),
 };

 const nextRows = moveRows.slice(0, currentPly);
 nextRows.push(row);

 setMoveRows(nextRows);
 setCurrentPly(nextRows.length);
 setGame(next);
 setLastMoveArrow([[move.from, move.to, "#d6c300"]]);
 setMessage(`Engine move played: ${move.san}`);
 } catch {
 setMessage("Could not play engine move");
 }
 }
 function sanitizePgnTextValue(value: string) {
 return (value || '')
 .replace(/[{}]/g, '')
 .replace(/\s+/g, ' ')
 .trim()
 }

 function reviewCommentForPly(ply: number) {
 const label = reviewMap[ply]
 const row = moveRows[ply - 1]

 if (!label || !row) return 'Run review and click a move.'

 const best = reviewBestMap[ply] || '--'
 const lossCp = reviewLossMap[ply] ?? 0
 const loss = (lossCp / 100).toFixed(2)
 const moveText = row.san ? 'Move ' + row.san + ': ' : ''

 if (label === 'Book') return moveText + 'Book move from the opening.'
 if (label === 'Best') return moveText + 'Best move. It matches the engine choice.'
 if (label === 'Excellent') return moveText + 'Great move. Very close to the best move. Best was ' + best + '.'
 if (label === 'Good') return moveText + 'Good move. Best was ' + best + '. Eval loss: ' + loss + '.'
 if (label === 'Brilliant') return moveText + 'Brilliant tactical move.'

 const beforeFen = ply <= 1 ? startFen : moveRows[ply - 2]?.fen || startFen
 const bestLooksUci = /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(best)

 const phase =
 ply <= 20
 ? "opening"
 : moveRows.length - ply <= 20
 ? "endgame"
 : "middlegame"

 try {
 const coach = explainMistake({
 fenBefore: beforeFen,
 userMoveSan: row.san,
 userMoveUci: row.uci,
 bestMoveUci: bestLooksUci ? best : undefined,
 bestMoveSan: bestLooksUci ? undefined : best,
 evalLossCp: lossCp,
 phase,
 source: "analyze",
 userColor: row.color === "w" ? "white" : "black",
 openingName: gameInfo.opening || undefined,
 })

 return (
 moveText +
 coach.title +
 '. ' +
 coach.explanation +
 ' Best was ' +
 best +
 '. ' +
 coach.whyBestMoveWorks +
 ' Lesson: ' +
 coach.lesson +
 (coach.recommendedTrainer ? ' Recommended trainer: ' + coach.recommendedTrainer + '.' : '')
 )
 } catch {
 if (label === 'Inaccuracy') return moveText + 'Inaccuracy. A stronger move was ' + best + '. Eval loss: ' + loss + '.'
 if (label === 'Mistake') return moveText + 'Mistake. This gave up a clear advantage. Best was ' + best + '. Eval loss: ' + loss + '.'
 if (label === 'Miss') return moveText + 'Missed opportunity. Best was ' + best + '. Eval loss: ' + loss + '.'
 if (label === 'Blunder') return moveText + 'Blunder. This strongly changed the position. Best was ' + best + '. Eval loss: ' + loss + '.'

 return moveText + reviewDisplayName(label) + '. Best was ' + best + '. Eval loss: ' + loss + '.'
 }
 }
 function pgnCommentForRow(row: MoveRow) {
 const label = reviewMap[row.ply]
 if (!label) return ''

 const best = reviewBestMap[row.ply] || ''
 const loss = ((reviewLossMap[row.ply] ?? 0) / 100).toFixed(2)
 const parts = [reviewDisplayName(label)]

 if (best && label !== 'Best') parts.push('Best: ' + best)
 if (label !== 'Book' && label !== 'Best') parts.push('Eval loss: ' + loss)

 return ' {' + sanitizePgnTextValue(parts.join('. ')) + '}'
 }

 function pgnHeader(name: string, value: string) {
 const safe = sanitizePgnTextValue(value || '?').replace(/"/g, '')
 return '[' + name + ' "' + safe + '"]'
 }

 function downloadReviewedPgn() {
 if (moveRows.length === 0) {
 setMessage('No PGN loaded.')
 return
 }

 const result = gameInfo.result || '*'
 const date = gameInfo.date || new Date().toISOString().slice(0, 10).replace(/-/g, '.')

 const headers = [
 pgnHeader('Event', gameInfo.event || 'Reviewed Game'),
 pgnHeader('Site', gameInfo.site || 'Weiss Chess Trainer'),
 pgnHeader('Date', date),
 pgnHeader('Round', gameInfo.round || '-'),
 pgnHeader('White', whitePlayer || gameInfo.white || 'White'),
 pgnHeader('Black', blackPlayer || gameInfo.black || 'Black'),
 pgnHeader('Result', result),
 ]

 if (gameInfo.eco) headers.push(pgnHeader('ECO', gameInfo.eco))
 if (gameInfo.opening) headers.push(pgnHeader('Opening', gameInfo.opening))

 const lines: string[] = []

 for (let i = 0; i < moveRows.length; i += 2) {
 const white = moveRows[i]
 const black = moveRows[i + 1]
 let line = Math.floor(i / 2) + 1 + '.'

 if (white) line += ' ' + white.san + pgnCommentForRow(white)
 if (black) line += ' ' + black.san + pgnCommentForRow(black)

 lines.push(line)
 }

 const pgn = headers.join('\n') + '\n\n' + lines.join(' ') + ' ' + result + '\n'
 const blob = new Blob([pgn], { type: 'application/x-chess-pgn;charset=utf-8' })
 const url = URL.createObjectURL(blob)
 const link = document.createElement('a')
 const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')

 link.href = url
 link.download = 'reviewed-game-' + stamp + '.pgn'
 document.body.appendChild(link)
 link.click()
 link.remove()
 URL.revokeObjectURL(url)

 setMessage('Reviewed PGN downloaded.')
 }

 function copyFen() {
 navigator.clipboard.writeText(game.fen());
 setMessage("FEN copied");
 }

 function copyCurrentLine() {
 const line = moveRows
 .slice(0, currentPly)
 .map((m, i) => {
 if (m.color === "w") return `${m.moveNumber}. ${m.san}`;
 return m.san;
 })
 .join(" ");

 navigator.clipboard.writeText(line || game.fen());
 setMessage(line ? "Current line copied" : "FEN copied");
 }
 function resetBoard() {
 const fresh = new Chess();
 setGame(fresh);
 setStartFen(fresh.fen());
 setMoveRows([]);
 setCurrentPly(0);
 setInputText("");
 setMessage("Board reset");
 }

 function flipBoard() {
 setBoardOrientation((v) => (v === "white" ? "black" : "white"));
 }

 const analyzeFen = game.fen();

 const analyzeGlobalBoardState = useMemo(
 () => ({
 isAvailable: true,
 fen: analyzeFen,
 suggestedColor: boardOrientation,
 canFlip: true,
 onFlip: flipBoard,
 }),
 [analyzeFen, boardOrientation],
 );

 useGlobalBoard(analyzeGlobalBoardState);

 useEffect(() => {
 async function initEngine() {
 try {
 await stockfishService.init();
 setEngineReady(true);
 } catch (err) {
 console.error(err);
 }
 }

 initEngine();
 }, []);

 useEffect(() => {
 if (!engineReady) return;

 async function analyzePosition() {
 try {
 const info = await stockfishService.getEvaluation(game.fen());

 setEvalMate(typeof info.mate === "number" ? info.mate : null);
 setEvalMate(typeof info.mate === "number" ? info.mate : null);
 setEvalCp(typeof info.scoreCp === "number" ? info.scoreCp : null);
 setDepth(info.depth ?? 0);

 if (info.bestMove) {
 setBestMove(info.bestMove);
 }

 setTopLines([]);
 } catch (err) {
 console.error(err);
 setTopLines([]);
 }
 }

 if (autoAnalyze) {
 analyzePosition();
 }
 }, [game.fen(), engineReady]);

 function uciToSan(fen: string, uci: string) {
 if (!uci || uci.length < 4) return "";

 try {
 const temp = new Chess(fen);
 const move = temp.move({
 from: uci.slice(0, 2),
 to: uci.slice(2, 4),
 promotion: uci.length > 4 ? uci.slice(4, 5) : undefined,
 });

 return move?.san || uci;
 } catch {
 return uci;
 }
 }

 function formatEval(cp: number | null) {
 if (cp === null) return "--";
 const pawns = cp / 100;
 return `${pawns > 0 ? "+" : ""}${pawns.toFixed(2)}`;
 }

 function evalToWhitePercent(cp: number | null) {
 if (cp === null) return 50;
 const clamped = Math.max(-800, Math.min(800, cp));
 return 50 + (clamped / 800) * 45;
 }
 function isAnalyzePromotionAttempt(from: string, to: string) {
 const piece = game.get(from as Square);
 if (!piece || piece.type !== "p") return false;

 return (
 (piece.color === "w" && to.endsWith("8")) ||
 (piece.color === "b" && to.endsWith("1"))
 );
 }

 function promotionCodeFromPiece(piece?: string | null) {
 if (!piece) return "q";

 const code = piece.toLowerCase();

 if (code.includes("n")) return "n";
 if (code.includes("b")) return "b";
 if (code.includes("r")) return "r";
 if (code.includes("q")) return "q";

 return "q";
 }

 function onAnalyzeDrop(
 sourceSquare: string,
 targetSquare: string,
 promotionPiece?: string | null,
 ) {
 const next = new Chess(game.fen());

 try {
 const move = next.move({
 from: sourceSquare,
 to: targetSquare,
 promotion: isAnalyzePromotionAttempt(sourceSquare, targetSquare)
 ? promotionCodeFromPiece(promotionPiece)
 : "q",
 });

 if (!move) return false;

 const row: MoveRow = {
 ply: currentPly + 1,
 moveNumber: Math.floor(currentPly / 2) + 1,
 san: move.san,
 uci: `${move.from}${move.to}${move.promotion || ""}`,
 color: move.color,
 fen: next.fen(),
 };

 const nextRows = moveRows.slice(0, currentPly);
 nextRows.push(row);

 setMoveRows(nextRows);
 setCurrentPly(nextRows.length);
 setGame(next);
 setLastMoveArrow([[move.from, move.to, "#d6c300"]]);
 setMessage(`Move played: ${move.san}`);

 return true;
 } catch {
 return false;
 }
 }

 const displayEvalMate =
 evalMate === null ? null : game.turn() === "w" ? evalMate : -evalMate;

 const displayEvalCp =
 evalCp === null ? null : game.turn() === "w" ? evalCp : -evalCp;
 const evalDisplay =
 displayEvalMate !== null
 ? displayEvalMate > 0
 ? `M${displayEvalMate}`
 : `-M${Math.abs(displayEvalMate)}`
 : formatEval(displayEvalCp);
 const bestMoveSan =
 bestMove && bestMove.length >= 4
 ? uciToSan(game.fen(), bestMove)
 : bestMove || "--";
 const whiteEvalPercent =
 displayEvalMate !== null
 ? displayEvalMate > 0
 ? 100
 : 0
 : evalToWhitePercent(displayEvalCp);

 useEffect(() => {
 async function detectOpening() {
 const playedUci = moveRows
 .slice(0, currentPly)
 .map((m) => m.uci)
 .filter(Boolean);

 if (playedUci.length < 2) {
 setOpeningName("");
 setOpeningVariation("");
 setOpeningEco("");
 setOpeningSlug("");
 return;
 }

 try {
 const { data, error } = await supabase
 .from("opening_lines")
 .select("name, variation, subvariation, eco, slug, family, uci_moves")
 .limit(5000);

 if (error) throw error;

 const match = (data || [])
 .filter((line: any) => Array.isArray(line.uci_moves))
 .filter((line: any) =>
 playedUci.every((move, index) => line.uci_moves[index] === move),
 )
 .sort((a: any, b: any) => b.uci_moves.length - a.uci_moves.length)[0];

 if (!match) {
 setOpeningName("");
 setOpeningVariation("");
 setOpeningEco("");
 return;
 }

 setOpeningName(match.name || match.family || "");
 setOpeningVariation(
 [match.variation, match.subvariation].filter(Boolean).join(" - "),
 );
 setOpeningEco(match.eco || "");
 setOpeningSlug(match.slug || "");
 } catch (err) {
 console.error(err);
 }
 }

 detectOpening();
 }, [moveRows, currentPly]);

 const REVIEW_TABLE_CLASSES: ReviewClass[] = [
 "Brilliant",
 "Excellent",
 "Book",
 "Best",
 "Good",
 "Inaccuracy",
 "Mistake",
 "Miss",
 "Blunder",
];

 function emptyReviewCounts(): Record<ReviewClass, number> {
 return {
 Book: 0,
 Brilliant: 0,
 Best: 0,
 Excellent: 0,
 Good: 0,
 Inaccuracy: 0,
 Mistake: 0,
 Miss: 0,
 Blunder: 0,
 };
 }

 const reviewCountsBySide = useMemo(() => {
 const white = emptyReviewCounts();
 const black = emptyReviewCounts();

 for (const row of moveRows) {
 const label = reviewMap[row.ply];
 if (!label) continue;

 if (row.color === "w") {
 white[label]++;
 } else {
 black[label]++;
 }
 }

 return { white, black };
 }, [moveRows, reviewMap]);

 const evalBar = (
 <div
 style={{
 width: 26,
 height: boardSize,
 borderRadius: 8,
 overflow: "hidden",
 background: "#111",
 position: "relative",
 flex: "0 0 auto",
 }}
 >
 <div
 style={{
 position: "absolute",
 bottom: 0,
 width: "100%",
 height: `${whiteEvalPercent}%`,
 background: "#f3f3f3",
 }}
 />
 <div
 style={{
 position: "absolute",
 bottom: 8,
 left: 0,
 right: 0,
 textAlign: "center",
 color: "#222",
 fontSize: 11,
 fontWeight: 800,
 }}
 >
 {evalDisplay}
 </div>
 </div>
 );

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

 const analyzePieces = Object.fromEntries(
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

 const visibleLastMoveArrow = showLastMoveArrow ? lastMoveArrow : [];

 const bestMoveArrow =
 showBestMoveArrow && bestMove && bestMove.length >= 4
 ? [[bestMove.slice(0, 2), bestMove.slice(2, 4)]]
 : [];

 const topBoardSide: "w" | "b" = boardOrientation === "white" ? "b" : "w";
 const bottomBoardSide: "w" | "b" = boardOrientation === "white" ? "w" : "b";

 function boardPlayerDisplay(side: "w" | "b") {
 const name = side === "w" ? whitePlayer : blackPlayer;
 const elo = side === "w" ? gameInfo.whiteElo : gameInfo.blackElo;
 return elo ? `${name} (${elo})` : name;
 }

 function boardPlayerBar(side: "w" | "b") {
 const isToMove = game.turn() === side;
 const sideLabel = side === "w" ? "White" : "Black";
 const accuracy = side === "w" ? accuracyWhite : accuracyBlack;

 return (
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
 border: isToMove
 ? "1px solid #7fa650"
 : "1px solid rgba(255,255,255,0.08)",
 fontSize: 13,
 fontWeight: 800,
 }}
 >
 <div
 style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}
 >
 <span
 style={{
 width: 9,
 height: 9,
 borderRadius: 999,
 background: isToMove ? "#7fa650" : "#777",
 flex: "0 0 auto",
 }}
 />
 <span
 style={{
 overflow: "hidden",
 textOverflow: "ellipsis",
 whiteSpace: "nowrap",
 }}
 >
 {boardPlayerDisplay(side)}
 </span>
 </div>

 <div
 style={{
 color: "#aaa",
 fontSize: 11,
 fontWeight: 700,
 flex: "0 0 auto",
 }}
 >
 {sideLabel}
 {accuracy !== null ? ` - ${accuracy.toFixed(1)}%` : ""}
 </div>
 </div>
 );
 }

 function reviewBadgeText(label?: ReviewClass) {
 if (!label) return ""
 if (label === "Book") return "Book"
 if (label === "Brilliant") return "!!"
 if (label === "Best") return "Best"
 if (label === "Excellent") return "Star"
 if (label === "Good") return "Good"
 if (label === "Inaccuracy") return "?"
 if (label === "Mistake") return "?!"
 if (label === "Miss") return "x"
 if (label === "Blunder") return "??"
 return ""
 }

 function reviewBadgeBackground(label?: ReviewClass) {
 if (label === "Book") return "Book"
 if (label === "Brilliant") return "#22d3ee"
 if (label === "Best") return "Best"
 if (label === "Excellent") return "Star"
 if (label === "Good") return "Good"
 if (label === "Inaccuracy") return "#facc15"
 if (label === "Mistake") return "#fb923c"
 if (label === "Miss") return "x"
 if (label === "Blunder") return "#dc2626"
 return "#7fa650"
 }

 function reviewBadgeForeground(label?: ReviewClass) {
 if (
 label === "Book" ||
 label === "Excellent" ||
 label === "Good" ||
 label === "Inaccuracy"
 ) {
 return "#1b1b1b"
 }

 return "#fff"
 }

 function boardSquareCenter(square: string) {
 if (!square || square.length < 2) return null

 const fileIndex = "abcdefgh".indexOf(square[0])
 const rank = Number(square[1])

 if (fileIndex < 0 || !Number.isFinite(rank) || rank < 1 || rank > 8) {
 return null
 }

 const squareSize = boardSize / 8
 const col = boardOrientation === "white" ? fileIndex : 7 - fileIndex
 const row = boardOrientation === "white" ? 8 - rank : rank - 1

 return {
 left: col * squareSize + squareSize / 2,
 top: row * squareSize + squareSize / 2,
 }
 }

 const currentReviewRow =
 currentPly > 0 ? moveRows[currentPly - 1] : undefined
 const currentReviewLabel =
 currentPly > 0 ? reviewMap[currentPly] : undefined
 const currentReviewSquare = currentReviewRow?.uci
 ? currentReviewRow.uci.slice(2, 4)
 : ""
 const currentReviewPosition = boardSquareCenter(currentReviewSquare)
 const currentReviewBadgeSize = Math.max(20, Math.min(30, boardSize / 26))

 const reviewBoardBadge =
 currentReviewLabel && currentReviewPosition ? (
 <div
 data-name="review-board-classification-badge"
 title={reviewDisplayName(currentReviewLabel)}
 style={{
 position: "absolute",
 left: Math.min(
 boardSize - currentReviewBadgeSize * 0.55,
 Math.max(
 currentReviewBadgeSize * 0.55,
 currentReviewPosition.left + boardSize / 16 - currentReviewBadgeSize * 0.15,
 ),
 ),
 top: Math.min(
 boardSize - currentReviewBadgeSize * 0.55,
 Math.max(
 currentReviewBadgeSize * 0.55,
 currentReviewPosition.top - boardSize / 16 + currentReviewBadgeSize * 0.15,
 ),
 ),
 width: currentReviewBadgeSize,
 height: currentReviewBadgeSize,
 borderRadius: 999,
 transform: "translate(-50%, -50%)",
 background: reviewBadgeBackground(currentReviewLabel),
 color: reviewBadgeForeground(currentReviewLabel),
 border: "1px solid rgba(255,255,255,0.92)",
 boxShadow: "0 5px 12px rgba(0,0,0,0.35)",
 display: "flex",
 alignItems: "center",
 justifyContent: "center",
 fontSize:
 currentReviewLabel === "Book"
 ? Math.max(14, currentReviewBadgeSize * 0.5)
 : Math.max(12, currentReviewBadgeSize * 0.42),
 fontWeight: 950,
 zIndex: 80,
 pointerEvents: "none",
 lineHeight: 1,
 }}
 >
 {reviewBadgeText(currentReviewLabel)}
 </div>
 ) : null

 const boardWithControls = (
 <div style={{ display: "flex", gap: 10 }}>
 <div style={{ paddingTop: 28 }}>{evalBar}</div>

 <div>
 {boardPlayerBar(topBoardSide)}

 <div style={{ position: "relative", width: boardSize, height: boardSize }}>
<Chessboard
 id="AnalyzeBoard"
 position={(isSetupPositionOpen ? setupBoard : game.fen()) as any}
 boardWidth={boardSize}
 boardOrientation={boardOrientation}
 onSquareClick={(square) => {
 if (isSetupPositionOpen) setupSquareClick(square);
 }}
 onPieceDrop={(sourceSquare, targetSquare) => {
 if (isSetupPositionOpen) {
 return setupPieceDrop(sourceSquare, targetSquare);
 }

 if (isAnalyzePromotionAttempt(sourceSquare, targetSquare))
 return false;
 return onAnalyzeDrop(sourceSquare, targetSquare);
 }}
 onPromotionCheck={(sourceSquare, targetSquare) =>
 !isSetupPositionOpen &&
 isAnalyzePromotionAttempt(sourceSquare, targetSquare)
 }
 onPromotionPieceSelect={(piece, sourceSquare, targetSquare) => {
 if (isSetupPositionOpen) return false;
 if (!sourceSquare || !targetSquare) return false;
 return onAnalyzeDrop(sourceSquare, targetSquare, piece);
 }}
 promotionDialogVariant="vertical"
 arePiecesDraggable={true}
 customPieces={analyzePieces}
 customArrows={[...visibleLastMoveArrow, ...bestMoveArrow] as any}
 showBoardNotation={showCoordinates}
 customDarkSquareStyle={{ backgroundColor: "#769656" }}
 customLightSquareStyle={{ backgroundColor: "#eeeed2" }}
 customBoardStyle={{
 borderRadius: "8px",
 overflow: "hidden",
 }}
 />

 {reviewBoardBadge}
 </div>

 {boardPlayerBar(bottomBoardSide)}

 <div
 style={{
 display: "grid",
 gridTemplateColumns: "repeat(4, 1fr)",
 gap: 8,
 marginTop: 6,
 }}
 >
 <SecondaryButton
 onClick={() => goToPly(0)}
 disabled={moveRows.length === 0}
 >
 First
 </SecondaryButton>
 <SecondaryButton
 onClick={() => goToPly(currentPly - 1)}
 disabled={currentPly <= 0}
 >
 Prev
 </SecondaryButton>
 <SecondaryButton
 onClick={() => goToPly(currentPly + 1)}
 disabled={currentPly >= moveRows.length}
 >
 Next
 </SecondaryButton>
 <SecondaryButton
 onClick={() => goToPly(moveRows.length)}
 disabled={moveRows.length === 0}
 >
 Last
 </SecondaryButton>
 </div>
 </div>
 </div>
 );
 return (
 <div
 onDragOver={handlePageDragOver}
 onDragLeave={handlePageDragLeave}
 onDrop={handlePageDrop}
 style={{
 position: "relative",
 minHeight: "100vh",
 marginLeft: -ANALYZE_LAYOUT_SHIFT_LEFT,
 width: `calc(100% + ${ANALYZE_LAYOUT_SHIFT_LEFT}px)`,
 }}
 >
 {isPgnDragActive && (
 <div
 style={{
 position: "fixed",
 inset: 0,
 zIndex: 9999,
 background: "rgba(0, 0, 0, 0.55)",
 border: "3px dashed #7fa650",
 display: "flex",
 alignItems: "center",
 justifyContent: "center",
 color: "#f3f3f3",
 fontSize: 28,
 fontWeight: 900,
 pointerEvents: "none",
 }}
 >
 Drop PGN to load game review
 </div>
 )}
 {showImageToPosition && (
 <ImageToPositionPanel
 initialFen={game.fen()}
 onLoadFen={loadFenOnly}
 onClose={() => setShowImageToPosition(false)}
 />
 )}
 <TrainerShell
 title={isReviewMode ? "Game Review" : "Analyze"}
 subtitle={isReviewMode ? "Full game review" : "Position analysis"}
 boardSize={boardSize}
 isDragging={isDragging}
 isHandleHovered={isHandleHovered}
 setIsDragging={setIsDragging}
 setIsHandleHovered={setIsHandleHovered}
 containerRef={containerRef}
 footerLeft={isReviewMode ? "Review" : "Analyze"}
 footerRight={`${boardSize}px`}
 board={boardWithControls}
 sidePanelWidth={ANALYZE_SIDE_PANEL_WIDTH}
 sidePanel={
 <>
 <style>{`
 .analyze-review-grid {
 display: grid;
 grid-template-columns: minmax(210px, 0.85fr) minmax(165px, 0.62fr) minmax(240px, 1.08fr) minmax(240px, 1.08fr);
 grid-template-areas:
 "review details moves moves"
 "review status moves moves"
 "setup pgn moves moves"
 "setup opening moves moves"
 "import engine moves moves";
 gap: 7px;
 align-items: start;
 padding-right: 0;
 box-sizing: border-box;
 height: calc(100vh - 118px);
 max-height: calc(100vh - 118px);
 overflow: hidden;
 }

 .analyze-review-grid.review-loaded {
 grid-template-areas:
 "review details moves moves"
 "review status moves moves";
 grid-template-rows: auto 1fr;
 }

 /* In full-game review mode, hide setup/analyze panels so the review fits at 100% zoom. */
 .analyze-review-grid.review-loaded > :nth-child(4),
 .analyze-review-grid.review-loaded > :nth-child(5),
 .analyze-review-grid.review-loaded > :nth-child(6),
 .analyze-review-grid.review-loaded > :nth-child(8),
 .analyze-review-grid.review-loaded > :nth-child(9) {
 display: none;
 }

 .analyze-review-grid > :nth-child(1) { grid-area: review; min-height: 0; }
 .analyze-review-grid > :nth-child(2) { grid-area: details; min-height: 0; }
 .analyze-review-grid > :nth-child(3) { grid-area: status; min-height: 0; }
 .analyze-review-grid > :nth-child(4) { grid-area: setup; min-height: 0; }
 .analyze-review-grid > :nth-child(5) { grid-area: pgn; min-height: 0; }
 .analyze-review-grid > :nth-child(6) { grid-area: opening; min-height: 0; }
 .analyze-review-grid > :nth-child(7) {
 grid-area: moves;
 min-height: 0;
 align-self: stretch;
 display: flex;
 flex-direction: column;
 gap: 7px;
 }
 .analyze-review-grid > :nth-child(8) { grid-area: import; min-height: 0; }
 .analyze-review-grid > :nth-child(9) { grid-area: engine; min-height: 0; }

 .analyze-review-grid.review-mode {
 grid-template-areas:
 "review details moves moves"
 "review details moves moves";
 grid-template-rows: 1fr;
 }

 .analyze-review-grid.review-mode > :nth-child(3),
 .analyze-review-grid.review-mode > :nth-child(4),
 .analyze-review-grid.review-mode > :nth-child(5),
 .analyze-review-grid.review-mode > :nth-child(6),
 .analyze-review-grid.review-mode > :nth-child(8),
 .analyze-review-grid.review-mode > :nth-child(9) {
 display: none !important;
 }

 .analyze-review-grid.review-mode > :nth-child(1) {
 grid-area: review;
 display: block !important;
 }

 .analyze-review-grid.review-mode > :nth-child(2) {
 grid-area: details;
 display: block !important;
 }

 .analyze-review-grid.review-mode > :nth-child(7) {
 grid-area: moves;
 display: flex !important;
 min-height: 0;
 align-self: stretch;
 flex-direction: column;
 gap: 7px;
 }
 `}</style>
 <div
 className={`analyze-review-grid ${
 isReviewMode
 ? "review-mode"
 : moveRows.length > 0
 ? "review-loaded"
 : ""
 }`}
 >
 <PanelCard>
 <SectionTitle>Game Review</SectionTitle>

 <div
 style={{
 fontSize: 12,
 color: "#cfcfcf",
 lineHeight: 1.5,
 marginBottom: 8,
 background: "#211e1b",
 borderRadius: 10,
 padding: 8,
 border: "1px solid rgba(255,255,255,0.08)",
 }}
 >
 <div
 style={{ fontWeight: 800, color: "#f3f3f3", marginBottom: 6 }}
 >
 {moveRows.length > 0
 ? `${gameInfo.white} vs ${gameInfo.black}`
 : "No PGN game loaded"}
 </div>

 <div>
 White: <b>{gameInfo.white}</b>
 {gameInfo.whiteElo ? ` (${gameInfo.whiteElo})` : ""}
 </div>
 <div>
 Black: <b>{gameInfo.black}</b>
 {gameInfo.blackElo ? ` (${gameInfo.blackElo})` : ""}
 </div>

 {moveRows.length > 0 && (
 <div style={{ marginTop: 6, color: "#aaa" }}>
 {[
 gameInfo.result
 ? `Result: ${gameInfo.result} - ${resultLabel(gameInfo)}`
 : "",
 gameInfo.date ? `Date: ${gameInfo.date}` : "",
 gameInfo.event ? `Event: ${gameInfo.event}` : "",
 gameInfo.eco ? `ECO: ${gameInfo.eco}` : "",
 gameInfo.opening ? `Opening: ${gameInfo.opening}` : "",
 ]
 .filter(Boolean)
 .map((item) => (
 <div key={item}>{item}</div>
 ))}
 </div>
 )}

 <div style={{ marginTop: 8 }}>
 Review checks both sides. Use View White / View Black to
 choose board side.
 </div>
 </div>

 <div
 style={{
 display: "grid",
 gridTemplateColumns: "1fr 1fr",
 gap: 6,
 marginBottom: 8,
 }}
 >
 <SecondaryButton onClick={() => setBoardOrientation("white")}>
 View White
 </SecondaryButton>
 <SecondaryButton onClick={() => setBoardOrientation("black")}>
 View Black
 </SecondaryButton>
 </div>

 <div
 style={{
 display: "flex",
 gap: 8,
 flexWrap: "wrap",
 marginBottom: 8,
 }}
 >
 <button
 onClick={startGameReview}
 disabled={
 !engineReady || moveRows.length === 0 || reviewInProgress
 }
 style={{
 width: "100%",
 border: "none",
 borderRadius: 10,
 padding: "10px 14px",
 cursor:
 !engineReady || moveRows.length === 0 || reviewInProgress
 ? "default"
 : "pointer",
 background:
 !engineReady || moveRows.length === 0
 ? "#4b4642"
 : reviewInProgress
 ? "#5f8f3a"
 : "#7fa650",
 color: "#ffffff",
 fontWeight: 900,
 fontSize: 14,
 boxShadow:
 !engineReady || moveRows.length === 0 || reviewInProgress
 ? "none"
 : "0 0 0 1px rgba(255,255,255,0.10), 0 8px 20px rgba(127,166,80,0.28)",
 opacity: !engineReady || moveRows.length === 0 ? 0.65 : 1,
 }}
 >
 {reviewInProgress ? "Review Running..." : "Review Now"}
 </button>
 </div>

 {reviewProgress.total > 0 && (
 <div style={{ marginBottom: 10 }}>
 <div
 style={{
 height: 7,
 background: "#211e1b",
 borderRadius: 999,
 overflow: "hidden",
 }}
 >
 <div
 style={{
 height: "100%",
 width: `${Math.round((reviewProgress.done / Math.max(1, reviewProgress.total)) * 100)}%`,
 background: "#7fa650",
 }}
 />
 </div>
 <div style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>
 {reviewProgress.done} / {reviewProgress.total} moves checked
 </div>
 </div>
 )}

 {reviewSummary && (
 <div style={{ fontSize: 13, color: "#aaa", marginBottom: 10 }}>
 {reviewSummary}
 </div>
 )}

 <div
 style={{
 marginTop: 8,
 background: "#211e1b",
 borderRadius: 10,
 padding: 8,
 border: "1px solid rgba(255,255,255,0.08)",
 width: "calc(100% + 54px)",
 maxWidth: 260,
 boxSizing: "border-box",
 overflow: "visible",
 }}
 >
 <div
 style={{
 display: "grid",
 gridTemplateColumns: "minmax(104px, 1fr) 46px 48px",
 gap: "6px 8px",
 alignItems: "center",
 fontSize: 12,
 }}
 >
 <div style={{ color: "#aaa", fontWeight: 800 }}>
 Classification
 </div>
 <div
 style={{
 color: "#f3f3f3",
 fontWeight: 900,
 textAlign: "center",
 }}
 >
 White
 <div
 style={{
 color: "#aaa",
 fontSize: 8,
 fontWeight: 600,
 maxWidth: 54,
 overflow: "hidden",
 textOverflow: "ellipsis",
 whiteSpace: "nowrap",
 margin: "0 auto 0 24px",
 }}
 >
 {whitePlayer}
 </div>
 </div>
 <div
 style={{
 color: "#f3f3f3",
 fontWeight: 900,
 textAlign: "center",
 }}
 >
 Black
 <div
 style={{
 color: "#aaa",
 fontSize: 8,
 fontWeight: 600,
 maxWidth: 54,
 overflow: "hidden",
 textOverflow: "ellipsis",
 whiteSpace: "nowrap",
 margin: "0 auto 0 24px",
 }}
 >
 {blackPlayer}
 </div>
 </div>

 <div
 style={{
 color: "#aaa",
 borderTop: "1px solid rgba(255,255,255,0.08)",
 paddingTop: 8,
 }}
 >
 Accuracy
 </div>
 <div
 style={{
 textAlign: "center",
 borderTop: "1px solid rgba(255,255,255,0.08)",
 paddingTop: 8,
 fontWeight: 900,
 }}
 >
 {accuracyWhite !== null
 ? accuracyWhite.toFixed(1) + "%"
 : "--"}
 </div>
 <div
 style={{
 textAlign: "center",
 borderTop: "1px solid rgba(255,255,255,0.08)",
 paddingTop: 8,
 fontWeight: 900,
 }}
 >
 {accuracyBlack !== null
 ? accuracyBlack.toFixed(1) + "%"
 : "--"}
 </div>

 {REVIEW_TABLE_CLASSES.map((label) => (
 <React.Fragment key={label}>
 <div
 style={{ color: reviewColor(label), fontWeight: 800 }}
 >
 {reviewShort(label)} {reviewDisplayName(label)}
 </div>
 <button
 onClick={() => {
 const row = moveRows.find(
 (m) =>
 m.color === "w" && reviewMap[m.ply] === label,
 );
 if (row) goToPly(row.ply);
 }}
 disabled={reviewCountsBySide.white[label] === 0}
 style={{
 border: "none",
 borderRadius: 7,
 padding: "3px 5px",
 textAlign: "center",
 cursor:
 reviewCountsBySide.white[label] > 0
 ? "pointer"
 : "default",
 background:
 reviewCountsBySide.white[label] > 0
 ? "#2b2724"
 : "transparent",
 color:
 reviewCountsBySide.white[label] > 0
 ? reviewColor(label)
 : "#555",
 fontWeight: 900,
 }}
 >
 {reviewCountsBySide.white[label]}
 </button>
 <button
 onClick={() => {
 const row = moveRows.find(
 (m) =>
 m.color === "b" && reviewMap[m.ply] === label,
 );
 if (row) goToPly(row.ply);
 }}
 disabled={reviewCountsBySide.black[label] === 0}
 style={{
 border: "none",
 borderRadius: 7,
 padding: "3px 5px",
 textAlign: "center",
 cursor:
 reviewCountsBySide.black[label] > 0
 ? "pointer"
 : "default",
 background:
 reviewCountsBySide.black[label] > 0
 ? "#2b2724"
 : "transparent",
 color:
 reviewCountsBySide.black[label] > 0
 ? reviewColor(label)
 : "#555",
 fontWeight: 900,
 }}
 >
 {reviewCountsBySide.black[label]}
 </button>
 </React.Fragment>
 ))}
 </div>

 <div
 style={{
 marginTop: 8,
 fontSize: 11,
 color: "#aaa",
 lineHeight: 1.4,
 }}
 >
 Click a number to jump to the first move of that type for that
 side.
 </div>
 </div>
 </PanelCard>

 <PanelCard>
 <SectionTitle>Review Details</SectionTitle>

 {currentPly > 0 && reviewMap[currentPly] ? (
 <div style={{ fontSize: 13, lineHeight: 1.8 }}>
 <div>
 Move: <b>{moveRows[currentPly - 1]?.san}</b>
 </div>

 <div>
 Side:{" "}
 {moveRows[currentPly - 1]?.color === "w"
 ? `${whitePlayer} (White)`
 : `${blackPlayer} (Black)`}
 </div>

 <div
 style={{
 color: reviewColor(reviewMap[currentPly]),
 fontWeight: 800,
 }}
 >
 {reviewDisplayName(reviewMap[currentPly])}
 </div>

 <div>
 Eval loss:{" "}
 {((reviewLossMap[currentPly] ?? 0) / 100).toFixed(2)}
 </div>

 <div>Best move: {reviewBestMap[currentPly] || "--"}</div>

 <div
 style={{
 marginTop: 8,
 padding: 8,
 borderRadius: 8,
 background: "#211e1b",
 color: "#e5e5e5",
 lineHeight: 1.5,
 }}
 >
 {reviewCommentForPly(currentPly)}
 </div>
 </div>
 ) : (
 <div style={{ color: "#aaa", fontSize: 12 }}>
 Run review and click a move.
 </div>
 )}
 </PanelCard>

 <PanelCard>
 <SectionTitle>Status</SectionTitle>
 <div style={{ fontSize: 13, color: "#d0d0d0", lineHeight: 1.5 }}>
 {message}
 </div>

 <div
 style={{
 marginTop: 8,
 fontSize: 11,
 color: "#aaa",
 lineHeight: 1.4,
 wordBreak: "break-all",
 background: "#211e1b",
 borderRadius: 8,
 padding: 8,
 }}
 >
 {game.fen()}
 </div>
 </PanelCard>

 <PanelCard>
 <SectionTitle>Setup Position</SectionTitle>

 <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
 <PrimaryButton onClick={openSetupPosition}>
 {isSetupPositionOpen ? "Reload From Board" : "Setup Position"}
 </PrimaryButton>

 <div style={{ marginTop: 8 }}>
 <SecondaryButton
 onClick={downloadReviewedPgn}
 disabled={moveRows.length === 0}
 >
 Download Reviewed PGN
 </SecondaryButton>
 </div>

 {reviewProgress.total > 0 && (
 <div
 data-name="review-progress-bar"
 style={{
 marginTop: 8,
 background: '#211e1b',
 border: '1px solid rgba(255,255,255,0.08)',
 borderRadius: 999,
 overflow: 'hidden',
 height: 10,
 }}
 >
 <div
 style={{
 width:
 Math.min(
 100,
 Math.round(
 (reviewProgress.done / Math.max(1, reviewProgress.total)) *
 100,
 ),
 ) + '%',
 height: '100%',
 background: '#7fa650',
 transition: 'width 0.2s ease',
 }}
 />
 </div>
 )}
 {isSetupPositionOpen && (
 <SecondaryButton onClick={() => setIsSetupPositionOpen(false)}>
 Close
 </SecondaryButton>
 )}
 </div>

 {!isSetupPositionOpen ? (
 <div style={{ fontSize: 12, color: "#cfcfcf", lineHeight: 1.5 }}>
 Open setup mode to build a custom FEN by placing pieces on the board.
 </div>
 ) : (
 <div style={{ maxHeight: 330, overflowY: "auto", paddingRight: 2 }}>
 <div style={{ fontSize: 12, color: "#cfcfcf", lineHeight: 1.5, marginBottom: 8 }}>
 Choose a piece, then click squares. Select Clear to delete.
 </div>

 <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 5, marginBottom: 8 }}>
 {SETUP_PIECES.map((piece) => (
 <button
 key={piece.code}
 onClick={() => setSetupSelectedPiece(piece.code)}
 title={piece.label}
 style={{
 border:
 setupSelectedPiece === piece.code
 ? "1px solid #b9e58a"
 : "1px solid rgba(255,255,255,0.12)",
 borderRadius: 8,
 padding: 3,
 background:
 setupSelectedPiece === piece.code ? "#3b4f27" : "#2b2724",
 cursor: "pointer",
 minHeight: 36,
 }}
 >
 <img
 src={PIECE_URLS[piece.code]}
 alt={piece.label}
 draggable={false}
 style={{ width: 28, height: 28, display: "block", margin: "0 auto" }}
 />
 </button>
 ))}
 </div>

 <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
 <SecondaryButton onClick={() => setSetupSelectedPiece("clear")}>
 Clear{setupSelectedPiece === "clear" ? " *" : ""}
 </SecondaryButton>
 <SecondaryButton onClick={setupStartPosition}>Start</SecondaryButton>
 <SecondaryButton onClick={setupClearBoard}>Empty</SecondaryButton>
 </div>

 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
 <SecondaryButton onClick={() => setSetupTurn("w")}>
 White move{setupTurn === "w" ? " *" : ""}
 </SecondaryButton>
 <SecondaryButton onClick={() => setSetupTurn("b")}>
 Black move{setupTurn === "b" ? " *" : ""}
 </SecondaryButton>
 </div>

 <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8, fontSize: 12, color: "#cfcfcf" }}>
 <label>
 <input
 type="checkbox"
 checked={setupCastling.K}
 onChange={(e) =>
 setSetupCastling((c) => ({ ...c, K: e.target.checked }))
 }
 />{" "}
 W O-O
 </label>
 <label>
 <input
 type="checkbox"
 checked={setupCastling.Q}
 onChange={(e) =>
 setSetupCastling((c) => ({ ...c, Q: e.target.checked }))
 }
 />{" "}
 W O-O-O
 </label>
 <label>
 <input
 type="checkbox"
 checked={setupCastling.k}
 onChange={(e) =>
 setSetupCastling((c) => ({ ...c, k: e.target.checked }))
 }
 />{" "}
 B O-O
 </label>
 <label>
 <input
 type="checkbox"
 checked={setupCastling.q}
 onChange={(e) =>
 setSetupCastling((c) => ({ ...c, q: e.target.checked }))
 }
 />{" "}
 B O-O-O
 </label>
 </div>

 <div style={{ fontSize: 11, color: "#aaa", wordBreak: "break-all", background: "#2b2724", borderRadius: 8, padding: 8, marginBottom: 8 }}>
 {buildSetupFen()}
 </div>

 <PrimaryButton onClick={loadSetupPosition}>Load Setup</PrimaryButton>
 </div>
 )}
 </PanelCard>

 <PanelCard>
 <SectionTitle>Position / PGN</SectionTitle>

 <textarea
 value={inputText}
 onChange={(e) => setInputText(e.target.value)}
 placeholder="Paste FEN or PGN here"
 style={{
 width: "100%",
 minHeight: 86,
 resize: "vertical",
 background: "#2b2724",
 color: "#f3f3f3",
 border: "1px solid rgba(255,255,255,0.12)",
 borderRadius: 10,
 padding: 10,
 boxSizing: "border-box",
 fontSize: 12,
 lineHeight: 1.4,
 }}
 />

 <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
 <PrimaryButton onClick={loadInput}>Load</PrimaryButton>
 <SecondaryButton onClick={resetBoard}>Reset</SecondaryButton>
 </div>

 <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
 <SecondaryButton onClick={flipBoard}>
 Flip Board
 </SecondaryButton>
 </div>

 <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
 <SecondaryButton onClick={copyFen}>Copy FEN</SecondaryButton>
 <SecondaryButton onClick={copyCurrentLine}>
 Copy Line
 </SecondaryButton>
 </div>
 </PanelCard>
 <PanelCard>
 <SectionTitle>Opening</SectionTitle>

 <div style={{ fontSize: 13, color: "#f3f3f3", lineHeight: 1.7 }}>
 <div>{openingName || "No opening detected yet"}</div>
 {openingVariation && (
 <div style={{ color: "#cfcfcf" }}>{openingVariation}</div>
 )}
 {openingEco && (
 <div style={{ color: "#aaa" }}>ECO: {openingEco}</div>
 )}
 </div>

 {openingSlug && (
 <div style={{ marginTop: 10 }}>
 <SecondaryButton
 onClick={() => {
 window.location.href = `/openings/${openingSlug}`;
 }}
 >
 Train Opening
 </SecondaryButton>
 </div>
 )}
 </PanelCard>

 <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
 <PanelCard>
 <SectionTitle>Moves</SectionTitle>

 {moveRows.length === 0 ? (
 <div style={{ fontSize: 12, color: "#cfcfcf" }}>
 Paste a PGN to show the move list.
 </div>
 ) : (
 <div
 style={{
 height: "calc(100vh - 300px)",
 maxHeight: "calc(100vh - 300px)",
 minHeight: 420,
 overflowY: "auto",
 display: "grid",
 gridTemplateColumns: "30px minmax(120px, 1fr) minmax(120px, 1fr)",
 gap: "4px 7px",
 fontSize: 13,
 alignItems: "center",
 }}
 >
 {Array.from({ length: Math.ceil(moveRows.length / 2) }).map(
 (_, i) => {
 const white = moveRows[i * 2];
 const black = moveRows[i * 2 + 1];

 return (
 <div key={i} style={{ display: "contents" }}>
 <div style={{ color: "#aaa" }}>{i + 1}.</div>

 <button
 onClick={() => white && goToPly(white.ply)}
 style={{
 textAlign: "left",
 borderRadius: 6,
 padding: "3px 5px",
 cursor: white ? "pointer" : "default",
 border:
 currentPly === white?.ply
 ? "1px solid #b9e58a"
 : "1px solid transparent",
 background:
 currentPly === white?.ply
 ? "#7fa650"
 : "#2b2724",
 color: "#f3f3f3",
 fontWeight:
 currentPly === white?.ply ? 800 : 500,
 }}
 >
 {white?.san || ""}
 <span
 style={{
 float: "right",
 color: reviewColor(reviewMap[white?.ply]),
 fontWeight: 700,
 fontSize: 11,
 }}
 >
 {reviewShort(reviewMap[white?.ply])}
 </span>
 </button>

 <button
 onClick={() => black && goToPly(black.ply)}
 style={{
 textAlign: "left",
 borderRadius: 6,
 padding: "3px 5px",
 cursor: black ? "pointer" : "default",
 border:
 currentPly === black?.ply
 ? "1px solid #b9e58a"
 : "1px solid transparent",
 background:
 currentPly === black?.ply
 ? "#7fa650"
 : "#2b2724",
 color: "#f3f3f3",
 fontWeight:
 currentPly === black?.ply ? 800 : 500,
 }}
 >
 {black?.san || ""}
 <span
 style={{
 float: "right",
 color: reviewColor(reviewMap[black?.ply]),
 fontWeight: 700,
 fontSize: 11,
 }}
 >
 {reviewShort(reviewMap[black?.ply])}
 </span>
 </button>
 </div>
 );
 },
 )}
 </div>
 )}
 </PanelCard>

 <PanelCard>
 <SectionTitle>Move navigation</SectionTitle>

 <div
 style={{
 display: "grid",
 gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
 gap: 6,
 }}
 >
 <SecondaryButton
 onClick={() => goToPly(0)}
 disabled={moveRows.length === 0}
 >
 First
 </SecondaryButton>
 <SecondaryButton
 onClick={() => goToPly(currentPly - 1)}
 disabled={currentPly <= 0}
 >
 Prev
 </SecondaryButton>
 <SecondaryButton
 onClick={() => goToPly(currentPly + 1)}
 disabled={currentPly >= moveRows.length}
 >
 Next
 </SecondaryButton>
 <SecondaryButton
 onClick={() => goToPly(moveRows.length)}
 disabled={moveRows.length === 0}
 >
 Last
 </SecondaryButton>
 </div>

 <div style={{ marginTop: 8, fontSize: 12, color: "#cfcfcf" }}>
 Ply {currentPly} / {moveRows.length}
 </div>
 </PanelCard>
 </div>

 <PanelCard>
 <SectionTitle>Import</SectionTitle>
 <div
 style={{
 fontSize: 12,
 color: "#cfcfcf",
 lineHeight: 1.5,
 marginBottom: 8,
 }}
 >
 Drop a PGN anywhere on the page, or use the upload button.
 </div>
 <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
 <input
 ref={pgnFileInputRef}
 type="file"
 accept=".pgn,.txt,text/plain,application/x-chess-pgn"
 onChange={handlePgnFileUpload}
 style={{ display: "none" }}
 />
 <SecondaryButton
 onClick={() => pgnFileInputRef.current?.click()}
 >
 Upload PGN
 </SecondaryButton>
 <SecondaryButton onClick={() => setShowImageToPosition(true)}>
 Image to Position
 </SecondaryButton>
 </div>
 </PanelCard>

 <PanelCard>
 <SectionTitle>Engine</SectionTitle>

 <div style={{ lineHeight: 1.8 }}>
 <div>Evaluation: {evalCp !== null ? evalDisplay : "--"}</div>

 <div>Depth: {depth}</div>

 <div>Best move: {bestMoveSan}</div>

 <div style={{ marginTop: 10 }}>
 <SecondaryButton onClick={playBestMove} disabled={!bestMove}>
 Play Best Move
 </SecondaryButton>

 <SecondaryButton
 onClick={async () => {
 try {
 const info = await stockfishService.getEvaluation(
 game.fen(),
 );
 setEvalMate(
 typeof info.mate === "number" ? info.mate : null,
 );
 setEvalCp(
 typeof info.scoreCp === "number"
 ? info.scoreCp
 : null,
 );
 setDepth(info.depth ?? 0);
 if (info.bestMove) setBestMove(info.bestMove);
 setMessage("Position analyzed");
 } catch {
 setMessage("Could not analyze position");
 }
 }}
 >
 Analyze Now
 </SecondaryButton>

 <div
 style={{
 marginTop: 10,
 display: "flex",
 alignItems: "center",
 gap: 8,
 fontSize: 13,
 }}
 >
 <input
 type="checkbox"
 checked={showBestMoveArrow}
 onChange={(e) => setShowBestMoveArrow(e.target.checked)}
 />
 <span>Show best move arrow</span>
 </div>

 <div
 style={{
 marginTop: 8,
 display: "flex",
 alignItems: "center",
 gap: 8,
 fontSize: 13,
 }}
 >
 <input
 type="checkbox"
 checked={showCoordinates}
 onChange={(e) => setShowCoordinates(e.target.checked)}
 />
 <span>Show coordinates</span>
 </div>

 <div
 style={{
 marginTop: 8,
 display: "flex",
 alignItems: "center",
 gap: 8,
 fontSize: 13,
 }}
 >
 <input
 type="checkbox"
 checked={showLastMoveArrow}
 onChange={(e) => setShowLastMoveArrow(e.target.checked)}
 />
 <span>Show last move arrow</span>
 </div>

 <div
 style={{
 marginTop: 8,
 display: "flex",
 alignItems: "center",
 gap: 8,
 fontSize: 13,
 }}
 >
 <input
 type="checkbox"
 checked={autoAnalyze}
 onChange={(e) => setAutoAnalyze(e.target.checked)}
 />
 <span>Auto analyze</span>
 </div>
 </div>

 {topLines.length > 0 && (
 <div style={{ marginTop: 10, lineHeight: 1.8 }}>
 <div>1. {topLines[0]}</div>
 <div>2. {topLines[1]}</div>
 <div>3. {topLines[2]}</div>
 </div>
 )}
 </div>
 </PanelCard>
 </div>
 </>
 }
 />
 </div>
 );
}
