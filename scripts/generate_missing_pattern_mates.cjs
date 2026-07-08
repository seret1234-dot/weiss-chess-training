const fs = require("fs");
const path = require("path");
const readline = require("readline");

const chessJs = require("chess.js");
const Chess = chessJs.Chess || chessJs;

const ROOT = process.cwd();
const CSV_PATH = path.join(ROOT, "lichess_db_puzzle.csv");

const CHUNK_SIZE = 30;
const MAX_PUZZLES = 1500;

const outputs = [
 ...makeThemeOutputs({
 display: "Kill Box",
 tag: "killBoxMate",
 slug: "kill-box",
 folder: "kill-box",
 keyBase: "killBoxMate",
 pageBase: "KillBoxMateIn",
 titleBase: "Kill Box Mate",
 distances: [1, 2, 3, 4, 5],
 }),
 ...makeThemeOutputs({
 display: "Dovetail",
 tag: "dovetailMate",
 slug: "dovetail",
 folder: "dovetail",
 keyBase: "dovetailMate",
 pageBase: "DovetailMateIn",
 titleBase: "Dovetail Mate",
 distances: [1, 2, 3, 4, 5],
 }),
 ...makeThemeOutputs({
 display: "Double Bishop",
 tag: "doubleBishopMate",
 slug: "double-bishop",
 folder: "double-bishop",
 keyBase: "doubleBishopMate",
 pageBase: "DoubleBishopMateIn",
 titleBase: "Double Bishop Mate",
 distances: [1, 2],
 }),
 {
 display: "Double Bishop",
 tag: "doubleBishopMate",
 slug: "double-bishop",
 folder: "double-bishop",
 key: "doubleBishopMate3",
 pageName: "DoubleBishopMateIn3Page",
 pageFile: "DoubleBishopMateIn3Page.tsx",
 title: "Double Bishop Mate in 3+",
 note: "Double Bishop Mate in 3+",
 routeLevel: 3,
 routePath: "/mates/m3/double-bishop",
 dataLevel: 3,
 dataFolder: path.join(ROOT, "public", "data", "pattern-mates", "double-bishop", "mate-in-3"),
 manifestPath: "/data/pattern-mates/double-bishop/mate-in-3/manifest.json",
 progressKey: "double-bishop-mate-3-plus",
 sourceDistances: [3, 4, 5],
 puzzles: [],
 seenFens: new Set(),
 },
];

function makeThemeOutputs(def) {
 return def.distances.map((n) => ({
 ...def,
 key: `${def.keyBase}${n}`,
 pageName: `${def.pageBase}${n}Page`,
 pageFile: `${def.pageBase}${n}Page.tsx`,
 title: `${def.titleBase} in ${n}`,
 note: `${def.titleBase} in ${n}`,
 routeLevel: n,
 routePath: `/mates/m${n}/${def.slug}`,
 dataLevel: n,
 dataFolder: path.join(ROOT, "public", "data", "pattern-mates", def.folder, `mate-in-${n}`),
 manifestPath: `/data/pattern-mates/${def.folder}/mate-in-${n}/manifest.json`,
 progressKey: `${def.slug}-mate-${n}`,
 sourceDistances: [n],
 puzzles: [],
 seenFens: new Set(),
 }));
}

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

 const fen = cells[fenIndex] || "";
 const movesText = cells[movesIndex] || "";
 const rating = Number(cells[ratingIndex] || 0) || 0;
 const puzzleId = idIndex >= 0 ? cells[idIndex] || "" : "";

 const themes = String(cells[themesIndex] || "").split(/\s+/).filter(Boolean);
 const themeSet = new Set(themes);
 const mateTheme = themes.find((theme) => /^mateIn[1-5]$/.test(theme));
 if (!mateTheme) continue;

 const sourceDistance = Number(mateTheme.replace("mateIn", ""));
 if (!sourceDistance) continue;

 for (const output of outputs) {
 if (!themeSet.has(output.tag)) continue;
 if (!output.sourceDistances.includes(sourceDistance)) continue;

 addPuzzleToOutput({
 output,
 sourceDistance,
 fen,
 movesText,
 rating,
 puzzleId,
 themes,
 });
 }
 }
}

function addPuzzleToOutput({ output, sourceDistance, fen, movesText, rating, puzzleId, themes }) {
 const solutionMoveCount = (2 * sourceDistance) - 1;
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
 ? `${output.folder}-mate-in-${output.dataLevel}-${puzzleId}`
 : `${output.folder}-mate-in-${output.dataLevel}-${output.puzzles.length + 1}`,
 puzzleId,
 fen: trainerFen,
 initialFen: fen,
 preMove,
 solutionLine,
 userMoveIndexes: userMoveIndexesForMateDistance(sourceDistance),
 mateDistance: sourceDistance,
 solutionMoveCount,
 rating,
 label: output.title,
 theme: output.tag,
 themes,
 });
}

function writeJson(filePath, data) {
 fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function writeData() {
 for (const output of outputs) {
 output.puzzles.sort((a, b) => {
 if (a.rating !== b.rating) return a.rating - b.rating;
 if (a.mateDistance !== b.mateDistance) return a.mateDistance - b.mateDistance;
 return String(a.puzzleId || a.id).localeCompare(String(b.puzzleId || b.id));
 });

 output.puzzles = output.puzzles.slice(0, MAX_PUZZLES);

 if (output.puzzles.length === 0) {
 throw new Error(`No puzzles generated for ${output.title}`);
 }

 fs.rmSync(output.dataFolder, { recursive: true, force: true });
 fs.mkdirSync(output.dataFolder, { recursive: true });

 const files = [];

 for (let i = 0; i < output.puzzles.length; i += CHUNK_SIZE) {
 const chunkNumber = Math.floor(i / CHUNK_SIZE) + 1;
 const chunk = output.puzzles.slice(i, i + CHUNK_SIZE).map((puzzle, chunkIndex) => ({
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
 theme: output.folder,
 subtheme: output.tag,
 totalPuzzles: output.puzzles.length,
 chunkSize: CHUNK_SIZE,
 totalChunks: files.length,
 files,
 note: output.note,
 });

 console.log(`${output.title}: ${output.puzzles.length} puzzles, ${files.length} chunks`);
 }
}

function backupFile(filePath, label) {
 if (!fs.existsSync(filePath)) return;
 fs.copyFileSync(filePath, `${filePath}.before_${label}_${Date.now()}.bak`);
}

function updatePageConfigs() {
 const filePath = path.join(ROOT, "src", "trainers", "patternMate", "pageConfigs.ts");
 let txt = fs.readFileSync(filePath, "utf8");

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

 const nameIndex = txt.indexOf("patternMatePageConfigs");
 if (nameIndex < 0) {
 throw new Error("Could not find patternMatePageConfigs.");
 }

 const openIndex = txt.indexOf("{", nameIndex);
 if (openIndex < 0) {
 throw new Error("Could not find opening brace of patternMatePageConfigs.");
 }

 const closeIndex = findMatchingBrace(txt, openIndex);
 if (closeIndex < 0) {
 throw new Error("Could not find closing brace of patternMatePageConfigs.");
 }

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

 backupFile(filePath, "missing_pattern_mates_configs");
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

 if (!routeClose) {
 throw new Error("Could not find </Routes> in AppRouter.tsx");
 }

 const insert = `${routeClose[1]}${routeClose[2]} ${routeLine}`;
 txt = txt.slice(0, routeClose.index) + insert + txt.slice(routeClose.index);
 changed = true;
 }
 }

 if (changed) {
 backupFile(filePath, "missing_pattern_mates_router");
 fs.writeFileSync(filePath, txt, "utf8");
 }
}

function findObjectStart(text, insideIndex) {
 let inString = false;
 let quote = "";
 let escape = false;

 for (let i = insideIndex; i >= 0; i--) {
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

 if (ch === "{") return i;
 }

 return -1;
}

function updateMateDistancePage() {
 const filePath = path.join(ROOT, "src", "MateDistancePage.tsx");
 if (!fs.existsSync(filePath)) return;

 let txt = fs.readFileSync(filePath, "utf8");

 if (txt.includes("Double Bishop")) {
 return;
 }

 const mixedIndex =
 txt.indexOf("title: 'Mixed'") >= 0
 ? txt.indexOf("title: 'Mixed'")
 : txt.indexOf('title: "Mixed"');

 if (mixedIndex < 0) {
 console.log("Could not find Mixed card; skipping Double Bishop card insertion.");
 return;
 }

 const mixedStart = findObjectStart(txt, mixedIndex);
 if (mixedStart < 0) {
 console.log("Could not find Mixed card object; skipping Double Bishop card insertion.");
 return;
 }

 const card = `
 ...(level === 'm4' || level === 'm5'
 ? []
 : [
 {
 title: level === 'm3' ? 'Double Bishop 3+' : 'Double Bishop',
 subtitle: level === 'm3'
 ? 'Double bishop mates in 3, 4, and 5'
 : 'Two bishops mating pattern',
 icon: 'B',
 accent: 'linear-gradient(135deg, #4f8cff, #9b5cff)',
 href: \`/mates/\${level}/double-bishop\`,
 },
 ]),

`;

 backupFile(filePath, "double_bishop_card");
 txt = txt.slice(0, mixedStart) + card + txt.slice(mixedStart);
 fs.writeFileSync(filePath, txt, "utf8");
}

async function main() {
 await scanCsv();
 writeData();
 updatePageConfigs();
 writePageWrappers();
 updateRouter();
 updateMateDistancePage();
}

main().catch((error) => {
 console.error(error);
 process.exit(1);
});