import fs from "fs";
import path from "path";
import readline from "readline";
import { Chess } from "chess.js";

const root = process.cwd();

const CSV_PATH = path.join(root, "lichess_db_puzzle.csv");
const OUT_DIR = path.join(root, "public/data/endgames/stalemate");

const CHUNK_SIZE = 30;
const MAX_PER_THEME = 900;

const themes = {
  "stalemate-in-line": {
    name: "Stalemate resources",
    puzzles: [],
  },
  "underpromotion-stalemate": {
    name: "Underpromotion stalemate tricks",
    puzzles: [],
  },
};

function resetOut() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

function splitCsvLine(line) {
  const result = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === "," && !inQuotes) {
      result.push(cur);
      cur = "";
      continue;
    }

    cur += ch;
  }

  result.push(cur);
  return result;
}

function moveToObj(uci) {
  if (!uci || uci.length < 4) return null;

  return {
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.length > 4 ? uci.slice(4, 5) : undefined,
  };
}

function isStalemate(game) {
  if (typeof game.isStalemate === "function") return game.isStalemate();
  if (typeof game.inCheck === "function") {
    return game.moves().length === 0 && !game.inCheck();
  }
  return false;
}

function classifyPuzzle(fen, moves, tags) {
  const game = new Chess(fen);
  let stalemateAtEnd = false;
  let hasUnderpromotion = false;

  for (const uci of moves) {
    const obj = moveToObj(uci);
    if (!obj) return null;

    if (obj.promotion && obj.promotion !== "q") {
      hasUnderpromotion = true;
    }

    const move = game.move(obj);
    if (!move) return null;
  }

  stalemateAtEnd = isStalemate(game);

  if (!stalemateAtEnd) return null;

  if (hasUnderpromotion || tags.includes("underPromotion")) {
    return "underpromotion-stalemate";
  }

  return "stalemate-in-line";
}

function writeChunks() {
  const manifestChunks = [];

  for (const [themeId, theme] of Object.entries(themes)) {
    const limited = theme.puzzles.slice(0, MAX_PER_THEME);
    const dir = path.join(OUT_DIR, themeId);
    fs.mkdirSync(dir, { recursive: true });

    for (let i = 0; i < limited.length; i += CHUNK_SIZE) {
      const chunkNumber = Math.floor(i / CHUNK_SIZE) + 1;
      const chunk = limited.slice(i, i + CHUNK_SIZE);
      const file = `chunk_${String(chunkNumber).padStart(3, "0")}.json`;

      fs.writeFileSync(
        path.join(dir, file),
        JSON.stringify(
          {
            id: `${themeId}-${chunkNumber}`,
            theme: theme.name,
            puzzles: chunk,
          },
          null,
          2
        ),
        "utf8"
      );

      manifestChunks.push({
        id: `${themeId}-${chunkNumber}`,
        theme: theme.name,
        name: `${theme.name} ${chunkNumber}`,
        file: `${themeId}/${file}`,
        count: chunk.length,
      });
    }

    console.log(`${theme.name}: ${limited.length} positions`);
  }

  fs.writeFileSync(
    path.join(OUT_DIR, "manifest.json"),
    JSON.stringify(
      {
        title: "Stalemate Resources",
        chunkSize: CHUNK_SIZE,
        source: "lichess_db_puzzle.csv",
        chunks: manifestChunks,
      },
      null,
      2
    ),
    "utf8"
  );

  console.log("Total chunks:", manifestChunks.length);
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`CSV not found: ${CSV_PATH}`);
  }

  resetOut();

  const rl = readline.createInterface({
    input: fs.createReadStream(CSV_PATH),
    crlfDelay: Infinity,
  });

  let header = null;
  let count = 0;
  let kept = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;

    if (!header) {
      header = splitCsvLine(line);
      continue;
    }

    count++;

    if (count % 100000 === 0) {
      console.log("scanned", count, "kept", kept);
    }

    const cols = splitCsvLine(line);

    const row = {};
    for (let i = 0; i < header.length; i++) {
      row[header[i]] = cols[i] ?? "";
    }

    const puzzleId = row.PuzzleId;
    const fen = row.FEN;
    const moves = row.Moves?.trim().split(/\s+/).filter(Boolean) ?? [];
    const rating = Number(row.Rating || 0);
    const popularity = Number(row.Popularity || 0);
    const nbPlays = Number(row.NbPlays || 0);
    const tags = row.Themes || "";

    if (!fen || moves.length === 0) continue;

    let themeId = null;

    try {
      themeId = classifyPuzzle(fen, moves, tags);
    } catch {
      continue;
    }

    if (!themeId) continue;
    if (themes[themeId].puzzles.length >= MAX_PER_THEME) continue;

    themes[themeId].puzzles.push({
      id: `lichess-${puzzleId}`,
      lichessPuzzleId: puzzleId,
      fen,
      solution: moves[0],
      line: moves,
      rating,
      popularity,
      nbPlays,
      goal: "stalemate",
      theme: themes[themeId].name,
      instruction: "Find the move sequence that saves the game by stalemate.",
      lichessThemes: tags,
    });

    kept++;
  }

  writeChunks();

  console.log("DONE");
  console.log("Scanned:", count);
  console.log("Kept:", kept);
  console.log("Output:", OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});