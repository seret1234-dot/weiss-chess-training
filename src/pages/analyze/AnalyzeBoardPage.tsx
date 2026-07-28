import React, { useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square } from "chess.js";
import { stockfishService } from "../../lib/chess/stockfishService";
import { supabase } from "../../lib/supabase";
import TrainerShell from "../../components/trainer/TrainerShell";
import ThemedChessboard from "../../theme/ThemedChessboard"
import { useGlobalBoard } from "../../hooks/useGlobalBoard";
import ImageToPositionPanel from "./ImageToPositionPanel";
import "./AnalyzeSubpages.css";
import {
  explainMistake,
  type MistakeExplainInput,
  type MistakeExplanation,
} from "../../services/coach";
import { composeCoachExplanation } from "../../services/coach/aiComposer";
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
 | "Inspired"
 | "Best"
 | "Excellent"
 | "Good"
 | "Inaccuracy"
 | "Mistake"
 | "Miss"
 | "Blunder";

type ReviewCoverageSide = {
 eligible: number;
 evaluated: number;
 unavailable: number;
};

type ReviewCoverage = {
 white: ReviewCoverageSide;
 black: ReviewCoverageSide;
};

function emptyReviewCoverage(): ReviewCoverage {
 return {
 white: { eligible: 0, evaluated: 0, unavailable: 0 },
 black: { eligible: 0, evaluated: 0, unavailable: 0 },
 };
}

type ReviewLineEvidence = {
  bestLineSan: string[];
  playedLineSan: string[];
  bestLineComplete: boolean;
  playedLineComplete: boolean;
};

type ReviewCoachEntry = {
  status: "loading" | "ready" | "fallback";
  explanation: MistakeExplanation;
  source: "ai" | "deterministic";
  reason?: string;
  code?: string;
  cached?: boolean;
  quota?: {
    tier: "free" | "premium";
    limit: number;
    used: number;
    remaining: number;
    resetAt?: string | null;
  };
};


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


type WeeklyTransferTarget = {
 patternKey?: string;
 label: string;
 category?: "mates" | "tactics" | string;
 sourceTrainerKey?: string;
 sourceRoute?: string;
 trainedAt?: string;
};

type WeeklyTransferOpportunityStatus =
 | "offered"
 | "recognized"
 | "missed";

type WeeklyTransferOpportunity = {
 id?: string;
 targetKey?: string;
 targetLabel?: string;
 category?: "mates" | "tactics" | string;
 computerMove?: string;
 expectedStudentMove?: string;
 createdAtPly: number;
 createdAt?: string;
 status: WeeklyTransferOpportunityStatus;
 resolvedAtPly?: number;
 resolvedAt?: string;
 playedMove?: string;
};

type WeeklyReviewContext = {
 weekKey?: string;
 gameIndex?: number;
 gameNumber?: number;
 transferTarget?: WeeklyTransferTarget | null;
 transferOpportunities?: WeeklyTransferOpportunity[];
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
const ANALYZE_REVIEW_SIDE_PANEL_WIDTH = 1120;
const ANALYZE_PAGE_PADDING = 24;
const ANALYZE_BOARD_VERTICAL_CHROME = 90;
const ANALYZE_MAX_BOARD_SIZE = 600;
const ANALYZE_LAYOUT_SHIFT_LEFT = 120;
const ANALYZE_REVIEW_LAYOUT_SHIFT_LEFT = 280;

export default function AnalyzePage() {
 const containerRef = useRef<HTMLDivElement | null>(null);
 const pgnFileInputRef = useRef<HTMLInputElement | null>(null);
 const reviewRunIdRef = useRef(0);
 const reviewAutoStartedRef = useRef(false);
 const reviewCoachRequestedRef = useRef<Set<number>>(new Set());
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
 const [reviewUnavailableMap, setReviewUnavailableMap] = useState<
 Record<number, string>
 >({});
 const [reviewLineMap, setReviewLineMap] = useState<
 Record<number, ReviewLineEvidence>
 >({});
 const [reviewCoachMap, setReviewCoachMap] = useState<
 Record<number, ReviewCoachEntry>
 >({});
 const [reviewSummary, setReviewSummary] = useState("");

 const [accuracyWhite, setAccuracyWhite] = useState<number | null>(null);

 const [accuracyBlack, setAccuracyBlack] = useState<number | null>(null);
 const [reviewCoverage, setReviewCoverage] = useState<ReviewCoverage>(
 emptyReviewCoverage,
 );

 const [reviewCounts, setReviewCounts] = useState<Record<ReviewClass, number>>(
 {
 Book: 0,
 Inspired: 0,
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
 const weeklyReviewGame = useMemo(() => {
 const value = new URLSearchParams(window.location.search).get("weeklyGame");
 return value === "1" || value === "2" ? Number(value) : null;
 }, []);
 const weeklyReviewContext = useMemo<WeeklyReviewContext | null>(() => {
 if (weeklyReviewGame === null) return null;

 try {
 const raw = window.sessionStorage.getItem("weissWeeklyReviewContext");
 if (!raw) return null;

 const parsed = JSON.parse(raw) as WeeklyReviewContext;
 const contextGameNumber = Number(
 parsed.gameNumber ??
 (typeof parsed.gameIndex === "number" ? parsed.gameIndex + 1 : 0),
 );

 if (contextGameNumber && contextGameNumber !== weeklyReviewGame) {
 return null;
 }

 const transferTarget =
 parsed.transferTarget && typeof parsed.transferTarget.label === "string"
 ? parsed.transferTarget
 : null;
 const transferOpportunities = Array.isArray(parsed.transferOpportunities)
 ? parsed.transferOpportunities.filter(
 (item): item is WeeklyTransferOpportunity =>
 Boolean(item) &&
 Number.isFinite(Number(item.createdAtPly)) &&
 (item.status === "offered" ||
 item.status === "recognized" ||
 item.status === "missed"),
 )
 : [];

 return {
 ...parsed,
 gameNumber: contextGameNumber || weeklyReviewGame,
 transferTarget,
 transferOpportunities,
 };
 } catch {
 return null;
 }
 }, [weeklyReviewGame]);
 const weeklyTransferTarget = weeklyReviewContext?.transferTarget ?? null;
 const weeklyTransferOpportunities =
 weeklyReviewContext?.transferOpportunities ?? [];
 const weeklyTransferCreatedCount = weeklyTransferOpportunities.length;
 const weeklyTransferRecognizedCount = weeklyTransferOpportunities.filter(
 (item) => item.status === "recognized",
 ).length;
 const weeklyTransferMissedCount = weeklyTransferOpportunities.filter(
 (item) => item.status === "missed",
 ).length;
 const weeklyTransferPendingCount = weeklyTransferOpportunities.filter(
 (item) => item.status === "offered",
 ).length;
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

 if (width <= 768) {
 setBoardSize(Math.min(760, Math.max(0, width - 16)));
 return;
 }

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
 if (window.innerWidth <= 768) return;

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
 setReviewUnavailableMap({});
 setReviewLineMap({});
 setReviewCoachMap({});
 reviewCoachRequestedRef.current.clear();
 setReviewSummary("");
 setReviewProgress({ done: 0, total: 0 });
 setReviewCoverage(emptyReviewCoverage());
 setWhitePlayer("White");
 setBlackPlayer("Black");
 setGameInfo(EMPTY_GAME_INFO);
 setMessage(
 "FEN loaded. This is one position; use Analyze Now for this position, or upload a PGN for full game analysis.",
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

 if (reviewFromSession) {
 setMessage("PGN loaded from Game Analysis. Click Analyze Game.");
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
 if (nag === "$3") return "Inspired";
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
 setReviewUnavailableMap({});
 setReviewLineMap({});
 setReviewCoachMap({});
 reviewCoachRequestedRef.current.clear();
 setReviewCounts({
 Book: 0,
 Inspired: 0,
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
 setReviewCoverage(emptyReviewCoverage());
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
 // Weekly review: always open from the student's side.
 const reviewOrientation =
 weeklyReviewGame !== null
 ? nextWhitePlayer.toLowerCase().includes("student")
 ? "white"
 : nextBlackPlayer.toLowerCase().includes("student")
 ? "black"
 : weeklyReviewGame === 1
 ? "white"
 : "black"
 : "white";
 setBoardOrientation(reviewOrientation);
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

  type ReviewEngineEval = {
    scoreCp?: number;
    mate?: number;
  };

  const REVIEW_MATE_SCORE_CP = 2000;

  function isTerminalReviewPosition(fen: string) {
    try {
      const position = new Chess(fen);
      return position.isCheckmate() || position.isDraw();
    } catch {
      return false;
    }
  }

  function hasUsableReviewScore(info: ReviewEngineEval, fen: string) {
    if (typeof info.scoreCp === "number" && Number.isFinite(info.scoreCp)) {
      return true;
    }

    if (
      typeof info.mate === "number" &&
      Number.isFinite(info.mate) &&
      info.mate !== 0
    ) {
      return true;
    }

    // A terminal board has a deterministic score even if Stockfish stopped
    // without emitting an info line. Non-terminal scoreless responses do not.
    return isTerminalReviewPosition(fen);
  }

  function rawEngineScoreCp(info: ReviewEngineEval, fen: string) {
    if (typeof info.mate === "number") {
      if (info.mate > 0) {
        return REVIEW_MATE_SCORE_CP - Math.min(99, Math.abs(info.mate)) * 5;
      }

      if (info.mate < 0) {
        return -REVIEW_MATE_SCORE_CP + Math.min(99, Math.abs(info.mate)) * 5;
      }

      try {
        const terminal = new Chess(fen);
        if (terminal.isCheckmate()) return -REVIEW_MATE_SCORE_CP;
        if (terminal.isDraw()) return 0;
      } catch {
        return 0;
      }
    }

    if (typeof info.scoreCp === "number") return info.scoreCp;

    try {
      const terminal = new Chess(fen);
      if (terminal.isCheckmate()) return -REVIEW_MATE_SCORE_CP;
      if (terminal.isDraw()) return 0;
    } catch {
      return 0;
    }

    return 0;
  }

  function scoreCpFromWhitePerspective(
    info: ReviewEngineEval,
    fen: string,
  ) {
    const raw = rawEngineScoreCp(info, fen);
    const sideToMove = fen.trim().split(/\s+/)[1];

    // UCI scores are relative to the side to move.
    return sideToMove === "b" ? -raw : raw;
  }

  function scoreCpForReviewSide(
    info: ReviewEngineEval,
    fen: string,
    side: "w" | "b",
  ) {
    const whiteScore = scoreCpFromWhitePerspective(info, fen);

    // White wants a higher White score; Black wants a lower White score.
    return side === "w" ? whiteScore : -whiteScore;
  }

  function reviewWinProbability(scoreCp: number) {
    const bounded = Math.max(-2000, Math.min(2000, scoreCp));
    return 1 / (1 + Math.exp(-bounded / 250));
  }

  const REVIEW_ENGINE_TIMEOUT_MS = 9000;

  function unavailableReviewReason(error: unknown) {
    if (error instanceof Error) {
      if (/timed out/i.test(error.message)) return "Engine timed out";
      if (/usable score/i.test(error.message)) {
        return "Engine returned no usable score";
      }
    }

    return "Engine evaluation unavailable";
  }

  function reviewCoverageForColor(
    coverage: ReviewCoverage,
    color: "w" | "b",
  ) {
    return color === "w" ? coverage.white : coverage.black;
  }

  function hasIncompleteReviewCoverage(side: "w" | "b") {
    const coverage = side === "w" ? reviewCoverage.white : reviewCoverage.black;
    return (
      coverage.eligible > 0 &&
      coverage.evaluated / coverage.eligible < 0.8
    );
  }

  function reviewCoverageText(side: "w" | "b") {
    const coverage = side === "w" ? reviewCoverage.white : reviewCoverage.black;
    const name = side === "w" ? "White" : "Black";
    const incomplete = hasIncompleteReviewCoverage(side);

    if (coverage.eligible === 0) {
      return `${name}: no engine-evaluable moves`;
    }

    return `${coverage.evaluated} of ${coverage.eligible} ${name} moves evaluated; ${coverage.unavailable} unavailable${
      incomplete ? " — Analysis incomplete" : ""
    }`;
  }

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

  // Full review owns the single Stockfish request channel.
  // Stop any position analysis first so responses cannot be mixed.
  setAutoAnalyze(false);
  stockfishService.stop();
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 80);
  });

  const runId = reviewRunIdRef.current + 1;
 reviewRunIdRef.current = runId;
 setReviewInProgress(true);
 setReviewProgress({ done: 0, total: moveRows.length });

 const nextReviewMap: Record<number, ReviewClass> = {};
 const nextReviewLossMap: Record<number, number> = {};
 const nextReviewBestMap: Record<number, string> = {};
 const nextReviewUnavailableMap: Record<number, string> = {};
 const nextReviewLineMap: Record<number, ReviewLineEvidence> = {};
 const nextReviewCoverage = emptyReviewCoverage();
 const counts: Record<ReviewClass, number> = {
 Book: 0,
 Inspired: 0,
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
 setReviewMap({});
 setReviewLossMap({});
 setReviewBestMap({});
 setReviewUnavailableMap({});
 setReviewLineMap({});
 setReviewCoachMap({});
 reviewCoachRequestedRef.current.clear();
 setReviewCounts(counts);
 setAccuracyWhite(null);
 setAccuracyBlack(null);
 setReviewCoverage(emptyReviewCoverage());
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

 setReviewMap({ ...nextReviewMap });
 setReviewLossMap({ ...nextReviewLossMap });
 setReviewBestMap({ ...nextReviewBestMap });
 setReviewUnavailableMap({ ...nextReviewUnavailableMap });
 setReviewLineMap({ ...nextReviewLineMap });
 setReviewCoverage({ ...nextReviewCoverage });
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
 setReviewUnavailableMap({ ...nextReviewUnavailableMap });
 setReviewLineMap({ ...nextReviewLineMap });
 setReviewCoverage({ ...nextReviewCoverage });
 setReviewCounts({ ...counts });
 setReviewProgress({ done: row.ply, total: moveRows.length });
 setReviewSummary(
 `Review running... ${row.ply}/${moveRows.length} - ${sideName}`,
 );
 continue;
 }

 const coverage = reviewCoverageForColor(nextReviewCoverage, row.color);
 coverage.eligible++;

 try {
 const beforeEval = await withTimeout(
 stockfishService.getEvaluation(beforeFen),
 REVIEW_ENGINE_TIMEOUT_MS,
 "Before evaluation",
 );
 const bestUci = beforeEval.bestMove || "";
 const bestLineUci =
 (beforeEval.pv && beforeEval.pv.length > 0
 ? beforeEval.pv
 : bestUci
 ? [bestUci]
 : []
 ).slice(0, 8);
 const verifiedBestLine = validateUciLine(
 beforeFen,
 bestLineUci,
 8,
 );

 let evalLossCp = 0;

 const afterPlayed = await withTimeout(
 stockfishService.getEvaluation(row.fen),
 REVIEW_ENGINE_TIMEOUT_MS,
 "After evaluation",
 );
 if (
 !bestUci ||
 !hasUsableReviewScore(beforeEval, beforeFen) ||
 !hasUsableReviewScore(afterPlayed, row.fen)
 ) {
 throw new Error("Engine returned no usable score");
 }
 const playedReplyUci =
 afterPlayed.pv && afterPlayed.pv.length > 0
 ? afterPlayed.pv
 : afterPlayed.bestMove
 ? [afterPlayed.bestMove]
 : [];
 const playedLineUci = [
 ...(row.uci ? [row.uci] : []),
 ...playedReplyUci,
 ].slice(0, 8);
 const verifiedPlayedLine = validateUciLine(
 beforeFen,
 playedLineUci,
 8,
 );
  // Normalize both positions to the same mover's point of view.
  // This handles White, Black, and mate scores consistently.
  const beforeScore = scoreCpForReviewSide(
    beforeEval,
    beforeFen,
    row.color,
  );
  const playedScore = scoreCpForReviewSide(
    afterPlayed,
    row.fen,
    row.color,
  );

 if (row.uci && bestUci && row.uci !== bestUci) {
 evalLossCp = Math.max(
    0,
    Math.round(
      (reviewWinProbability(beforeScore) -
        reviewWinProbability(playedScore)) *
        1000,
    ),
  );

 const tacticalPunishCp = tacticalPunishCpAfterMove(
 row.fen,
 afterPlayed.bestMove || "",
 row.color,
 );

 evalLossCp = Math.min(
    1000,
    Math.max(evalLossCp, tacticalPunishCp),
  );
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
 nextReviewLineMap[row.ply] = {
 bestLineSan: verifiedBestLine.san,
 playedLineSan: verifiedPlayedLine.san,
 bestLineComplete: verifiedBestLine.complete,
 playedLineComplete: verifiedPlayedLine.complete,
 };
 counts[classification]++;

 if (row.color === "w") {
 whiteLoss += evalLossCp;
 } else {
 blackLoss += evalLossCp;
 }
 coverage.evaluated++;

 setReviewMap({ ...nextReviewMap });
 setReviewLossMap({ ...nextReviewLossMap });
 setReviewBestMap({ ...nextReviewBestMap });
 setReviewUnavailableMap({ ...nextReviewUnavailableMap });
 setReviewLineMap({ ...nextReviewLineMap });
 setReviewCoverage({ ...nextReviewCoverage });
 setReviewCounts({ ...counts });
 setReviewProgress({ done: row.ply, total: moveRows.length });
 setReviewSummary(
 `Review running... ${row.ply}/${moveRows.length} - ${sideName}`,
 );
 } catch (error) {
 nextReviewUnavailableMap[row.ply] = unavailableReviewReason(error);
 coverage.unavailable++;

 setReviewMap({ ...nextReviewMap });
 setReviewLossMap({ ...nextReviewLossMap });
 setReviewBestMap({ ...nextReviewBestMap });
 setReviewUnavailableMap({ ...nextReviewUnavailableMap });
 setReviewLineMap({ ...nextReviewLineMap });
 setReviewCoverage({ ...nextReviewCoverage });
 setReviewCounts({ ...counts });
 setReviewProgress({ done: row.ply, total: moveRows.length });
 setReviewSummary(
 `${nextReviewUnavailableMap[row.ply]} at move ${row.ply}; review continued.`,
 );
 }
 }

 setReviewInProgress(false);

  // Full review has finished, so position analysis may safely resume.
  // This keeps the evaluation bar synchronized when review moves are selected.
  setAutoAnalyze(true);

 setReviewProgress({ done: moveRows.length, total: moveRows.length });
 setReviewMap({ ...nextReviewMap });
 setReviewLossMap({ ...nextReviewLossMap });
 setReviewBestMap({ ...nextReviewBestMap });
 setReviewUnavailableMap({ ...nextReviewUnavailableMap });
 setReviewLineMap({ ...nextReviewLineMap });
 setReviewCoverage({ ...nextReviewCoverage });

 const accuracyFromAcl = (acl: number, evaluatedMoves: number) =>
 evaluatedMoves > 0
 ? Math.max(0, Math.min(100, 100 * Math.exp(-acl / 180)))
 : null;

 setAccuracyWhite(
 accuracyFromAcl(
 whiteLoss / Math.max(1, nextReviewCoverage.white.evaluated),
 nextReviewCoverage.white.evaluated,
 ),
 );
 setAccuracyBlack(
 accuracyFromAcl(
 blackLoss / Math.max(1, nextReviewCoverage.black.evaluated),
 nextReviewCoverage.black.evaluated,
 ),
 );
 setReviewCounts({ ...counts });

 const jumpPriority: ReviewClass[] = [
 'Blunder',
 'Mistake',
 'Miss',
 'Inaccuracy',
 'Good',
 ]

 // In weekly review, jump to the student's first serious error, not the computer's.
 const studentMoveColor: "w" | "b" | null =
 weeklyReviewGame !== null
 ? whitePlayer.toLowerCase().includes("student")
 ? "w"
 : blackPlayer.toLowerCase().includes("student")
 ? "b"
 : weeklyReviewGame === 1
 ? "w"
 : "b"
 : null;

 const firstMissedTransferPly = weeklyTransferOpportunities.find(
 (item) => item.status === "missed",
 )?.createdAtPly;
 const firstInteresting =
 (typeof firstMissedTransferPly === "number"
 ? Math.max(0, Math.min(moveRows.length, firstMissedTransferPly))
 : undefined) ??
 jumpPriority
 .map((label) =>
 moveRows.find(
 (row) =>
 (!studentMoveColor || row.color === studentMoveColor) &&
 nextReviewMap[row.ply] === label,
 )?.ply,
 )
 .find((ply): ply is number => typeof ply === "number") ??
 (studentMoveColor
 ? moveRows.find((row) => row.color === studentMoveColor)?.ply ?? moveRows.length
 : moveRows.length);

 if (studentMoveColor) {
 setBoardOrientation(studentMoveColor === "w" ? "white" : "black");
 }
 goToPly(firstInteresting);
 const whiteCoverageIncomplete =
 nextReviewCoverage.white.eligible > 0 &&
 nextReviewCoverage.white.evaluated /
 nextReviewCoverage.white.eligible <
 0.8;
 const blackCoverageIncomplete =
 nextReviewCoverage.black.eligible > 0 &&
 nextReviewCoverage.black.evaluated /
 nextReviewCoverage.black.eligible <
 0.8;
 const reviewIsIncomplete =
 whiteCoverageIncomplete || blackCoverageIncomplete;
 const coverageSummary = [
 `White: ${nextReviewCoverage.white.evaluated} of ${nextReviewCoverage.white.eligible} moves evaluated (${nextReviewCoverage.white.unavailable} unavailable)`,
 `Black: ${nextReviewCoverage.black.evaluated} of ${nextReviewCoverage.black.eligible} moves evaluated (${nextReviewCoverage.black.unavailable} unavailable)`,
 ].join("; ");
 setReviewSummary(
 reviewIsIncomplete
 ? `Analysis incomplete: ${coverageSummary}.`
 : weeklyTransferTarget
 ? `Review complete: ${moveRows.length} moves analyzed - ${whitePlayer} vs ${blackPlayer}. Transfer target: ${weeklyTransferTarget.label}; ${weeklyTransferCreatedCount} created, ${weeklyTransferRecognizedCount} recognized, ${weeklyTransferMissedCount} missed.`
 : `Review complete: ${moveRows.length} moves analyzed - ${whitePlayer} vs ${blackPlayer}`,
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
 setReviewSummary("Game Analysis starting...");
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
 function isInspiredCandidate(args: {
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
 // A move is not inspired just because the moved piece can be captured.
 // That caused ordinary defensive best moves like ...Qxd7 to be marked inspired.
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

 if (isBestMove && isInspiredCandidate(args)) return "Inspired";
 if (isBestMove) return "Best";
 if (evalLossCp <= 20) return "Excellent";
 if (evalLossCp <= 50) return "Good";
 if (evalLossCp <= 100) return "Inaccuracy";
 if (evalLossCp <= 250) return "Mistake";
 return "Blunder";
 }

 function reviewScore(label: ReviewClass) {
 if (label === "Book") return "Book"
 if (label === "Inspired") return 100;
 if (label === "Best") return "Best"
 if (label === "Excellent") return "Excellent"
 if (label === "Good") return "Good"
 if (label === "Inaccuracy") return 55;
 if (label === "Mistake") return 25;
 if (label === "Miss") return "x"
 if (label === "Blunder") return 0;
 return 0;
 }

 function reviewColor(label?: ReviewClass) {
 if (!label) return "#aaa";
 if (label === "Book") return "#a78bfa";
 if (label === "Inspired") return "#67e8f9";
 if (label === "Best") return "#65a30d";
 if (label === "Excellent") return "#8dd35f";
 if (label === "Good") return "#a3a3a3";
 if (label === "Inaccuracy") return "#fde047";
 if (label === "Mistake") return "#fb923c";
 if (label === "Miss") return "#f97316";
 if (label === "Blunder") return "#ef4444";
 return "#aaa";
 }
function reviewShort(label?: ReviewClass) {
 if (!label) return "";
 if (label === "Book") return "Book";
 if (label === "Inspired") return "â˜…";
 if (label === "Best") return "Best";
 if (label === "Excellent") return "\u2713";
 if (label === "Good") return "Good";
 if (label === "Inaccuracy") return "?";
 if (label === "Mistake") return "?!";
 if (label === "Miss") return "x";
 if (label === "Blunder") return "??";
 return "";
}

 function reviewDisplayName(label?: ReviewClass) {
  if (!label) return "";
  return label;
 }

 function reviewSummaryLabel(label?: ReviewClass) {
  const short = reviewShort(label);
  const name = reviewDisplayName(label);

  return short && short !== name ? `${short} ${name}` : name;
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

 function coachInputForPly(
 ply: number,
 ): MistakeExplainInput | null {
 const row = moveRows[ply - 1];
 const best = reviewBestMap[ply] || "";
 const lines = reviewLineMap[ply];

 if (!row || !best || best === "Book" || best === "Engine timed out") {
 return null;
 }

 const beforeFen =
 ply <= 1 ? startFen : moveRows[ply - 2]?.fen || startFen;
 const bestLooksUci =
 /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(best);
 const phase =
 ply <= 20
 ? "opening"
 : moveRows.length - ply <= 20
 ? "endgame"
 : "middlegame";

 return {
 fenBefore: beforeFen,
 userMoveSan: row.san,
 userMoveUci: row.uci,
 bestMoveUci: bestLooksUci ? best : undefined,
 bestMoveSan: bestLooksUci ? undefined : best,
 evalLossCp: reviewLossMap[ply] ?? 0,
 bestLineSan: lines?.bestLineSan || [],
 playedLineSan: lines?.playedLineSan || [],
 phase,
 source: "analyze",
 userColor: row.color === "w" ? "white" : "black",
 openingName: gameInfo.opening || undefined,
 };
 }

 function formatCoachComment(
 ply: number,
 coach: MistakeExplanation,
 status?: ReviewCoachEntry["status"],
 source?: ReviewCoachEntry["source"],
 ) {
 const row = moveRows[ply - 1];
 const moveText = row?.san ? `Move ${row.san}: ` : "";
 const improving =
 status === "loading"
 ? " Improving explanation from the verified engine line..."
 : "";
 const sourceText =
 source === "ai"
 ? " Verified engine evidence, AI-polished wording."
 : "";

 return (
 moveText +
 coach.title +
 ". " +
 coach.explanation +
 " Why: " +
 coach.whyBestMoveWorks +
 " Lesson: " +
 coach.lesson +
 (coach.recommendedTrainer
 ? " Recommended trainer: " + coach.recommendedTrainer + "."
 : "") +
 improving +
 sourceText
 );
 }

 function reviewCommentForPly(ply: number) {
 const label = reviewMap[ply];
 const row = moveRows[ply - 1];
 const unavailableReason = reviewUnavailableMap[ply];

 if (!row) return "Run review and click a move.";

 if (unavailableReason) {
 return `Move ${row.san}: Not evaluated. ${unavailableReason}.`;
 }

 if (!label) return "Run review and click a move.";

 const best = reviewBestMap[ply] || "--";
 const moveText = row.san ? `Move ${row.san}: ` : "";

 if (label === "Book") {
 return moveText + "Book move from the opening.";
 }

 if (label === "Best") {
 return moveText + "Best move. It matches the engine choice.";
 }

 if (label === "Excellent") {
 return (
 moveText +
 "Excellent move. It stayed very close to the engine choice" +
 (best && best !== "--" ? ` ${best}.` : ".")
 );
 }

 if (label === "Good") {
 return (
 moveText +
 "Good move. The position remained sound" +
 (best && best !== "--" ? `, although ${best} was more precise.` : ".")
 );
 }

 if (label === "Inspired") {
 return moveText + "Inspired tactical move.";
 }

 const input = coachInputForPly(ply);

 if (!input) {
 return (
 moveText +
 reviewDisplayName(label) +
 ". The engine comparison is available, but no fully verified line was stored."
 );
 }

 try {
 const entry = reviewCoachMap[ply];
 const coach = entry?.explanation || explainMistake(input);

 const baseComment = formatCoachComment(
 ply,
 coach,
 entry?.status,
 entry?.source,
 );

 if (entry?.code === "AUTH_REQUIRED") {
 return (
 baseComment +
 " Log in to use AI Coach. The verified rule-based explanation is shown."
 );
 }

 if (entry?.code === "COACH_QUOTA_EXCEEDED") {
 if (entry.quota?.tier === "premium") {
 const resetText = entry.quota.resetAt
 ? new Date(entry.quota.resetAt).toLocaleDateString()
 : "the start of next month";

 return (
 baseComment +
 ` Monthly AI Coach limit reached. It resets ${resetText}.`
 );
 }

 return (
 baseComment +
 " The free AI Coach explanation has already been used. Premium includes 30 each month."
 );
 }

 if (
 entry?.source === "ai" &&
 entry.quota &&
 !entry.cached
 ) {
 return (
 baseComment +
 ` AI Coach: ${entry.quota.remaining} of ${entry.quota.limit} explanations remaining.`
 );
 }

 if (
 entry?.source === "deterministic" &&
 entry.code &&
 entry.code !== "COACH_AI_FALLBACK"
 ) {
 return (
 baseComment +
 " AI wording was unavailable; the verified explanation is shown."
 );
 }

 return baseComment;
 } catch {
 return (
 moveText +
 reviewDisplayName(label) +
 `. ${best !== "--" ? `The stronger move was ${best}.` : ""}`
 );
 }
 }

 useEffect(() => {
 if (reviewInProgress) return;

 const label = reviewMap[currentPly];
 if (
 label !== "Inaccuracy" &&
 label !== "Mistake" &&
 label !== "Miss" &&
 label !== "Blunder"
 ) {
 return;
 }

 if (reviewCoachRequestedRef.current.has(currentPly)) return;

 const input = coachInputForPly(currentPly);
 if (!input) return;

 let fallback: MistakeExplanation;

 try {
 fallback = explainMistake(input);
 } catch {
 return;
 }

 reviewCoachRequestedRef.current.add(currentPly);
 setReviewCoachMap((current) => ({
 ...current,
 [currentPly]: {
 status: "loading",
 explanation: fallback,
 source: "deterministic",
 },
 }));

 void composeCoachExplanation(input, fallback).then((result) => {
 setReviewCoachMap((current) => ({
 ...current,
 [currentPly]: {
 status: result.source === "ai" ? "ready" : "fallback",
 explanation: result.explanation,
 source: result.source,
 reason: result.reason,
 code: result.code,
 quota: result.quota,
 cached: result.cached,
 },
 }));
 });
 }, [
 currentPly,
 reviewInProgress,
 reviewMap,
 reviewLossMap,
 reviewBestMap,
 reviewUnavailableMap,
 reviewLineMap,
 moveRows,
 startFen,
 gameInfo.opening,
 ]);

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

 function downloadPgn() {
 if (moveRows.length === 0) {
 setMessage('No PGN loaded.')
 return
 }

 const result = gameInfo.result || '*'
 const date = gameInfo.date || new Date().toISOString().slice(0, 10).replace(/-/g, '.')

 const headers = [
 pgnHeader('Event', gameInfo.event || 'Analyzed Game'),
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
 link.download = 'analyzed-game-' + stamp + '.pgn'
 document.body.appendChild(link)
 link.click()
 link.remove()
 URL.revokeObjectURL(url)

 setMessage('PGN downloaded.')
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
 if (!engineReady || reviewInProgress) return;

 async function analyzePosition() {
 try {
 const info = await stockfishService.getEvaluation(game.fen());

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
 }, [game.fen(), engineReady, reviewInProgress]);

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

 function validateUciLine(
 fen: string,
 supplied: string[],
 maxPly = 8,
 ): {
 san: string[];
 complete: boolean;
 } {
 const game = new Chess(fen);
 const san: string[] = [];
 let complete = true;

 for (const uci of supplied.slice(0, maxPly)) {
 if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) {
 complete = false;
 break;
 }

 try {
 const move = game.move({
 from: uci.slice(0, 2),
 to: uci.slice(2, 4),
 promotion: uci.length > 4 ? uci.slice(4, 5) : undefined,
 });

 if (!move) {
 complete = false;
 break;
 }

 san.push(move.san);
 } catch {
 complete = false;
 break;
 }
 }

 return { san, complete };
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

 const isCurrentCheckmate = game.isCheckmate();
 const checkmateWinner: "w" | "b" | null = isCurrentCheckmate
 ? game.turn() === "w"
 ? "b"
 : "w"
 : null;
 const checkmateResult =
 checkmateWinner === "w" ? "1-0" : checkmateWinner === "b" ? "0-1" : null;
 const checkmateWinnerName =
 checkmateWinner === "w"
 ? whitePlayer || "White"
 : checkmateWinner === "b"
 ? blackPlayer || "Black"
 : "";

 const displayEvalMate =
 evalMate === null ? null : game.turn() === "w" ? evalMate : -evalMate;

 const displayEvalCp =
 evalCp === null ? null : game.turn() === "w" ? evalCp : -evalCp;
 const evalDisplay =
 checkmateResult ||
 (displayEvalMate !== null
 ? displayEvalMate > 0
 ? `M${displayEvalMate}`
 : `-M${Math.abs(displayEvalMate)}`
 : formatEval(displayEvalCp));
 const bestMoveSan =
 bestMove && bestMove.length >= 4
 ? uciToSan(game.fen(), bestMove)
 : bestMove || "--";
 const whiteEvalPercent =
 checkmateWinner === "w"
 ? 100
 : checkmateWinner === "b"
 ? 0
 : displayEvalMate !== null
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
 "Inspired",
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
 Inspired: 0,
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
 className="analyze-eval-bar"
 style={{
 width: 26,
 height: boardSize,
 borderRadius: 8,
 overflow: "hidden",
 background: "#111",
 position: "relative",
 flex: "0 0 auto",
 "--analyze-white-eval": `${whiteEvalPercent}%`,
 } as React.CSSProperties}
 >
 <div
 className="analyze-eval-fill"
 style={{
 position: "absolute",
 bottom: 0,
 width: "100%",
 height: `${whiteEvalPercent}%`,
 background: "#f3f3f3",
 }}
 />
 <div
 className="analyze-eval-label"
 style={{
 position: "absolute",
 top: isCurrentCheckmate ? "50%" : "auto",
 bottom: isCurrentCheckmate ? "auto" : 8,
 left: 0,
 right: 0,
 transform: isCurrentCheckmate ? "translateY(-50%)" : "none",
 textAlign: "center",
 color: isCurrentCheckmate
 ? checkmateWinner === "b"
 ? "#f3f3f3"
 : "#222"
 : whiteEvalPercent <= 12
 ? "#f3f3f3"
 : "#222",
 textShadow:
 !isCurrentCheckmate && whiteEvalPercent <= 12
 ? "0 1px 2px rgba(0,0,0,0.9)"
 : "0 1px 1px rgba(255,255,255,0.28)",
 fontSize: isCurrentCheckmate ? 10 : 11,
 fontWeight: 900,
 }}
 >
 {evalDisplay}
 </div>
 </div>
 );

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
 const analysisIncomplete = hasIncompleteReviewCoverage(side);

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
 {analysisIncomplete
 ? " - Analysis incomplete"
 : accuracy !== null
 ? ` - ${accuracy.toFixed(1)}%`
 : ""}
 </div>
 </div>
 );
 }

 function weeklyTransferStatusLabel(
 status: WeeklyTransferOpportunityStatus,
 ) {
 if (status === "recognized") return "RECOGNIZED";
 if (status === "missed") return "MISSED";
 return "TARGET CREATED";
 }

 function weeklyTransferStatusColor(
 status: WeeklyTransferOpportunityStatus,
 ) {
 if (status === "recognized") return "#65a30d";
 if (status === "missed") return "#dc2626";
 return "#2563eb";
 }

 function reviewMoveNumberLabel(ply: number) {
 const safePly = Math.max(1, Math.round(ply));
 const moveNumber = Math.ceil(safePly / 2);
 return safePly % 2 === 1 ? `${moveNumber}.` : `${moveNumber}...`;
 }

 function transferCreatedMoveLabel(opportunity: WeeklyTransferOpportunity) {
 const ply = Math.max(1, Math.round(Number(opportunity.createdAtPly) || 1));
 const row = moveRows[ply - 1];
 return row
 ? `${reviewMoveNumberLabel(ply)} ${row.san}`
 : `after ply ${ply}`;
 }

 function transferSanFromUci(
 uci: string | undefined,
 positionPly: number,
 ) {
 if (!uci || uci.length < 4) return "-";

 const fen =
 positionPly <= 0
 ? startFen
 : moveRows[Math.min(moveRows.length, positionPly) - 1]?.fen;
 if (!fen) return uci;

 try {
 const temp = new Chess(fen);
 const move = temp.move({
 from: uci.slice(0, 2) as Square,
 to: uci.slice(2, 4) as Square,
 ...(uci.length > 4 ? { promotion: uci.slice(4, 5) } : {}),
 });
 return move?.san || uci;
 } catch {
 return uci;
 }
 }

 function transferExpectedMoveLabel(
 opportunity: WeeklyTransferOpportunity,
 ) {
 return transferSanFromUci(
 opportunity.expectedStudentMove,
 Math.max(0, Number(opportunity.createdAtPly) || 0),
 );
 }

 function transferPlayedMoveLabel(opportunity: WeeklyTransferOpportunity) {
 const resolvedPly = Number(opportunity.resolvedAtPly);
 if (Number.isFinite(resolvedPly) && resolvedPly > 0) {
 const row = moveRows[Math.round(resolvedPly) - 1];
 if (row?.san) return row.san;
 }

 return opportunity.playedMove || "-";
 }

 function reviewBadgeText(label?: ReviewClass) {
 if (!label) return ""
 if (label === "Book") return "Book"
 if (label === "Inspired") return "â˜…";if (label === "Best") return "Best"
 if (label === "Excellent") return "\u2713"
 if (label === "Good") return "Good"
 if (label === "Inaccuracy") return "?"
 if (label === "Mistake") return "?!"
 if (label === "Miss") return "x"
 if (label === "Blunder") return "??"
 return ""
 }

 function reviewBadgeBackground(label?: ReviewClass) {
 if (label === "Book") return "#8b5cf6"
 if (label === "Inspired") return "#22d3ee"
 if (label === "Best") return "#65a30d"
 if (label === "Excellent") return "#8dd35f"
 if (label === "Good") return "#a3a3a3"
 if (label === "Inaccuracy") return "#facc15"
 if (label === "Mistake") return "#fb923c"
 if (label === "Miss") return "#f97316"
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

 const currentTransferResolved = weeklyTransferOpportunities.find(
 (item) => Number(item.resolvedAtPly) === currentPly,
 );
 const currentTransferCreated = weeklyTransferOpportunities.find(
 (item) => Number(item.createdAtPly) === currentPly,
 );
 const currentTransferEvent = currentTransferResolved ?? currentTransferCreated;
 const currentTransferEventStatus: WeeklyTransferOpportunityStatus | null =
 currentTransferResolved?.status ??
 (currentTransferCreated ? "offered" : null);
 const currentTransferEventLabel =
 currentTransferEventStatus === "recognized"
 ? "PATTERN RECOGNIZED"
 : currentTransferEventStatus === "missed"
 ? "PATTERN MISSED"
 : currentTransferEventStatus === "offered"
 ? "TARGET CREATED"
 : "";
 const transferBoardOverlay =
 currentTransferEvent && currentTransferEventStatus ? (
 <div
 data-name="weekly-transfer-board-event"
 style={{
 position: "absolute",
 left: 12,
 top: 12,
 zIndex: 90,
 maxWidth: Math.max(190, Math.min(360, boardSize - 24)),
 padding: "9px 12px",
 borderRadius: 10,
 background: weeklyTransferStatusColor(currentTransferEventStatus),
 color: "#fff",
 border: "1px solid rgba(255,255,255,0.88)",
 boxShadow: "0 8px 20px rgba(0,0,0,0.35)",
 pointerEvents: "none",
 }}
 >
 <div
 style={{
 fontSize: Math.max(12, Math.min(15, boardSize / 42)),
 fontWeight: 950,
 letterSpacing: 0.7,
 }}
 >
 {currentTransferEventLabel}
 </div>
 <div
 style={{
 marginTop: 2,
 fontSize: Math.max(11, Math.min(14, boardSize / 48)),
 fontWeight: 800,
 opacity: 0.95,
 }}
 >
 {currentTransferEvent.targetLabel || weeklyTransferTarget?.label || "Transfer pattern"}
 </div>
 </div>
 ) : null;

 const checkmateBoardOverlay =
 isCurrentCheckmate && checkmateResult ? (
 <div
 data-name="checkmate-board-overlay"
 style={{
 position: "absolute",
 inset: 0,
 zIndex: 100,
 display: "flex",
 alignItems: "center",
 justifyContent: "center",
 pointerEvents: "none",
 background: "rgba(0,0,0,0.12)",
 }}
 >
 <div
 style={{
 minWidth: Math.min(320, boardSize * 0.62),
 maxWidth: boardSize * 0.8,
 padding: "14px 22px",
 borderRadius: 14,
 background: "rgba(22,21,18,0.94)",
 color: "#f3f3f3",
 border: "2px solid rgba(255,255,255,0.86)",
 boxShadow: "0 14px 34px rgba(0,0,0,0.48)",
 textAlign: "center",
 }}
 >
 <div
 style={{
 fontSize: Math.max(22, Math.min(34, boardSize / 18)),
 fontWeight: 950,
 letterSpacing: 1.2,
 }}
 >
 CHECKMATE
 </div>
 <div
 style={{
 marginTop: 5,
 fontSize: Math.max(13, Math.min(17, boardSize / 34)),
 fontWeight: 800,
 color: "#d8d8d8",
 }}
 >
 {checkmateWinnerName} wins {checkmateResult}
 </div>
 </div>
 </div>
 ) : null

 const layoutShiftLeft = isReviewMode
 ? ANALYZE_REVIEW_LAYOUT_SHIFT_LEFT
 : ANALYZE_LAYOUT_SHIFT_LEFT;
 const resolvedSidePanelWidth = isReviewMode
 ? ANALYZE_REVIEW_SIDE_PANEL_WIDTH
 : ANALYZE_SIDE_PANEL_WIDTH;

 const boardWithControls = (
 <div className="analyze-board-with-controls" style={{ display: "flex", gap: 10 }}>
 <div className="analyze-eval-bar-wrap" style={{ paddingTop: 28 }}>{evalBar}</div>

 <div className="analyze-board-stack">
 {boardPlayerBar(topBoardSide)}

 <div style={{ position: "relative", width: boardSize, height: boardSize }}>
<ThemedChessboard
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
 {transferBoardOverlay}
 {checkmateBoardOverlay}
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
 className={`analyze-board-page${isReviewMode ? " analyze-board-page--review" : ""}`}
 onDragOver={handlePageDragOver}
 onDragLeave={handlePageDragLeave}
 onDrop={handlePageDrop}
 style={{
 position: "relative",
 minHeight: "100vh",
 marginLeft: isReviewMode ? 0 : -layoutShiftLeft,
 width: isReviewMode ? "100%" : `calc(100% + ${layoutShiftLeft}px)`,
 boxSizing: "border-box",
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
 Drop PGN to load game analysis
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
 title={isReviewMode ? "Game Analysis" : "Analyze"}
 subtitle={isReviewMode ? "Full game analysis" : "Position analysis"}
 boardSize={boardSize}
 isDragging={isDragging}
 isHandleHovered={isHandleHovered}
 setIsDragging={setIsDragging}
 setIsHandleHovered={setIsHandleHovered}
 containerRef={containerRef}
 footerLeft={isReviewMode ? "Review" : "Analyze"}
 footerRight={`${boardSize}px`}
 board={boardWithControls}
 sidePanelWidth={resolvedSidePanelWidth}
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

 /* In full-game analysis mode, hide setup/analyze panels so the review fits at 100% zoom. */
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
  grid-template-columns:
  minmax(0, 0.95fr)
  minmax(0, 0.70fr)
  minmax(0, 1.35fr);
 grid-template-areas:
 "review details moves"
 "review details moves";
 grid-template-rows: 1fr;
 align-items: stretch;
 min-height: 0;
 }

 .analyze-review-grid.review-mode > * {
 min-width: 0;
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
 min-height: 0;
 max-height: 100%;
 overflow-y: auto;
 overflow-x: hidden;
 scrollbar-gutter: stable;
 padding-right: 5px;
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
 overflow: hidden;
 }

 .analyze-review-grid.review-mode > :nth-child(7) > :first-child {
 flex: 1 1 auto;
 min-height: 0;
 display: flex;
 flex-direction: column;
 overflow: hidden;
 }

 .analyze-review-grid.review-mode > :nth-child(7) > :last-child {
 flex: 0 0 auto;
 }

 .analyze-review-grid.review-mode .analyze-moves-list {
 flex: 1 1 auto;
 min-height: 0 !important;
 height: auto !important;
 max-height: none !important;
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
 <SectionTitle>Game Analysis</SectionTitle>

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
 {reviewInProgress ? "Review Running..." : "Analyze Game"}
 </button>
 </div>

 {isReviewMode && (
 <div
 style={{
 display: "grid",
 marginBottom: 8,
 }}
 >
 <SecondaryButton
 onClick={downloadPgn}
 disabled={moveRows.length === 0}
 >
 Download PGN
 </SecondaryButton>
 </div>
 )}

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


 {isReviewMode &&
 weeklyReviewGame !== null &&
 weeklyTransferTarget && (
 <div
 data-name="weekly-transfer-review-card"
 style={{
 marginBottom: 12,
 padding: 12,
 borderRadius: 12,
 background: "#211e1b",
 border: "1px solid rgba(96,165,250,0.48)",
 boxShadow: "0 8px 20px rgba(0,0,0,0.18)",
 }}
 >
 <div
 style={{
 display: "flex",
 alignItems: "flex-start",
 justifyContent: "space-between",
 gap: 10,
 flexWrap: "wrap",
 }}
 >
 <div style={{ minWidth: 0 }}>
 <div
 style={{
 color: "#93c5fd",
 fontSize: 11,
 fontWeight: 950,
 letterSpacing: 0.9,
 }}
 >
 TRANSFER TEST
 </div>
 <div
 style={{
 marginTop: 3,
 color: "#f3f3f3",
 fontSize: 15,
 fontWeight: 950,
 lineHeight: 1.25,
 }}
 >
 {weeklyTransferTarget.label}
 </div>
 </div>

 <div
 style={{
 display: "flex",
 gap: 6,
 flexWrap: "wrap",
 justifyContent: "flex-end",
 }}
 >
 <span
 style={{
 padding: "4px 7px",
 borderRadius: 999,
 background: "rgba(37,99,235,0.20)",
 color: "#bfdbfe",
 fontSize: 11,
 fontWeight: 900,
 }}
 >
 Created {weeklyTransferCreatedCount}
 </span>
 <span
 style={{
 padding: "4px 7px",
 borderRadius: 999,
 background: "rgba(101,163,13,0.20)",
 color: "#d9f99d",
 fontSize: 11,
 fontWeight: 900,
 }}
 >
 Recognized {weeklyTransferRecognizedCount}
 </span>
 <span
 style={{
 padding: "4px 7px",
 borderRadius: 999,
 background: "rgba(220,38,38,0.20)",
 color: "#fecaca",
 fontSize: 11,
 fontWeight: 900,
 }}
 >
 Missed {weeklyTransferMissedCount}
 </span>
 {weeklyTransferPendingCount > 0 && (
 <span
 style={{
 padding: "4px 7px",
 borderRadius: 999,
 background: "rgba(255,255,255,0.08)",
 color: "#d4d4d4",
 fontSize: 11,
 fontWeight: 900,
 }}
 >
 Unresolved {weeklyTransferPendingCount}
 </span>
 )}
 </div>
 </div>

 {weeklyTransferOpportunities.length === 0 ? (
 <div
 style={{
 marginTop: 10,
 color: "#b8b8b8",
 fontSize: 12,
 lineHeight: 1.45,
 }}
 >
 No genuine {weeklyTransferTarget.label} opportunity was created in this
 game. This is not counted as a miss.
 </div>
 ) : (
 <div
 style={{
 display: "grid",
 gap: 7,
 marginTop: 10,
 }}
 >
 {weeklyTransferOpportunities.map((opportunity, index) => (
 <button
 key={opportunity.id || `${opportunity.createdAtPly}-${index}`}
 type="button"
 onClick={() =>
 goToPly(
 Math.max(
 0,
 Math.min(
 moveRows.length,
 Math.round(Number(opportunity.createdAtPly) || 0),
 ),
 ),
 )
 }
 style={{
 width: "100%",
 textAlign: "left",
 border: "1px solid rgba(255,255,255,0.09)",
 borderLeft: `4px solid ${weeklyTransferStatusColor(opportunity.status)}`,
 borderRadius: 9,
 background: "rgba(255,255,255,0.035)",
 color: "#f3f3f3",
 padding: "8px 9px",
 cursor: "pointer",
 }}
 >
 <div
 style={{
 display: "flex",
 alignItems: "center",
 justifyContent: "space-between",
 gap: 8,
 }}
 >
 <span style={{ fontSize: 12, fontWeight: 900 }}>
 Opportunity {index + 1} after {transferCreatedMoveLabel(opportunity)}
 </span>
 <span
 style={{
 flex: "0 0 auto",
 padding: "3px 6px",
 borderRadius: 999,
 background: weeklyTransferStatusColor(opportunity.status),
 color: "#fff",
 fontSize: 10,
 fontWeight: 950,
 letterSpacing: 0.4,
 }}
 >
 {weeklyTransferStatusLabel(opportunity.status)}
 </span>
 </div>
 <div
 style={{
 marginTop: 5,
 color: "#cfcfcf",
 fontSize: 11,
 lineHeight: 1.4,
 }}
 >
 Expected: <strong>{transferExpectedMoveLabel(opportunity)}</strong>
 {opportunity.status !== "offered" && (
 <>
 {" "}- Student played:{" "}
 <strong>{transferPlayedMoveLabel(opportunity)}</strong>
 </>
 )}
 </div>
 <div
 style={{
 marginTop: 4,
 color: "#93c5fd",
 fontSize: 10,
 fontWeight: 850,
 }}
 >
 Show the decision position
 </div>
 </button>
 ))}
 </div>
 )}
 </div>
 )}

 {isReviewMode &&
 weeklyReviewGame !== null &&
 !reviewInProgress &&
 reviewProgress.total > 0 &&
 reviewProgress.done >= reviewProgress.total && (
 <div style={{ marginBottom: 10 }}>
 <PrimaryButton
 onClick={() => {
 window.location.href =
 weeklyReviewGame === 1
 ? "/play-computer?weekly=1&continue=2"
 : "/auto";
 }}
 >
 {weeklyReviewGame === 1
 ? "Continue to Weekly Game 2"
 : "Return to Personal Course"}
 </PrimaryButton>
 </div>
 )}

 <div
 style={{
 marginTop: 8,
 background: "#211e1b",
 borderRadius: 10,
 padding: 8,
 border: "1px solid rgba(255,255,255,0.08)",
 width: "100%",
 maxWidth: "none",
 boxSizing: "border-box",
 overflow: "hidden",
 }}
 >
 <div
 style={{
 display: "grid",
 gridTemplateColumns: "minmax(0, 1fr) minmax(40px, 64px) minmax(40px, 64px)",
 gap: "6px 6px",
 alignItems: "center",
 fontSize: 12,
 }}
 >
 <div style={{ minWidth: 0, color: "#aaa", fontWeight: 800, overflowWrap: "anywhere" }}>
 Classification
 </div>
 <div
  style={{
  minWidth: 0,
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
 margin: "2px auto 0",
 }}
 >
 {whitePlayer}
 </div>
 </div>
 <div
  style={{
  minWidth: 0,
  color: "#f3f3f3",
 fontWeight: 900,
 textAlign: "center",
 }}
 >
 Black
 <div
  style={{
  minWidth: 0,
  color: "#aaa",
 fontSize: 8,
 fontWeight: 600,
 maxWidth: 54,
 overflow: "hidden",
 textOverflow: "ellipsis",
 whiteSpace: "nowrap",
 margin: "2px auto 0",
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
  minWidth: 0,
  textAlign: "center",
 borderTop: "1px solid rgba(255,255,255,0.08)",
 paddingTop: 8,
 fontWeight: 900,
 }}
 >
 {hasIncompleteReviewCoverage("w")
 ? "Analysis incomplete"
 : accuracyWhite !== null
 ? accuracyWhite.toFixed(1) + "%"
 : "--"}
 </div>
 <div
  style={{
  minWidth: 0,
  textAlign: "center",
 borderTop: "1px solid rgba(255,255,255,0.08)",
 paddingTop: 8,
 fontWeight: 900,
 }}
 >
 {hasIncompleteReviewCoverage("b")
 ? "Analysis incomplete"
 : accuracyBlack !== null
 ? accuracyBlack.toFixed(1) + "%"
 : "--"}
 </div>

 {REVIEW_TABLE_CLASSES.map((label) => (
 <React.Fragment key={label}>
 <div
  style={{ minWidth: 0, color: reviewColor(label), fontWeight: 800, overflowWrap: "anywhere" }}
 >
 {reviewSummaryLabel(label)}
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
  minWidth: 0,
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
  minWidth: 0,
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
 <br />
 {reviewCoverageText("w")}
 <br />
 {reviewCoverageText("b")}
 </div>
 </div>
 </PanelCard>

 <PanelCard>
 <SectionTitle>Review Details</SectionTitle>

 {currentPly > 0 &&
 (reviewMap[currentPly] || reviewUnavailableMap[currentPly]) ? (
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

 {reviewUnavailableMap[currentPly] ? (
 <>
 <div style={{ color: "#facc15", fontWeight: 800 }}>
 Not evaluated
 </div>
 <div>Reason: {reviewUnavailableMap[currentPly]}</div>
 <div>Engine comparison unavailable for this move.</div>
 </>
 ) : (
 <>
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
 </>
 )}
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
 onClick={downloadPgn}
 disabled={moveRows.length === 0}
 >
 Download PGN
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
 className="analyze-moves-list"
 style={{
 height: isReviewMode ? "auto" : "calc(100vh - 300px)",
 maxHeight: isReviewMode ? "none" : "calc(100vh - 300px)",
 minHeight: isReviewMode ? 0 : 420,
 flex: isReviewMode ? "1 1 auto" : undefined,
 overflowY: "auto",
 display: "grid",
 gridTemplateColumns: "26px minmax(0, 1fr) minmax(0, 1fr)",
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
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  gap: 4,
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
  <span
  style={{
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  }}
  >
  {white?.san || ""}
  </span>
  <span
  style={{
  flex: "0 0 auto",
 color: reviewUnavailableMap[white?.ply] ? "#facc15" : reviewColor(reviewMap[white?.ply]),
  fontWeight: 700,
  fontSize: 11,
  }}
  title={reviewUnavailableMap[white?.ply] || reviewDisplayName(reviewMap[white?.ply])}
  >
 {reviewUnavailableMap[white?.ply] ? "—" : reviewShort(reviewMap[white?.ply])}
 </span>
 </button>

  <button
  onClick={() => black && goToPly(black.ply)}
  style={{
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  gap: 4,
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
  <span
  style={{
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  }}
  >
  {black?.san || ""}
  </span>
  <span
  style={{
  flex: "0 0 auto",
 color: reviewUnavailableMap[black?.ply] ? "#facc15" : reviewColor(reviewMap[black?.ply]),
  fontWeight: 700,
  fontSize: 11,
  }}
  title={reviewUnavailableMap[black?.ply] || reviewDisplayName(reviewMap[black?.ply])}
  >
 {reviewUnavailableMap[black?.ply] ? "—" : reviewShort(reviewMap[black?.ply])}
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
