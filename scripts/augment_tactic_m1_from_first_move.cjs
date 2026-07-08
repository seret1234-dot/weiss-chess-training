const fs = require("fs");
const path = require("path");

const chessJs = require("chess.js");
const Chess = chessJs.Chess || chessJs;

const ROOT = process.cwd();
const DATA_ROOT = path.join(ROOT, "public", "data", "pattern-tactics");
const CATALOG_PATH = path.join(ROOT, "src", "tacticThemeCatalog.ts");

const CHUNK_SIZE = 30;
const MAX_THEME_PUZZLES = 300;
const MAX_MIXED_PUZZLES = 600;
const MIN_M1_PUZZLES = 20;

const simpleTagDefs = [
 ["defensiveMove", "defense"],
 ["advancedPawn", "advanced-pawn"],
 ["quietMove", "quiet-move"],
 ["discoveredAttack", "discovered-attack"],
 ["discoveredCheck", "discovered-check"],
 ["doubleCheck", "double-check"],
 ["hangingPiece", "hanging-piece"],
 ["trappedPiece", "trapped-piece"],
 ["capturingDefender", "remove-the-defender"],
 ["exposedKing", "vulnerable-king"],
 ["kingsideAttack", "kingside-attack"],
 ["queensideAttack", "queenside-attack"],
 ["attackingF2F7", "attacking-f2-f7"],
 ["enPassant", "en-passant"],
 ["zugzwang", "zugzwang"],
 ["intermezzo", "zwischenzug"],
 ["overloading", "overloading"],
 ["desperado", "desperado"],
 ["windmill", "windmill"],
 ["perpetualCheck", "perpetual-check"],
 ["stalemate", "stalemate"],
];

function readJson(filePath) {
 return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
 fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
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

function getPieceInfoAfterPreMove(fen, preMove, userMove) {
 const chess = makeChess(fen);
 if (!chess) return null;

 if (!playUci(chess, preMove)) return null;

 const from = userMove.slice(0, 2);
 const piece = chess.get ? chess.get(from) : null;

 const pieceKey = piece?.type
 ? ({
 p: "pawn",
 n: "knight",
 b: "bishop",
 r: "rook",
 q: "queen",
 k: "king",
 })[piece.type]
 : "unknown";

 return { pieceKey };
}

function addUnique(list, key, themeByKey) {
 if (!themeByKey.has(key)) return;
 if (!list.includes(key)) list.push(key);
}

function classifyFirstMovePuzzle(themes, info, userMove, themeByKey) {
 const set = new Set(Array.isArray(themes) ? themes : []);
 const keys = [];
 const pieceKey = info?.pieceKey || "unknown";

 for (const [tag, key] of simpleTagDefs) {
 if (set.has(tag)) addUnique(keys, key, themeByKey);
 }

 if (set.has("fork")) {
 addUnique(keys, `fork-${pieceKey}`, themeByKey);
 }

 if (set.has("pin")) {
 if (["bishop", "rook", "queen"].includes(pieceKey)) {
 addUnique(keys, `pin-${pieceKey}`, themeByKey);
 } else {
 addUnique(keys, "pin-other", themeByKey);
 }
 }

 if (set.has("skewer")) {
 if (["bishop", "rook", "queen"].includes(pieceKey)) {
 addUnique(keys, `skewer-${pieceKey}`, themeByKey);
 } else {
 addUnique(keys, "skewer-other", themeByKey);
 }
 }

 if (set.has("xRayAttack")) {
 if (["bishop", "rook", "queen"].includes(pieceKey)) {
 addUnique(keys, `xray-${pieceKey}`, themeByKey);
 } else {
 addUnique(keys, "xray-other", themeByKey);
 }
 }

 if (set.has("attraction") && set.has("deflection")) {
 addUnique(keys, "decoy-deflection-combined", themeByKey);
 } else if (set.has("attraction")) {
 addUnique(keys, "decoy-attraction", themeByKey);
 } else if (set.has("deflection")) {
 addUnique(keys, "deflection", themeByKey);
 }

 if (set.has("sacrifice")) {
 addUnique(keys, `sacrifice-${pieceKey}`, themeByKey);
 }

 if (set.has("clearance") && set.has("sacrifice")) {
 addUnique(keys, "clearance-sacrifice", themeByKey);
 } else if (set.has("clearance")) {
 addUnique(keys, "clearance", themeByKey);
 }

 if (set.has("interference") && set.has("sacrifice")) {
 addUnique(keys, "interference-sacrifice", themeByKey);
 } else if (set.has("interference")) {
 addUnique(keys, "interference", themeByKey);
 }

 if (set.has("promotion")) {
 addUnique(keys, "promotion", themeByKey);
 }

 if (set.has("underPromotion")) {
 addUnique(keys, "underpromotion", themeByKey);

 if (userMove.length >= 5 && userMove[4].toLowerCase() === "n") {
 addUnique(keys, "underpromotion-knight", themeByKey);
 }
 }

 return keys;
}

function extractCatalogArrayText(source) {
 const marker = "export const tacticThemeCatalog = ";
 const start = source.indexOf(marker);

 if (start < 0) {
 throw new Error("Could not find tacticThemeCatalog.");
 }

 const afterMarker = start + marker.length;
 const asConst = source.indexOf(" as const", afterMarker);

 if (asConst < 0) {
 throw new Error("Could not find tacticThemeCatalog as const.");
 }

 return source.slice(afterMarker, asConst).trim();
}

function loadCatalog() {
 const source = fs.readFileSync(CATALOG_PATH, "utf8");
 const catalog = JSON.parse(extractCatalogArrayText(source));

 const themeByKey = new Map();

 for (const theme of catalog) {
 themeByKey.set(theme.key, {
 ...theme,
 distances: [...theme.distances],
 countByDistance: { ...theme.countByDistance },
 });
 }

 return themeByKey;
}

function loadChunksFromFolder(folder) {
 const manifestPath = path.join(folder, "manifest.json");

 if (!fs.existsSync(manifestPath)) return [];

 const manifest = readJson(manifestPath);
 const files = Array.isArray(manifest.files) ? manifest.files : [];
 const puzzles = [];

 for (const file of files) {
 const chunkPath = path.join(folder, file);
 if (!fs.existsSync(chunkPath)) continue;

 const chunk = readJson(chunkPath);

 if (Array.isArray(chunk)) puzzles.push(...chunk);
 else if (Array.isArray(chunk.puzzles)) puzzles.push(...chunk.puzzles);
 }

 return puzzles;
}

function puzzleKey(puzzle) {
 return `${puzzle.fen}|${puzzle.preMove}|${puzzle.solutionLine.join(" ")}`;
}

function addPuzzleToBucket(outputs, themeKey, puzzle) {
 if (!outputs.has(themeKey)) {
 outputs.set(themeKey, {
 puzzles: [],
 seen: new Set(),
 });
 }

 const bucket = outputs.get(themeKey);
 const key = puzzleKey(puzzle);

 if (bucket.seen.has(key)) return;

 bucket.seen.add(key);
 bucket.puzzles.push(puzzle);
}

function comparePuzzles(a, b) {
 if ((a.rating || 0) !== (b.rating || 0)) {
 return (a.rating || 0) - (b.rating || 0);
 }

 return String(a.puzzleId || a.id).localeCompare(String(b.puzzleId || b.id));
}

function takeEvenlySpaced(sortedItems, count) {
 if (sortedItems.length <= count) return [...sortedItems];

 const result = [];
 const used = new Set();

 for (let i = 0; i < count; i++) {
 let idx = Math.round((i * (sortedItems.length - 1)) / (count - 1));

 while (used.has(idx) && idx < sortedItems.length - 1) idx++;
 while (used.has(idx) && idx > 0) idx--;

 if (!used.has(idx)) {
 used.add(idx);
 result.push(sortedItems[idx]);
 }
 }

 for (let i = 0; result.length < count && i < sortedItems.length; i++) {
 if (!used.has(i)) {
 used.add(i);
 result.push(sortedItems[i]);
 }
 }

 return result;
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
 return (x >>> 0) / 4294967296;
 };
}

function shuffle(items, seedText) {
 const arr = [...items];
 const random = randomFromSeed(seedFromString(seedText));

 for (let i = arr.length - 1; i > 0; i--) {
 const j = Math.floor(random() * (i + 1));
 [arr[i], arr[j]] = [arr[j], arr[i]];
 }

 return arr;
}

function camelName(input) {
 return input
 .split(/[^a-zA-Z0-9]+/)
 .filter(Boolean)
 .map((part, index) => {
 const lower = part.toLowerCase();
 const word = lower.charAt(0).toUpperCase() + lower.slice(1);
 return index === 0 ? lower : word;
 })
 .join("");
}

function configKey(themeKey, levelId) {
 return `${camelName(themeKey)}_${levelId}`.replace(/_m/, "M");
}

function backupFile(filePath, label) {
 if (!fs.existsSync(filePath)) return;
 fs.copyFileSync(filePath, `${filePath}.before_${label}_${Date.now()}.bak`);
}

function writeM1Data(outputs, themeByKey) {
 let written = 0;

 for (const theme of themeByKey.values()) {
 const m1Folder = path.join(DATA_ROOT, theme.slug, "m1");
 fs.rmSync(m1Folder, { recursive: true, force: true });
 }

 for (const [themeKey, output] of outputs.entries()) {
 const theme = themeByKey.get(themeKey);
 if (!theme) continue;

 const isMixed = themeKey === "mixed";
 const min = isMixed ? 1 : MIN_M1_PUZZLES;
 const max = isMixed ? MAX_MIXED_PUZZLES : MAX_THEME_PUZZLES;

 if (output.puzzles.length < min) continue;

 const selected = takeEvenlySpaced(
 [...output.puzzles].sort(comparePuzzles),
 Math.min(max, output.puzzles.length)
 ).sort(comparePuzzles);

 const m1Folder = path.join(DATA_ROOT, theme.slug, "m1");
 fs.mkdirSync(m1Folder, { recursive: true });

 const files = [];

 for (let i = 0; i < selected.length; i += CHUNK_SIZE) {
 const chunkNumber = Math.floor(i / CHUNK_SIZE) + 1;
 const band = selected.slice(i, i + CHUNK_SIZE);
 const chunk = shuffle(band, `${themeKey}-first-move-m1-${chunkNumber}`).map(
 (puzzle, chunkIndex) => ({
 ...puzzle,
 chunkNumber,
 chunkIndex,
 })
 );

 const fileName = `chunk-${String(chunkNumber).padStart(3, "0")}.json`;
 files.push(fileName);
 writeJson(path.join(m1Folder, fileName), chunk);
 }

 writeJson(path.join(m1Folder, "manifest.json"), {
 category: "tactics",
 theme: themeKey,
 totalPuzzles: selected.length,
 chunkSize: CHUNK_SIZE,
 totalChunks: files.length,
 files,
 note: `${theme.title} - Tactic in 1`,
 derivedM1: true,
 derivedFromFirstMove: true,
 });

 written++;
 console.log(`${theme.title} m1: ${selected.length} puzzles, ${files.length} chunks`);
 }

 return written;
}

function rebuildCatalog(themeByKey) {
 for (const theme of themeByKey.values()) {
 theme.distances = [];
 theme.countByDistance = {};
 }

 const levels = ["m1", "m2", "m3", "m4"];

 for (const theme of themeByKey.values()) {
 for (const level of levels) {
 const manifestPath = path.join(DATA_ROOT, theme.slug, level, "manifest.json");

 if (!fs.existsSync(manifestPath)) continue;

 const manifest = readJson(manifestPath);
 const total = Number(manifest.totalPuzzles || 0);

 if (!total) continue;

 theme.distances.push(level);
 theme.countByDistance[level] = total;
 }
 }

 const ordered = [...themeByKey.values()].filter((theme) => theme.distances.length > 0);

 const content = `export type TacticDistanceId = "m1" | "m2" | "m3" | "m4"

export const tacticDistanceLabels: Record<TacticDistanceId, string> = {
 m1: "Tactic in 1",
 m2: "Tactic in 2",
 m3: "Tactic in 3",
 m4: "Tactic in 4+",
}

export const tacticThemeCatalog = ${JSON.stringify(ordered, null, 2)} as const
`;

 backupFile(CATALOG_PATH, "augment_m1_first_move_catalog");
 fs.writeFileSync(CATALOG_PATH, content + "\n", "utf8");

 return ordered;
}

function rebuildPageConfigs(themeCatalog) {
 const filePath = path.join(ROOT, "src", "trainers", "patternTactic", "pageConfigs.ts");
 const entries = [];
 const routeEntries = [];

 for (const theme of themeCatalog) {
 for (const level of theme.distances) {
 const key = configKey(theme.key, level);
 const levelTitle =
 level === "m1"
 ? "Tactic in 1"
 : level === "m2"
 ? "Tactic in 2"
 : level === "m3"
 ? "Tactic in 3"
 : "Tactic in 4+";

 const dataBasePath = `/data/pattern-tactics/${theme.slug}/${level}`;

 entries.push(` ${key}: {
 title: "${theme.title} - ${levelTitle}",
 manifestPath: "${dataBasePath}/manifest.json",
 dataBasePath: "${dataBasePath}",
 progressKey: "tactic-${theme.key}-${level}",
 trainerKey: "tactic-${theme.key}-${level}",
 },`);

 routeEntries.push(` "${level}/${theme.slug}": patternTacticPageConfigs.${key},`);
 }
 }

 const content = `export const patternTacticPageConfigs = {
${entries.join("\n")}
}

export const patternTacticConfigByRoute = {
${routeEntries.join("\n")}
}

export type PatternTacticPageConfigKey = keyof typeof patternTacticPageConfigs
`;

 backupFile(filePath, "augment_m1_first_move_configs");
 fs.writeFileSync(filePath, content, "utf8");
}

function rebuildGeneratedCatalog(themeCatalog) {
 const rows = [];

 for (const theme of themeCatalog) {
 for (const level of theme.distances) {
 rows.push({
 title: theme.title,
 key: theme.key,
 level,
 routePath: `/tactics/${level}/${theme.slug}`,
 totalPuzzles: theme.countByDistance[level],
 totalChunks: Math.ceil(theme.countByDistance[level] / CHUNK_SIZE),
 });
 }
 }

 fs.writeFileSync(
 path.join(ROOT, "tactics_generated_catalog.json"),
 JSON.stringify(rows, null, 2) + "\n",
 "utf8"
 );
}

function verifyM1Data() {
 let checked = 0;
 let bad = 0;

 for (const theme of fs.readdirSync(DATA_ROOT)) {
 const folder = path.join(DATA_ROOT, theme, "m1");
 const manifestPath = path.join(folder, "manifest.json");

 if (!fs.existsSync(manifestPath)) continue;

 const manifest = readJson(manifestPath);

 for (const file of manifest.files || []) {
 const chunk = readJson(path.join(folder, file));

 for (const puzzle of chunk) {
 checked++;

 const chess = makeChess(puzzle.fen);

 if (!chess) {
 console.log("Bad FEN", theme, file, puzzle.id);
 bad++;
 continue;
 }

 if (!playUci(chess, puzzle.preMove)) {
 console.log("Bad premove", theme, file, puzzle.id, puzzle.preMove);
 bad++;
 continue;
 }

 const move = puzzle.solutionLine?.[0];

 if (!move || !playUci(chess, move)) {
 console.log("Bad solution", theme, file, puzzle.id, move);
 bad++;
 }
 }
 }
 }

 console.log(`Checked M1 puzzles: ${checked}`);
 console.log(`Bad M1 puzzles: ${bad}`);

 if (bad > 0) {
 process.exit(1);
 }
}

function main() {
 const themeByKey = loadCatalog();
 const outputs = new Map();

 console.log("Loading original M1 puzzles only...");

 for (const theme of themeByKey.values()) {
 const m1Folder = path.join(DATA_ROOT, theme.slug, "m1");
 const puzzles = loadChunksFromFolder(m1Folder);

 for (const puzzle of puzzles) {
 if (puzzle.derivedFrom) continue;

 const clean = {
 ...puzzle,
 solutionLine: Array.isArray(puzzle.solutionLine) ? puzzle.solutionLine.slice(0, 1) : [],
 userMoveIndexes: [0],
 tacticDistance: 1,
 label: `${theme.title} - Tactic in 1`,
 theme: theme.key,
 };

 if (clean.solutionLine.length === 1 && clean.preMove && clean.fen) {
 addPuzzleToBucket(outputs, theme.key, clean);
 }
 }
 }

 console.log("Extracting first tactical moves from M2/M3/M4...");

 let scanned = 0;
 let derived = 0;

 for (const theme of themeByKey.values()) {
 if (theme.key === "mixed") continue;

 for (const level of ["m2", "m3", "m4"]) {
 const folder = path.join(DATA_ROOT, theme.slug, level);
 const puzzles = loadChunksFromFolder(folder);

 for (const puzzle of puzzles) {
 scanned++;

 const startFen = puzzle.fen;
 const originalPreMove = puzzle.preMove;
 const line = Array.isArray(puzzle.solutionLine) ? puzzle.solutionLine : [];

 if (!startFen || !originalPreMove || line.length < 1) continue;

 const firstUserMove = line[0];

 const verifyChess = makeChess(startFen);
 if (!verifyChess) continue;

 if (!playUci(verifyChess, originalPreMove)) continue;
 if (!playUci(verifyChess, firstUserMove)) continue;

 const info = getPieceInfoAfterPreMove(startFen, originalPreMove, firstUserMove);

 const matchingKeys = classifyFirstMovePuzzle(
 puzzle.themes || [],
 info,
 firstUserMove,
 themeByKey
 );

 if (matchingKeys.length === 0) continue;

 const derivedPuzzleBase = {
 id: `first-move-m1-${puzzle.puzzleId || puzzle.id}`,
 puzzleId: puzzle.puzzleId || puzzle.id || "",
 fen: startFen,
 preMove: originalPreMove,
 solutionLine: [firstUserMove],
 userMoveIndexes: [0],
 tacticDistance: 1,
 rating: puzzle.rating || 0,
 sourceThemeKeys: matchingKeys,
 sourceThemes: matchingKeys.map((key) => themeByKey.get(key)?.title || key),
 themes: puzzle.themes || [],
 derivedFrom: {
 originalId: puzzle.id,
 originalPuzzleId: puzzle.puzzleId || "",
 originalTheme: puzzle.theme || theme.key,
 originalLevel: level,
 firstMoveOnly: true,
 },
 };

 for (const key of matchingKeys) {
 const targetTheme = themeByKey.get(key);
 if (!targetTheme) continue;

 addPuzzleToBucket(outputs, key, {
 ...derivedPuzzleBase,
 id: `${key}-${derivedPuzzleBase.id}`,
 label: `${targetTheme.title} - Tactic in 1`,
 theme: key,
 });
 }

 addPuzzleToBucket(outputs, "mixed", {
 ...derivedPuzzleBase,
 id: `mixed-${derivedPuzzleBase.id}`,
 label: "Mixed - Tactic in 1",
 theme: "mixed",
 });

 derived++;
 }
 }
 }

 console.log(`Scanned source puzzles: ${scanned}`);
 console.log(`Derived first-move candidates: ${derived}`);

 console.log("Writing first-move M1 data...");
 const written = writeM1Data(outputs, themeByKey);
 console.log(`Written M1 trainers: ${written}`);

 console.log("Rebuilding catalog and configs...");
 const themeCatalog = rebuildCatalog(themeByKey);
 rebuildPageConfigs(themeCatalog);
 rebuildGeneratedCatalog(themeCatalog);

 console.log("Verifying M1 legality...");
 verifyM1Data();

 console.log("Done.");
}

main();