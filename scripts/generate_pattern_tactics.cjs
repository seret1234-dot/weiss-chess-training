const fs = require("fs");
const path = require("path");
const readline = require("readline");

const ROOT = process.cwd();
const CSV_PATH = path.join(ROOT, "lichess_db_puzzle.csv");

const CHUNK_SIZE = 30;
const MAX_THEME_PUZZLES = 300;
const MAX_MIXED_PUZZLES = 600;

const levels = [
 { id: "m1", title: "Tactic in 1", distance: 1, min: 20 },
 { id: "m2", title: "Tactic in 2", distance: 2, min: 50 },
 { id: "m3", title: "Tactic in 3", distance: 3, min: 50 },
 { id: "m4", title: "Tactic in 4+", distance: 4, min: 50 },
];

const pieceName = {
 p: "Pawn",
 n: "Knight",
 b: "Bishop",
 r: "Rook",
 q: "Queen",
 k: "King",
};

const pieceKey = {
 p: "pawn",
 n: "knight",
 b: "bishop",
 r: "rook",
 q: "queen",
 k: "king",
};

const themeDefs = [
 { key: "defense", title: "Defense", slug: "defense" },
 { key: "advanced-pawn", title: "Advanced Pawn", slug: "advanced-pawn" },
 { key: "quiet-move", title: "Quiet Move", slug: "quiet-move" },
 { key: "discovered-attack", title: "Discovered Attack", slug: "discovered-attack" },
 { key: "discovered-check", title: "Discovered Check", slug: "discovered-check" },
 { key: "double-check", title: "Double Check", slug: "double-check" },

 { key: "fork-knight", title: "Knight Fork / Double Attack", slug: "knight-fork" },
 { key: "fork-queen", title: "Queen Fork / Double Attack", slug: "queen-fork" },
 { key: "fork-rook", title: "Rook Fork / Double Attack", slug: "rook-fork" },
 { key: "fork-bishop", title: "Bishop Fork / Double Attack", slug: "bishop-fork" },
 { key: "fork-pawn", title: "Pawn Fork / Double Attack", slug: "pawn-fork" },
 { key: "fork-king", title: "King Fork / Double Attack", slug: "king-fork" },

 { key: "pin-rook", title: "Rook Pin", slug: "rook-pin" },
 { key: "pin-queen", title: "Queen Pin", slug: "queen-pin" },
 { key: "pin-bishop", title: "Bishop Pin", slug: "bishop-pin" },
 { key: "pin-other", title: "Other Pin", slug: "other-pin" },

 { key: "skewer-rook", title: "Rook Skewer", slug: "rook-skewer" },
 { key: "skewer-queen", title: "Queen Skewer", slug: "queen-skewer" },
 { key: "skewer-bishop", title: "Bishop Skewer", slug: "bishop-skewer" },
 { key: "skewer-other", title: "Other Skewer", slug: "other-skewer" },

 { key: "decoy-attraction", title: "Decoy / Attraction", slug: "decoy-attraction" },
 { key: "deflection", title: "Deflection", slug: "deflection" },
 { key: "decoy-deflection-combined", title: "Decoy + Deflection", slug: "decoy-deflection" },

 { key: "hanging-piece", title: "Hanging Piece", slug: "hanging-piece" },
 { key: "trapped-piece", title: "Trapped Piece", slug: "trapped-piece" },
 { key: "remove-the-defender", title: "Remove the Defender", slug: "remove-the-defender" },
 { key: "vulnerable-king", title: "Vulnerable / Exposed King", slug: "vulnerable-king" },
 { key: "kingside-attack", title: "Kingside Attack", slug: "kingside-attack" },
 { key: "queenside-attack", title: "Queenside Attack", slug: "queenside-attack" },
 { key: "attacking-f2-f7", title: "Attacking f2/f7", slug: "attacking-f2-f7" },

 { key: "sacrifice-queen", title: "Queen Sacrifice", slug: "queen-sacrifice" },
 { key: "sacrifice-rook", title: "Rook Sacrifice", slug: "rook-sacrifice" },
 { key: "sacrifice-bishop", title: "Bishop Sacrifice", slug: "bishop-sacrifice" },
 { key: "sacrifice-knight", title: "Knight Sacrifice", slug: "knight-sacrifice" },
 { key: "sacrifice-pawn", title: "Pawn Sacrifice", slug: "pawn-sacrifice" },
 { key: "sacrifice-king", title: "King Sacrifice", slug: "king-sacrifice" },

 { key: "clearance", title: "Clearance", slug: "clearance" },
 { key: "clearance-sacrifice", title: "Clearance Sacrifice", slug: "clearance-sacrifice" },
 { key: "interference", title: "Interference", slug: "interference" },
 { key: "interference-sacrifice", title: "Interference Sacrifice", slug: "interference-sacrifice" },

 { key: "xray-queen", title: "Queen X-Ray Attack", slug: "queen-xray" },
 { key: "xray-rook", title: "Rook X-Ray Attack", slug: "rook-xray" },
 { key: "xray-bishop", title: "Bishop X-Ray Attack", slug: "bishop-xray" },
 { key: "xray-other", title: "Other X-Ray Attack", slug: "other-xray" },

 { key: "promotion", title: "Promotion", slug: "promotion" },
 { key: "underpromotion", title: "Underpromotion", slug: "underpromotion" },
 { key: "underpromotion-knight", title: "Knight Underpromotion", slug: "knight-underpromotion" },
 { key: "en-passant", title: "En Passant", slug: "en-passant" },

 { key: "zugzwang", title: "Zugzwang", slug: "zugzwang" },
 { key: "zwischenzug", title: "Zwischenzug / Intermezzo", slug: "zwischenzug" },

 { key: "overloading", title: "Overloading", slug: "overloading" },
 { key: "desperado", title: "Desperado", slug: "desperado" },
 { key: "windmill", title: "Windmill", slug: "windmill" },
 { key: "perpetual-check", title: "Perpetual Check", slug: "perpetual-check" },
 { key: "stalemate", title: "Stalemate", slug: "stalemate" },

 { key: "mixed", title: "Mixed", slug: "mixed" },
];

const themeByKey = new Map(themeDefs.map((item) => [item.key, item]));

const relevantTags = new Set([
 "defensiveMove",
 "advancedPawn",
 "quietMove",
 "discoveredAttack",
 "discoveredCheck",
 "doubleCheck",
 "fork",
 "pin",
 "skewer",
 "attraction",
 "deflection",
 "hangingPiece",
 "trappedPiece",
 "capturingDefender",
 "exposedKing",
 "kingsideAttack",
 "queensideAttack",
 "attackingF2F7",
 "sacrifice",
 "clearance",
 "interference",
 "xRayAttack",
 "promotion",
 "underPromotion",
 "enPassant",
 "zugzwang",
 "intermezzo",
 "overloading",
 "desperado",
 "windmill",
 "perpetualCheck",
 "stalemate",
]);

function parseCsvLine(line) {
 const out = [];
 let cur = "";
 let q = false;

 for (let i = 0; i < line.length; i++) {
 const ch = line[i];

 if (ch === '"') {
 if (q && line[i + 1] === '"') {
 cur += '"';
 i++;
 } else {
 q = !q;
 }
 continue;
 }

 if (ch === "," && !q) {
 out.push(cur);
 cur = "";
 continue;
 }

 cur += ch;
 }

 out.push(cur);
 return out;
}

function isMateTheme(themes, set) {
 return (
 set.has("mate") ||
 themes.some((t) => /^mateIn\d+$/.test(t)) ||
 themes.some((t) => /Mate$/.test(t))
 );
}

function hasRelevantTag(set) {
 for (const tag of relevantTags) {
 if (set.has(tag)) return true;
 }
 return false;
}

function boardFromFen(fen) {
 const boardPart = fen.split(/\s+/)[0];
 const rows = boardPart.split("/");
 if (rows.length !== 8) return null;

 const board = [];

 for (const row of rows) {
 const out = [];

 for (const ch of row) {
 if (/\d/.test(ch)) {
 for (let i = 0; i < Number(ch); i++) out.push(null);
 } else {
 out.push(ch);
 }
 }

 if (out.length !== 8) return null;
 board.push(out);
 }

 return board;
}

function squareToCoords(square) {
 if (!/^[a-h][1-8]$/.test(square)) return null;
 return {
 row: 8 - Number(square[1]),
 col: square.charCodeAt(0) - 97,
 };
}

function getSquare(board, square) {
 const c = squareToCoords(square);
 if (!c) return null;
 return board[c.row][c.col];
}

function setSquare(board, square, value) {
 const c = squareToCoords(square);
 if (!c) return false;
 board[c.row][c.col] = value;
 return true;
}

function applyUci(board, uci) {
 if (!uci || uci.length < 4) return false;

 const from = uci.slice(0, 2);
 const to = uci.slice(2, 4);
 const promo = uci.length >= 5 ? uci[4].toLowerCase() : "";

 let piece = getSquare(board, from);
 if (!piece) return false;

 const fromCoords = squareToCoords(from);
 const toCoords = squareToCoords(to);
 if (!fromCoords || !toCoords) return false;

 const movingPawn = piece.toLowerCase() === "p";
 const target = getSquare(board, to);

 if (movingPawn && fromCoords.col !== toCoords.col && !target) {
 const capturedPawnRow = fromCoords.row;
 const capturedPawnSquare =
 String.fromCharCode(97 + toCoords.col) + String(8 - capturedPawnRow);
 setSquare(board, capturedPawnSquare, null);
 }

 setSquare(board, from, null);

 if (promo) {
 piece = piece === piece.toUpperCase() ? promo.toUpperCase() : promo.toLowerCase();
 }

 setSquare(board, to, piece);

 if (piece.toLowerCase() === "k") {
 if (from === "e1" && to === "g1") {
 setSquare(board, "h1", null);
 setSquare(board, "f1", "R");
 } else if (from === "e1" && to === "c1") {
 setSquare(board, "a1", null);
 setSquare(board, "d1", "R");
 } else if (from === "e8" && to === "g8") {
 setSquare(board, "h8", null);
 setSquare(board, "f8", "r");
 } else if (from === "e8" && to === "c8") {
 setSquare(board, "a8", null);
 setSquare(board, "d8", "r");
 }
 }

 return true;
}

function getFirstUserMoveInfo(fen, moves) {
 const preMove = moves[0];
 const userMove = moves[1];

 if (!preMove || !userMove) return null;

 const board = boardFromFen(fen);
 if (!board) return null;

 if (!applyUci(board, preMove)) return null;

 const from = userMove.slice(0, 2);
 const pieceChar = getSquare(board, from);
 const type = pieceChar ? pieceChar.toLowerCase() : "";

 return {
 userMove,
 pieceType: type,
 pieceKey: pieceKey[type] || "unknown",
 pieceName: pieceName[type] || "Unknown",
 };
}

function getLevelForMoves(moves) {
 const solutionLineLength = moves.length - 1;
 const userMoves = Math.ceil(solutionLineLength / 2);
 return {
 userMoves,
 level: userMoves >= 4 ? levels.find((x) => x.id === "m4") : levels.find((x) => x.distance === userMoves),
 };
}

function addUnique(list, key) {
 if (!themeByKey.has(key)) return;
 if (!list.includes(key)) list.push(key);
}

function getMatchingThemeKeys(set, info, solutionLine) {
 const keys = [];

 if (set.has("defensiveMove")) addUnique(keys, "defense");
 if (set.has("advancedPawn")) addUnique(keys, "advanced-pawn");
 if (set.has("quietMove")) addUnique(keys, "quiet-move");
 if (set.has("discoveredAttack")) addUnique(keys, "discovered-attack");
 if (set.has("discoveredCheck")) addUnique(keys, "discovered-check");
 if (set.has("doubleCheck")) addUnique(keys, "double-check");

 if (set.has("fork") && info?.pieceKey) addUnique(keys, `fork-${info.pieceKey}`);

 if (set.has("pin")) {
 if (["bishop", "rook", "queen"].includes(info?.pieceKey || "")) addUnique(keys, `pin-${info.pieceKey}`);
 else addUnique(keys, "pin-other");
 }

 if (set.has("skewer")) {
 if (["bishop", "rook", "queen"].includes(info?.pieceKey || "")) addUnique(keys, `skewer-${info.pieceKey}`);
 else addUnique(keys, "skewer-other");
 }

 if (set.has("xRayAttack")) {
 if (["bishop", "rook", "queen"].includes(info?.pieceKey || "")) addUnique(keys, `xray-${info.pieceKey}`);
 else addUnique(keys, "xray-other");
 }

 if (set.has("attraction") && set.has("deflection")) addUnique(keys, "decoy-deflection-combined");
 else if (set.has("attraction")) addUnique(keys, "decoy-attraction");
 else if (set.has("deflection")) addUnique(keys, "deflection");

 if (set.has("hangingPiece")) addUnique(keys, "hanging-piece");
 if (set.has("trappedPiece")) addUnique(keys, "trapped-piece");
 if (set.has("capturingDefender")) addUnique(keys, "remove-the-defender");
 if (set.has("exposedKing")) addUnique(keys, "vulnerable-king");
 if (set.has("kingsideAttack")) addUnique(keys, "kingside-attack");
 if (set.has("queensideAttack")) addUnique(keys, "queenside-attack");
 if (set.has("attackingF2F7")) addUnique(keys, "attacking-f2-f7");

 if (set.has("sacrifice") && info?.pieceKey) addUnique(keys, `sacrifice-${info.pieceKey}`);

 if (set.has("clearance") && set.has("sacrifice")) addUnique(keys, "clearance-sacrifice");
 else if (set.has("clearance")) addUnique(keys, "clearance");

 if (set.has("interference") && set.has("sacrifice")) addUnique(keys, "interference-sacrifice");
 else if (set.has("interference")) addUnique(keys, "interference");

 if (set.has("promotion")) addUnique(keys, "promotion");
 if (set.has("underPromotion")) addUnique(keys, "underpromotion");

 const hasKnightUnderpromotion = solutionLine.some((move) => move.length >= 5 && move[4].toLowerCase() === "n");
 if (set.has("underPromotion") && hasKnightUnderpromotion) addUnique(keys, "underpromotion-knight");

 if (set.has("enPassant")) addUnique(keys, "en-passant");
 if (set.has("zugzwang")) addUnique(keys, "zugzwang");
 if (set.has("intermezzo")) addUnique(keys, "zwischenzug");
 if (set.has("overloading")) addUnique(keys, "overloading");
 if (set.has("desperado")) addUnique(keys, "desperado");
 if (set.has("windmill")) addUnique(keys, "windmill");
 if (set.has("perpetualCheck")) addUnique(keys, "perpetual-check");
 if (set.has("stalemate")) addUnique(keys, "stalemate");

 return keys;
}

function makeOutputKey(themeKey, levelId) {
 return `${themeKey}__${levelId}`;
}

function getOrCreateOutput(outputs, themeKey, level) {
 const key = makeOutputKey(themeKey, level.id);
 if (outputs.has(key)) return outputs.get(key);

 const theme = themeByKey.get(themeKey);
 const folder = theme.slug;
 const dataBasePath = `/data/pattern-tactics/${folder}/${level.id}`;

 const output = {
 key,
 themeKey,
 theme,
 level,
 routePath: `/tactics/${level.id}/${theme.slug}`,
 dataBasePath,
 manifestPath: `${dataBasePath}/manifest.json`,
 progressKey: `tactic-${theme.key}-${level.id}`,
 puzzles: [],
 seen: new Set(),
 };

 outputs.set(key, output);
 return output;
}

function memoryCapForOutput(output) {
 return output.themeKey === "mixed" ? MAX_MIXED_PUZZLES : MAX_THEME_PUZZLES;
}

function puzzleDedupeKey(raw) {
 return `${raw.fen}|${raw.preMove}|${raw.solutionLine.join(" ")}`;
}

function storedPuzzleDedupeKey(puzzle) {
 return `${puzzle.fen}|${puzzle.preMove}|${puzzle.solutionLine.join(" ")}`;
}

function trimOutputIfNeeded(output, force = false) {
 const cap = memoryCapForOutput(output);
 const hardLimit = cap * 4;
 const keepLimit = force ? cap : cap * 2;

 if (!force && output.puzzles.length <= hardLimit && output.seen.size <= hardLimit * 2) {
 return;
 }

 const sorted = [...output.puzzles].sort(comparePuzzles);
 output.puzzles = takeEvenlySpaced(sorted, Math.min(keepLimit, sorted.length));

 output.seen = new Set(output.puzzles.map(storedPuzzleDedupeKey));
}

function addPuzzle(output, raw) {
 const dedupeKey = puzzleDedupeKey(raw);
 if (output.seen.has(dedupeKey)) return;

 output.seen.add(dedupeKey);
 output.puzzles.push({
 id: `${output.theme.key}-${output.level.id}-${raw.puzzleId || output.puzzles.length + 1}`,
 puzzleId: raw.puzzleId,
 fen: raw.fen,
 preMove: raw.preMove,
 solutionLine: raw.solutionLine,
 userMoveIndexes: raw.userMoveIndexes,
 tacticDistance: raw.userMoveIndexes.length,
 rating: raw.rating,
 label: `${output.theme.title} - ${output.level.title}`,
 theme: output.theme.key,
 sourceThemeKeys: raw.sourceThemeKeys,
 sourceThemes: raw.sourceThemes,
 themes: raw.themes,
 });

 trimOutputIfNeeded(output, false);
}

function comparePuzzles(a, b) {
 if ((a.rating || 0) !== (b.rating || 0)) return (a.rating || 0) - (b.rating || 0);
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

function writeJson(filePath, value) {
 fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

async function scanCsv() {
 const outputs = new Map();

 const rl = readline.createInterface({
 input: fs.createReadStream(CSV_PATH, "utf8"),
 crlfDelay: Infinity,
 });

 let headers = null;
 let idIndex = -1;
 let fenIndex = -1;
 let movesIndex = -1;
 let ratingIndex = -1;
 let themesIndex = -1;
 let scanned = 0;
 let used = 0;

 for await (const rawLine of rl) {
 scanned++;

 if (scanned % 500000 === 0) {
 console.log(`scanned ${scanned.toLocaleString()} rows, used ${used.toLocaleString()}`);
 }

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
 throw new Error("CSV must have PuzzleId, FEN, Moves, Rating, and Themes columns.");
 }

 continue;
 }

 const fen = String(cells[fenIndex] || "");
 const moves = String(cells[movesIndex] || "").trim().split(/\s+/).filter(Boolean);
 const themes = String(cells[themesIndex] || "").split(/\s+/).filter(Boolean);
 const set = new Set(themes);

 if (isMateTheme(themes, set)) continue;
 if (!hasRelevantTag(set)) continue;
 if (moves.length < 2) continue;

 const { userMoves, level } = getLevelForMoves(moves);
 if (!level) continue;

 const solutionLine = moves.slice(1);
 const userMoveIndexes = [];
 for (let i = 0; i < solutionLine.length; i += 2) {
 userMoveIndexes.push(i);
 }

 if (userMoveIndexes.length !== userMoves) continue;

 const info = getFirstUserMoveInfo(fen, moves);
 const matchingThemeKeys = getMatchingThemeKeys(set, info, solutionLine);

 if (matchingThemeKeys.length === 0) continue;

 used++;

 const puzzleBase = {
 puzzleId: idIndex >= 0 ? String(cells[idIndex] || "") : "",
 fen,
 preMove: moves[0],
 solutionLine,
 userMoveIndexes,
 rating: Number(cells[ratingIndex] || 0) || 0,
 themes,
 sourceThemeKeys: matchingThemeKeys,
 sourceThemes: matchingThemeKeys.map((key) => themeByKey.get(key)?.title || key),
 };

 for (const themeKey of matchingThemeKeys) {
 addPuzzle(getOrCreateOutput(outputs, themeKey, level), puzzleBase);
 }

 addPuzzle(getOrCreateOutput(outputs, "mixed", level), {
 ...puzzleBase,
 sourceThemeKeys: matchingThemeKeys,
 sourceThemes: matchingThemeKeys.map((key) => themeByKey.get(key)?.title || key),
 });
 }

 return outputs;
}

function writeData(outputs) {
 const base = path.join(ROOT, "public", "data", "pattern-tactics");
 fs.rmSync(base, { recursive: true, force: true });

 const generated = [];

 for (const output of outputs.values()) {
 trimOutputIfNeeded(output, true);

 const isMixed = output.themeKey === "mixed";
 const min = isMixed ? 1 : output.level.min;

 if (output.puzzles.length < min) continue;

 const max = isMixed ? MAX_MIXED_PUZZLES : MAX_THEME_PUZZLES;
 const selected = takeEvenlySpaced([...output.puzzles].sort(comparePuzzles), max).sort(comparePuzzles);

 const dataFolder = path.join(ROOT, "public", output.dataBasePath.replace(/^\//, ""));
 fs.mkdirSync(dataFolder, { recursive: true });

 const files = [];

 for (let i = 0; i < selected.length; i += CHUNK_SIZE) {
 const chunkNumber = Math.floor(i / CHUNK_SIZE) + 1;
 const band = selected.slice(i, i + CHUNK_SIZE);
 const shuffledBand = shuffle(band, `${output.key}-${chunkNumber}`);

 const chunk = shuffledBand.map((puzzle, chunkIndex) => ({
 ...puzzle,
 chunkNumber,
 chunkIndex,
 }));

 const fileName = `chunk-${String(chunkNumber).padStart(3, "0")}.json`;
 files.push(fileName);
 writeJson(path.join(dataFolder, fileName), chunk);
 }

 writeJson(path.join(dataFolder, "manifest.json"), {
 category: "tactics",
 theme: output.themeKey,
 totalPuzzles: selected.length,
 chunkSize: CHUNK_SIZE,
 totalChunks: files.length,
 files,
 note: `${output.theme.title} - ${output.level.title}`,
 });

 generated.push({
 ...output,
 totalPuzzles: selected.length,
 totalChunks: files.length,
 });

 console.log(`${output.theme.title} ${output.level.id}: ${selected.length} puzzles, ${files.length} chunks`);
 }

 return generated.sort((a, b) => {
 const ai = themeDefs.findIndex((x) => x.key === a.themeKey);
 const bi = themeDefs.findIndex((x) => x.key === b.themeKey);
 if (ai !== bi) return ai - bi;
 return a.level.id.localeCompare(b.level.id);
 });
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

function configKey(output) {
 return `${camelName(output.theme.key)}_${output.level.id}`.replace(/_m/, "M");
}

function backupFile(filePath, label) {
 if (!fs.existsSync(filePath)) return;
 fs.copyFileSync(filePath, `${filePath}.before_${label}_${Date.now()}.bak`);
}

function copyTacticTrainerFiles() {
 const sourceDir = path.join(ROOT, "src", "trainers", "patternMate");
 const targetDir = path.join(ROOT, "src", "trainers", "patternTactic");

 if (!fs.existsSync(sourceDir)) {
 throw new Error(`Missing source trainer folder: ${sourceDir}`);
 }

 fs.mkdirSync(targetDir, { recursive: true });

 for (const item of fs.readdirSync(sourceDir)) {
 const sourcePath = path.join(sourceDir, item);
 if (!fs.statSync(sourcePath).isFile()) continue;
 if (item === "pageConfigs.ts") continue;

 let targetName = item
 .replace(/PatternMate/g, "PatternTactic")
 .replace(/createPatternMate/g, "createPatternTactic");

 let content = fs.readFileSync(sourcePath, "utf8");

 content = content
 .replace(/PatternMate/g, "PatternTactic")
 .replace(/patternMate/g, "patternTactic")
 .replace(/pattern_mate/g, "pattern_tactic")
 .replace(/Find the mate/g, "Find the tactic")
 .replace(/Find mate/g, "Find tactic")
 .replace(/mate in/g, "tactic in")
 .replace(/Mate in/g, "Tactic in")
 .replace(/return 'mate'/g, "return 'tactic'")
 .replace(/category: 'mates'/g, "category: 'tactics'")
 .replace(/category: "mates"/g, 'category: "tactics"');

 fs.writeFileSync(path.join(targetDir, targetName), content, "utf8");
 }
}

function writePageConfigs(generated) {
 const targetDir = path.join(ROOT, "src", "trainers", "patternTactic");
 fs.mkdirSync(targetDir, { recursive: true });

 const entries = [];
 const routeEntries = [];

 for (const output of generated) {
 const key = configKey(output);
 entries.push(` ${key}: {
 title: "${output.theme.title} - ${output.level.title}",
 manifestPath: "${output.manifestPath}",
 dataBasePath: "${output.dataBasePath}",
 progressKey: "${output.progressKey}",
 trainerKey: "${output.progressKey}",
 },`);

 routeEntries.push(` "${output.level.id}/${output.theme.slug}": patternTacticPageConfigs.${key},`);
 }

 const content = `export const patternTacticPageConfigs = {
${entries.join("\n")}
}

export const patternTacticConfigByRoute = {
${routeEntries.join("\n")}
}

export type PatternTacticPageConfigKey = keyof typeof patternTacticPageConfigs
`;

 fs.writeFileSync(path.join(targetDir, "pageConfigs.ts"), content, "utf8");
}

function writeCatalog(generated) {
 const byTheme = new Map();

 for (const output of generated) {
 if (!byTheme.has(output.theme.key)) {
 byTheme.set(output.theme.key, {
 key: output.theme.key,
 title: output.theme.title,
 slug: output.theme.slug,
 distances: [],
 countByDistance: {},
 });
 }

 const item = byTheme.get(output.theme.key);
 item.distances.push(output.level.id);
 item.countByDistance[output.level.id] = output.totalPuzzles;
 }

 const ordered = themeDefs
 .map((theme) => byTheme.get(theme.key))
 .filter(Boolean);

 const content = `export type TacticDistanceId = "m1" | "m2" | "m3" | "m4"

export const tacticDistanceLabels: Record<TacticDistanceId, string> = {
 m1: "Tactic in 1",
 m2: "Tactic in 2",
 m3: "Tactic in 3",
 m4: "Tactic in 4+",
}

export const tacticThemeCatalog = ${JSON.stringify(ordered, null, 2)} as const
`;

 fs.writeFileSync(path.join(ROOT, "src", "tacticThemeCatalog.ts"), content + "\n", "utf8");
}

function writePages() {
 const tacticsPage = `import { Link } from "react-router-dom"
import { tacticDistanceLabels } from "./tacticThemeCatalog"

const levels = [
 { id: "m1", subtitle: "One move tactics" },
 { id: "m2", subtitle: "Two move tactics" },
 { id: "m3", subtitle: "Three move tactics" },
 { id: "m4", subtitle: "Four moves and longer" },
] as const

export default function TacticsPage() {
 return (
 <main style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
 <h1 style={{ marginBottom: 8 }}>Tactics</h1>
 <p style={{ opacity: 0.8, marginBottom: 24 }}>
 Train tactical themes by solution length. Puzzles are ordered easy to hard.
 </p>

 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
 {levels.map((level) => (
 <Link
 key={level.id}
 to={\`/tactics/\${level.id}\`}
 style={{
 textDecoration: "none",
 color: "inherit",
 border: "1px solid rgba(255,255,255,0.14)",
 borderRadius: 16,
 padding: 18,
 background: "rgba(255,255,255,0.06)",
 }}
 >
 <div style={{ fontSize: 22, fontWeight: 800 }}>{tacticDistanceLabels[level.id]}</div>
 <div style={{ marginTop: 8, opacity: 0.75 }}>{level.subtitle}</div>
 </Link>
 ))}
 </div>
 </main>
 )
}
`;

 const distancePage = `import { Link, useParams } from "react-router-dom"
import {
 tacticDistanceLabels,
 tacticThemeCatalog,
 type TacticDistanceId,
} from "./tacticThemeCatalog"

function isTacticDistanceId(value: string | undefined): value is TacticDistanceId {
 return value === "m1" || value === "m2" || value === "m3" || value === "m4"
}

export default function TacticDistancePage() {
 const params = useParams()
 const level = isTacticDistanceId(params.level) ? params.level : "m1"
 const title = tacticDistanceLabels[level]

 const themes = tacticThemeCatalog.filter((theme) =>
 theme.distances.includes(level)
 )

 return (
 <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
 <div style={{ marginBottom: 18 }}>
 <Link to="/tactics" style={{ color: "inherit", opacity: 0.75 }}>
 Back to Tactics
 </Link>
 </div>

 <h1 style={{ marginBottom: 8 }}>{title}</h1>
 <p style={{ opacity: 0.8, marginBottom: 24 }}>
 Choose a tactical motif. Each trainer is capped to keep the pool focused.
 </p>

 <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 14 }}>
 {themes.map((theme) => (
 <Link
 key={theme.key}
 to={\`/tactics/\${level}/\${theme.slug}\`}
 style={{
 textDecoration: "none",
 color: "inherit",
 border: "1px solid rgba(255,255,255,0.14)",
 borderRadius: 14,
 padding: 16,
 background: theme.key === "mixed"
 ? "linear-gradient(135deg, rgba(102, 187, 106, 0.22), rgba(79, 140, 255, 0.18))"
 : "rgba(255,255,255,0.06)",
 }}
 >
 <div style={{ fontSize: 18, fontWeight: 800 }}>{theme.title}</div>
 <div style={{ marginTop: 8, opacity: 0.72 }}>
 {theme.countByDistance[level] ?? 0} puzzles
 </div>
 </Link>
 ))}
 </div>
 </main>
 )
}
`;

 const routePage = `import { Link, useParams } from "react-router-dom"
import PatternTacticTrainer from "./trainers/patternTactic/PatternTacticTrainer"
import { patternTacticConfigByRoute } from "./trainers/patternTactic/pageConfigs"

export default function TacticTrainerRoutePage() {
 const params = useParams()
 const routeKey = \`\${params.level ?? ""}/\${params.theme ?? ""}\`
 const config = (patternTacticConfigByRoute as Record<string, any>)[routeKey]

 if (!config) {
 return (
 <main style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
 <h1>Tactic trainer not found</h1>
 <p>This tactic page does not exist or has too few puzzles.</p>
 <Link to="/tactics">Back to Tactics</Link>
 </main>
 )
 }

 return <PatternTacticTrainer config={config} />
}
`;

 backupFile(path.join(ROOT, "src", "TacticsPage.tsx"), "tactics_page");
 fs.writeFileSync(path.join(ROOT, "src", "TacticsPage.tsx"), tacticsPage, "utf8");
 fs.writeFileSync(path.join(ROOT, "src", "TacticDistancePage.tsx"), distancePage, "utf8");
 fs.writeFileSync(path.join(ROOT, "src", "TacticTrainerRoutePage.tsx"), routePage, "utf8");
}

function updateRouter() {
 const filePath = path.join(ROOT, "src", "AppRouter.tsx");
 let txt = fs.readFileSync(filePath, "utf8");
 const nl = txt.includes("\r\n") ? "\r\n" : "\n";

 const imports = [
 `import TacticsPage from "./TacticsPage"`,
 `import TacticDistancePage from "./TacticDistancePage"`,
 `import TacticTrainerRoutePage from "./TacticTrainerRoutePage"`,
 ];

 for (const importLine of imports) {
 if (!txt.includes(importLine)) {
 const importMatches = [...txt.matchAll(/^import[^\r\n]*(\r?\n)?/gm)];
 if (importMatches.length > 0) {
 const last = importMatches[importMatches.length - 1];
 txt = txt.slice(0, last.index + last[0].length) + importLine + nl + txt.slice(last.index + last[0].length);
 } else {
 txt = importLine + nl + txt;
 }
 }
 }

 txt = txt.replace(/\n\s*<Route\s+path="\/tactics[^"]*"\s+element=\{[^}]+\}\s*\/>/g, "");

 const routeClose = txt.match(/(\r?\n)([ \t]*)<\/Routes>/);
 if (!routeClose) {
 throw new Error("Could not find </Routes> in AppRouter.tsx");
 }

 const routeBlock = `${routeClose[1]}${routeClose[2]} <Route path="/tactics" element={<TacticsPage />} />${routeClose[1]}${routeClose[2]} <Route path="/tactics/:level" element={<TacticDistancePage />} />${routeClose[1]}${routeClose[2]} <Route path="/tactics/:level/:theme" element={<TacticTrainerRoutePage />} />`;

 txt = txt.slice(0, routeClose.index) + routeBlock + txt.slice(routeClose.index);

 backupFile(filePath, "tactics_routes");
 fs.writeFileSync(filePath, txt, "utf8");
}

async function main() {
 console.log("Scanning CSV and building tactic data...");
 const outputs = await scanCsv();

 console.log("Writing tactic chunks...");
 const generated = writeData(outputs);

 console.log(`Generated ${generated.length} tactic trainer routes.`);

 console.log("Creating tactic trainer files...");
 copyTacticTrainerFiles();

 console.log("Writing configs, catalog, and pages...");
 writePageConfigs(generated);
 writeCatalog(generated);
 writePages();
 updateRouter();

 fs.writeFileSync(
 path.join(ROOT, "tactics_generated_catalog.json"),
 JSON.stringify(
 generated.map((output) => ({
 title: output.theme.title,
 key: output.theme.key,
 level: output.level.id,
 routePath: output.routePath,
 totalPuzzles: output.totalPuzzles,
 totalChunks: output.totalChunks,
 })),
 null,
 2
 ) + "\n",
 "utf8"
 );

 console.log("Done. Wrote tactics_generated_catalog.json");
}

main().catch((error) => {
 console.error(error);
 process.exit(1);
});