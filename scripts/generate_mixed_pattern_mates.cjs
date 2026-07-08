const fs = require("fs");
const path = require("path");
const readline = require("readline");

const chessJs = require("chess.js");
const Chess = chessJs.Chess || chessJs;

const ROOT = process.cwd();
const CSV_PATH = path.join(ROOT, "lichess_db_puzzle.csv");

const CHUNK_SIZE = 30;
const MAX_PUZZLES_PER_DISTANCE = 600;
const MIN_PER_THEME_WHEN_AVAILABLE = 30;

const themeDefs = [
 { name: "Back Rank", tag: "backRankMate" },
 { name: "Arabian", tag: "arabianMate" },
 { name: "Anastasia", tag: "anastasiaMate" },
 { name: "Boden", tag: "bodenMate" },
 { name: "Smothered", tag: "smotheredMate" },
 { name: "Hook", tag: "hookMate" },
 { name: "Kill Box", tag: "killBoxMate" },
 { name: "Dovetail", tag: "dovetailMate" },
 { name: "Double Bishop", tag: "doubleBishopMate" },
];

const outputs = [1, 2, 3, 4, 5].map((n) => ({
 distance: n,
 key: `mixedMate${n}`,
 pageName: `MixedMateIn${n}Page`,
 pageFile: `MixedMateIn${n}Page.tsx`,
 title: `Mixed Mate in ${n}`,
 routePath: `/mates/m${n}/mixed`,
 dataFolder: path.join(ROOT, "public", "data", "pattern-mates", "mixed", `mate-in-${n}`),
 manifestPath: `/data/pattern-mates/mixed/mate-in-${n}/manifest.json`,
 progressKey: `mixed-mate-${n}`,
 puzzles: [],
 seenFens: new Set(),
}));

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

function userMoveIndexesForMateDistance(n) {
 return Array.from({ length: n }, (_, i) => i * 2);
}

async function scanCsv() {
 if (!fs.existsSync(CSV_PATH)) {
 throw new Error(`Missing CSV: ${CSV_PATH}`);
 }

 const rl = readline.createInterface({
 input: fs.createReadStream(CSV_PATH, { encoding: "utf8" }),
 crlfDelay: Infinity,
 });

 let headers = null;
 let idIndex = -1;
 let fenIndex = -1;
 let movesIndex = -1;
 let ratingIndex = -1;
 let themesIndex = -1;

 for await (const rawLine of rl) {
 const line = rawLine.replace(/^\uFEFF/, "");
 if (!line.trim()) continue;

 const cells = parseCsvLine(line);

 if (!headers) {
 headers = cells.map((cell) => cell.replace(/^\uFEFF/, ""));
 const lower = headers.map((h) => h.toLowerCase());

 idIndex = lower.indexOf("puzzleid");
 fenIndex = lower.indexOf("fen");
 movesIndex = lower.indexOf("moves");
 ratingIndex = lower.indexOf("rating");
 themesIndex = lower.indexOf("themes");

 if (fenIndex < 0 || movesIndex < 0 || themesIndex < 0) {
 throw new Error("CSV must have FEN, Moves, and Themes columns.");
 }

 continue;
 }

 const themes = String(cells[themesIndex] || "").split(/\s+/).filter(Boolean);
 const themeSet = new Set(themes);
 const mateTheme = themes.find((theme) => /^mateIn[1-5]$/.test(theme));
 if (!mateTheme) continue;

 const distance = Number(mateTheme.replace("mateIn", ""));
 const output = outputs.find((item) => item.distance === distance);
 if (!output) continue;

 const sourceTheme = themeDefs.find((theme) => themeSet.has(theme.tag));
 if (!sourceTheme) continue;

 addPuzzleToOutput({
 output,
 sourceTheme,
 fen: cells[fenIndex] || "",
 movesText: cells[movesIndex] || "",
 rating: Number(cells[ratingIndex] || 0) || 0,
 puzzleId: idIndex >= 0 ? cells[idIndex] || "" : "",
 themes,
 });
 }
}

function addPuzzleToOutput({ output, sourceTheme, fen, movesText, rating, puzzleId, themes }) {
 const solutionMoveCount = (2 * output.distance) - 1;
 const requiredMoveTokens = solutionMoveCount + 1;
 const moveTokens = movesText.trim().split(/\s+/).filter(Boolean);

 if (moveTokens.length < requiredMoveTokens) return;

 const preMove = moveTokens[0];
 const solutionLine = moveTokens.slice(1, 1 + solutionMoveCount);

 const startChess = makeChess(fen);
 if (!startChess) return;

 const preResult = playUci(startChess, preMove);
 if (!preResult) return;

 const trainerFen = startChess.fen();
 if (output.seenFens.has(trainerFen)) return;

 const verifyChess = makeChess(trainerFen);
 if (!verifyChess) return;

 for (const move of solutionLine) {
 const result = playUci(verifyChess, move);
 if (!result) return;
 }

 if (!isCheckmate(verifyChess)) return;

 output.seenFens.add(trainerFen);

 output.puzzles.push({
 id: puzzleId
 ? `mixed-mate-in-${output.distance}-${puzzleId}`
 : `mixed-mate-in-${output.distance}-${output.puzzles.length + 1}`,
 puzzleId,
 fen: trainerFen,
 initialFen: fen,
 preMove,
 solutionLine,
 userMoveIndexes: userMoveIndexesForMateDistance(output.distance),
 mateDistance: output.distance,
 solutionMoveCount,
 rating,
 label: `Mixed Mate in ${output.distance} - ${sourceTheme.name}`,
 theme: "mixed",
 sourceTheme: sourceTheme.name,
 sourceThemeTag: sourceTheme.tag,
 themes,
 });
}

function takeEvenlySpaced(sortedItems, count) {
 if (count >= sortedItems.length) return [...sortedItems];
 if (count <= 0) return [];

 if (count === 1) return [sortedItems[0]];

 const result = [];
 const used = new Set();

 for (let i = 0; i < count; i++) {
 const idx = Math.round((i * (sortedItems.length - 1)) / (count - 1));
 if (!used.has(idx)) {
 used.add(idx);
 result.push(sortedItems[idx]);
 }
 }

 return result;
}

function selectReasonableSet(puzzles) {
 const sorted = [...puzzles].sort(comparePuzzles);
 if (sorted.length <= MAX_PUZZLES_PER_DISTANCE) return sorted;

 const selected = [];
 const selectedIds = new Set();

 for (const theme of themeDefs) {
 const themeItems = sorted.filter((p) => p.sourceThemeTag === theme.tag);
 const themeSorted = themeItems.sort(comparePuzzles);
 const sample = takeEvenlySpaced(
 themeSorted,
 Math.min(MIN_PER_THEME_WHEN_AVAILABLE, themeSorted.length)
 );

 for (const puzzle of sample) {
 if (selectedIds.has(puzzle.id)) continue;
 selectedIds.add(puzzle.id);
 selected.push(puzzle);
 }
 }

 for (const puzzle of sorted) {
 if (selected.length >= MAX_PUZZLES_PER_DISTANCE) break;
 if (selectedIds.has(puzzle.id)) continue;
 selectedIds.add(puzzle.id);
 selected.push(puzzle);
 }

 return selected.sort(comparePuzzles).slice(0, MAX_PUZZLES_PER_DISTANCE);
}

function comparePuzzles(a, b) {
 if (a.rating !== b.rating) return a.rating - b.rating;
 if (a.sourceTheme !== b.sourceTheme) return a.sourceTheme.localeCompare(b.sourceTheme);
 return String(a.puzzleId || a.id).localeCompare(String(b.puzzleId || b.id));
}

function seedFromString(str) {
 let seed = 2166136261;

 for (let i = 0; i < str.length; i++) {
 seed ^= str.charCodeAt(i);
 seed = Math.imul(seed, 16777619);
 }

 return seed >>> 0;
}

function randomFromSeed(seed) {
 let x = seed || 123456789;

 return function random() {
 x ^= x << 13;
 x ^= x >>> 17;
 x ^= x << 5;
 return ((x >>> 0) / 4294967296);
 };
}

function shuffleInsideDifficultyBand(items, seedText) {
 const random = randomFromSeed(seedFromString(seedText));
 const arr = [...items];

 for (let i = arr.length - 1; i > 0; i--) {
 const j = Math.floor(random() * (i + 1));
 [arr[i], arr[j]] = [arr[j], arr[i]];
 }

 return arr;
}

function writeJson(filePath, data) {
 fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function writeData() {
 for (const output of outputs) {
 const selected = selectReasonableSet(output.puzzles);

 if (selected.length === 0) {
 throw new Error(`No puzzles generated for ${output.title}`);
 }

 fs.rmSync(output.dataFolder, { recursive: true, force: true });
 fs.mkdirSync(output.dataFolder, { recursive: true });

 const files = [];

 for (let i = 0; i < selected.length; i += CHUNK_SIZE) {
 const chunkNumber = Math.floor(i / CHUNK_SIZE) + 1;

 const difficultyBand = selected.slice(i, i + CHUNK_SIZE);
 const shuffledBand = shuffleInsideDifficultyBand(
 difficultyBand,
 `${output.title}-${chunkNumber}`
 );

 const chunk = shuffledBand.map((puzzle, chunkIndex) => ({
 ...puzzle,
 chunkNumber,
 chunkIndex,
 }));

 const fileName = `chunk-${String(chunkNumber).padStart(3, "0")}.json`;
 files.push(fileName);
 writeJson(path.join(output.dataFolder, fileName), chunk);
 }

 writeJson(path.join(output.dataFolder, "manifest.json"), {
 category: "mates",
 theme: "mixed",
 subtheme: "mixedMate",
 totalPuzzles: selected.length,
 chunkSize: CHUNK_SIZE,
 totalChunks: files.length,
 files,
 note: `${output.title}. Mixed real CSV-tagged themes. Easy to hard by chunk, shuffled inside each chunk.`,
 sourceThemes: themeDefs.map((theme) => theme.tag),
 maxPuzzles: MAX_PUZZLES_PER_DISTANCE,
 });

 const byTheme = {};
 for (const puzzle of selected) {
 byTheme[puzzle.sourceTheme] = (byTheme[puzzle.sourceTheme] || 0) + 1;
 }

 console.log(`${output.title}: ${selected.length} puzzles, ${files.length} chunks`);
 console.table(byTheme);
 }
}

function backupFile(filePath, label) {
 if (!fs.existsSync(filePath)) return;
 fs.copyFileSync(filePath, `${filePath}.before_${label}_${Date.now()}.bak`);
}

function findMatchingBrace(text, openIndex) {
 let depth = 0;
 let inString = false;
 let quote = "";
 let escape = false;

 for (let i = openIndex; i < text.length; i++) {
 const ch = text[i];

 if (inString) {
 if (escape) {
 escape = false;
 continue;
 }

 if (ch === "\\") {
 escape = true;
 continue;
 }

 if (ch === quote) {
 inString = false;
 }

 continue;
 }

 if (ch === '"' || ch === "'" || ch === "`") {
 inString = true;
 quote = ch;
 continue;
 }

 if (ch === "{") {
 depth++;
 } else if (ch === "}") {
 depth--;
 if (depth === 0) return i;
 }
 }

 return -1;
}

function updatePageConfigs() {
 const filePath = path.join(ROOT, "src", "trainers", "patternMate", "pageConfigs.ts");
 let txt = fs.readFileSync(filePath, "utf8");

 const nameIndex = txt.indexOf("patternMatePageConfigs");
 if (nameIndex < 0) throw new Error("Could not find patternMatePageConfigs.");

 const openIndex = txt.indexOf("{", nameIndex);
 if (openIndex < 0) throw new Error("Could not find opening brace of patternMatePageConfigs.");

 const closeIndex = findMatchingBrace(txt, openIndex);
 if (closeIndex < 0) throw new Error("Could not find closing brace of patternMatePageConfigs.");

 const entries = [];

 for (const output of outputs) {
 if (new RegExp(`\\b${output.key}\\s*:`).test(txt)) continue;

 entries.push(`
 ${output.key}: {
 title: "${output.title}",
 manifestPath: "${output.manifestPath}",
 progressKey: "${output.progressKey}",
 },
`);
 }

 if (entries.length === 0) return;

 let before = txt.slice(0, closeIndex);
 const after = txt.slice(closeIndex);

 const trimmedBefore = before.trimEnd();
 const trailingWhitespace = before.slice(trimmedBefore.length);

 if (!trimmedBefore.endsWith("{") && !trimmedBefore.endsWith(",")) {
 before = trimmedBefore + "," + trailingWhitespace;
 }

 txt = before + entries.join("") + after;

 backupFile(filePath, "mixed_mate_configs");
 fs.writeFileSync(filePath, txt, "utf8");
}

function writePageWrappers() {
 for (const output of outputs) {
 const filePath = path.join(ROOT, "src", output.pageFile);
 const content = `import createPatternMatePage from "./trainers/patternMate/createPatternMatePage"
import { patternMatePageConfigs } from "./trainers/patternMate/pageConfigs"

export default createPatternMatePage(patternMatePageConfigs.${output.key})
`;

 fs.writeFileSync(filePath, content, "utf8");
 }
}

function updateRouter() {
 const filePath = path.join(ROOT, "src", "AppRouter.tsx");
 let txt = fs.readFileSync(filePath, "utf8");
 let changed = false;
 const nl = txt.includes("\r\n") ? "\r\n" : "\n";

 for (const output of outputs) {
 const importLine = `import ${output.pageName} from "./${output.pageName}"`;

 if (!txt.includes(importLine)) {
 const importMatches = [...txt.matchAll(/^import[^\r\n]*(\r?\n)?/gm)];
 if (importMatches.length > 0) {
 const last = importMatches[importMatches.length - 1];
 txt = txt.slice(0, last.index + last[0].length) + importLine + nl + txt.slice(last.index + last[0].length);
 } else {
 txt = importLine + nl + txt;
 }
 changed = true;
 }

 if (!txt.includes(`path="${output.routePath}"`)) {
 const routeLine = `<Route path="${output.routePath}" element={<${output.pageName} />} />`;
 const routeClose = txt.match(/(\r?\n)([ \t]*)<\/Routes>/);

 if (!routeClose) throw new Error("Could not find </Routes> in AppRouter.tsx");

 const insert = `${routeClose[1]}${routeClose[2]} ${routeLine}`;
 txt = txt.slice(0, routeClose.index) + insert + txt.slice(routeClose.index);
 changed = true;
 }
 }

 if (changed) {
 backupFile(filePath, "mixed_mate_router");
 fs.writeFileSync(filePath, txt, "utf8");
 }
}

async function main() {
 await scanCsv();
 writeData();
 updatePageConfigs();
 writePageWrappers();
 updateRouter();
}

main().catch((error) => {
 console.error(error);
 process.exit(1);
});