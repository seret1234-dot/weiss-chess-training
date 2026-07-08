#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const chessJs = require("chess.js");
const Chess = chessJs.Chess || chessJs;

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "public", "data", "pattern-mates", "smothered", "mate-in-2");

const SOURCE_CANDIDATES = [
 path.join(ROOT, "theme_exports", "mates", "mateIn2.csv"),
 path.join(ROOT, "lichess_db_puzzle.csv"),
];

const MAX_PUZZLES = 1500;
const CHUNK_SIZE = 30;
const MATE_DISTANCE = 2;
const SOLUTION_MOVE_COUNT = 3;

const DEFAULT_HEADERS = [
 "PuzzleId",
 "FEN",
 "Moves",
 "Rating",
 "RatingDeviation",
 "Popularity",
 "NbPlays",
 "Themes",
 "GameUrl",
 "OpeningTags",
];

function parseCsvLine(line) {
 const cells = [];
 let current = "";
 let inQuotes = false;

 for (let i = 0; i < line.length; i++) {
 const ch = line[i];

 if (ch === '"') {
 if (inQuotes && line[i + 1] === '"') {
 current += '"';
 i++;
 } else {
 inQuotes = !inQuotes;
 }
 continue;
 }

 if (ch === "," && !inQuotes) {
 cells.push(current);
 current = "";
 continue;
 }

 current += ch;
 }

 cells.push(current);
 return cells;
}

function makeRow(headers, cells) {
 const row = {};
 for (let i = 0; i < headers.length; i++) {
 row[headers[i]] = cells[i] ?? "";
 }
 return row;
}

function getCell(row, names) {
 for (const name of names) {
 if (Object.prototype.hasOwnProperty.call(row, name)) {
 return row[name] ?? "";
 }
 }

 const lowerMap = new Map(
 Object.keys(row).map((key) => [key.toLowerCase(), key])
 );

 for (const name of names) {
 const realKey = lowerMap.get(name.toLowerCase());
 if (realKey) return row[realKey] ?? "";
 }

 return "";
}

function toNumber(value, fallback = 0) {
 const n = Number(value);
 return Number.isFinite(n) ? n : fallback;
}

function makeChess(fen) {
 try {
 return new Chess(fen);
 } catch {
 try {
 const chess = new Chess();
 const loaded = chess.load(fen);
 if (loaded === false) return null;
 return chess;
 } catch {
 return null;
 }
 }
}

function playUci(chess, uci) {
 if (!uci || uci.length < 4) return null;

 const move = {
 from: uci.slice(0, 2),
 to: uci.slice(2, 4),
 };

 if (uci.length >= 5) {
 move.promotion = uci[4].toLowerCase();
 }

 try {
 return chess.move(move);
 } catch {
 return null;
 }
}

function isCheckmate(chess) {
 if (typeof chess.isCheckmate === "function") return chess.isCheckmate();
 if (typeof chess.in_checkmate === "function") return chess.in_checkmate();
 if (typeof chess.inCheckmate === "function") return chess.inCheckmate();
 return false;
}

async function collectPuzzles(csvPath) {
 const puzzles = [];
 const seenFens = new Set();

 const stream = fs.createReadStream(csvPath, { encoding: "utf8" });
 const rl = readline.createInterface({
 input: stream,
 crlfDelay: Infinity,
 });

 let headers = null;

 for await (const rawLine of rl) {
 const line = rawLine.replace(/^\uFEFF/, "");
 if (!line.trim()) continue;

 const cells = parseCsvLine(line);

 if (!headers) {
 const lower = cells.map((cell) => cell.trim().toLowerCase());

 if (lower.includes("fen") && lower.includes("moves") && lower.includes("themes")) {
 headers = cells.map((cell) => cell.replace(/^\uFEFF/, ""));
 continue;
 }

 headers = DEFAULT_HEADERS;
 }

 const row = makeRow(headers, cells);

 const themesText = getCell(row, ["Themes", "themes"]);
 const themeTokens = themesText.split(/\s+/).filter(Boolean);
 const themeSet = new Set(themeTokens);

 if (!themeSet.has("smotheredMate")) continue;
 if (!themeSet.has("mateIn2")) continue;

 const movesText = getCell(row, ["Moves", "moves"]);
 const moveTokens = movesText.trim().split(/\s+/).filter(Boolean);

 // Lichess format: preMove + user move + opponent reply + user mate.
 if (moveTokens.length < 4) continue;

 const preMove = moveTokens[0];
 const solutionLine = moveTokens.slice(1, 4);

 const originalFen = getCell(row, ["FEN", "Fen", "fen"]);
 const startChess = makeChess(originalFen);
 if (!startChess) continue;

 const preMoveResult = playUci(startChess, preMove);
 if (!preMoveResult) continue;

 const trainerFen = startChess.fen();

 if (seenFens.has(trainerFen)) continue;

 const verifyChess = makeChess(trainerFen);
 if (!verifyChess) continue;

 for (const move of solutionLine) {
 const result = playUci(verifyChess, move);
 if (!result) {
 continue;
 }
 }

 if (!isCheckmate(verifyChess)) continue;

 seenFens.add(trainerFen);

 const puzzleId = getCell(row, ["PuzzleId", "PuzzleID", "Id", "ID", "id"]);
 const rating = toNumber(getCell(row, ["Rating", "rating"]), 0);

 puzzles.push({
 id: puzzleId ? `smothered-mate-in-2-${puzzleId}` : `smothered-mate-in-2-${puzzles.length + 1}`,
 puzzleId,
 fen: trainerFen,
 initialFen: originalFen,
 preMove,
 solutionLine,
 userMoveIndexes: [0, 2],
 mateDistance: MATE_DISTANCE,
 solutionMoveCount: SOLUTION_MOVE_COUNT,
 rating,
 label: "Smothered Mate in 2",
 theme: "smotheredMate",
 ratingDeviation: toNumber(getCell(row, ["RatingDeviation", "ratingDeviation"]), 0),
 popularity: toNumber(getCell(row, ["Popularity", "popularity"]), 0),
 nbPlays: toNumber(getCell(row, ["NbPlays", "nbPlays"]), 0),
 themes: themeTokens,
 gameUrl: getCell(row, ["GameUrl", "gameUrl"]),
 openingTags: getCell(row, ["OpeningTags", "openingTags"]),
 });
 }

 puzzles.sort((a, b) => {
 if (a.rating !== b.rating) return a.rating - b.rating;
 return String(a.puzzleId || a.id).localeCompare(String(b.puzzleId || b.id));
 });

 return puzzles.slice(0, MAX_PUZZLES);
}

function writeJson(filePath, data) {
 fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", { encoding: "utf8" });
}

async function main() {
 const csvPath = SOURCE_CANDIDATES.find((candidate) => fs.existsSync(candidate));

 if (!csvPath) {
 throw new Error(
 `Could not find CSV source. Tried:\n${SOURCE_CANDIDATES.map((item) => `- ${item}`).join("\n")}`
 );
 }

 console.log(`Using CSV source: ${path.relative(ROOT, csvPath)}`);

 fs.rmSync(OUT_DIR, { recursive: true, force: true });
 fs.mkdirSync(OUT_DIR, { recursive: true });

 const puzzles = await collectPuzzles(csvPath);

 if (puzzles.length === 0) {
 throw new Error("No smothered mate in 2 puzzles found.");
 }

 const chunkFiles = [];

 for (let i = 0; i < puzzles.length; i += CHUNK_SIZE) {
 const chunkIndex = Math.floor(i / CHUNK_SIZE) + 1;
 const chunk = puzzles.slice(i, i + CHUNK_SIZE).map((puzzle, index) => ({
 ...puzzle,
 chunkNumber: chunkIndex,
 chunkIndex: index,
 }));

 const file = `chunk-${String(chunkIndex).padStart(3, "0")}.json`;

 writeJson(path.join(OUT_DIR, file), chunk);

 chunkFiles.push(file);
 }

 writeJson(path.join(OUT_DIR, "manifest.json"), {
 category: "mates",
 theme: "smothered",
 subtheme: "smotheredMate",
 totalPuzzles: puzzles.length,
 chunkSize: CHUNK_SIZE,
 totalChunks: chunkFiles.length,
 files: chunkFiles,
 note: "Smothered Mate in 2",
 });

 console.log(`Generated ${puzzles.length} puzzles.`);
 console.log(`Wrote ${chunkFiles.length} chunks to ${path.relative(ROOT, OUT_DIR)}`);
}

main().catch((error) => {
 console.error(error);
 process.exit(1);
});