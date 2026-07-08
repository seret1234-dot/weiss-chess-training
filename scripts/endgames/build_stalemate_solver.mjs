import fs from "fs";
import path from "path";
import { Chess } from "chess.js";

const root = process.cwd();
const outDir = path.join(root, "public/data/endgames/stalemate");

const CHUNK_SIZE = 30;
const MAX_DISTANCE = 1;
const MAX_POSITIONS_PER_DISTANCE = 30;
const MAX_TESTED_PER_THEME = 20000;

const files = "abcdefgh";
const ranks = "12345678";
const squares = [];

for (const f of files) {
  for (const r of ranks) squares.push(f + r);
}

const THEMES = [
  {
    id: "queen-sacrifice",
    name: "Queen sacrifice stalemate",
    defenderPiece: "q",
  },
  {
    id: "rook-sacrifice",
    name: "Rook sacrifice stalemate",
    defenderPiece: "r",
  },
];

function resetOutput() {
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
}

function kingsTouch(a, b) {
  const df = Math.abs(files.indexOf(a[0]) - files.indexOf(b[0]));
  const dr = Math.abs(ranks.indexOf(a[1]) - ranks.indexOf(b[1]));
  return Math.max(df, dr) <= 1;
}

function fenFromPieces(pieces, turn = "b") {
  const board = {};

  for (const p of pieces) {
    board[p.square] = p.piece;
  }

  const rows = [];

  for (let r = 7; r >= 0; r--) {
    let row = "";
    let empty = 0;

    for (let f = 0; f < 8; f++) {
      const sq = files[f] + ranks[r];
      const piece = board[sq];

      if (piece) {
        if (empty) row += empty;
        empty = 0;
        row += piece;
      } else {
        empty++;
      }
    }

    if (empty) row += empty;
    rows.push(row);
  }

  return `${rows.join("/")} ${turn} - - 0 1`;
}

function safeChess(fen) {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}

function inCheck(game) {
  if (typeof game.inCheck === "function") return game.inCheck();
  if (typeof game.isCheck === "function") return game.isCheck();
  return false;
}

function isStalemate(game) {
  if (typeof game.isStalemate === "function") return game.isStalemate();
  return game.moves().length === 0 && !inCheck(game);
}

function moveToUci(move) {
  return `${move.from}${move.to}${move.promotion || ""}`;
}

function normalizeFenKey(fen) {
  return fen.split(" ").slice(0, 4).join(" ");
}

function sideNotToMoveNotInCheck(fen) {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) return false;

  const flippedTurn = parts[1] === "w" ? "b" : "w";
  const flippedFen = `${parts[0]} ${flippedTurn} ${parts[2]} ${parts[3]} 0 1`;

  const flipped = safeChess(flippedFen);
  if (!flipped) return false;

  return !inCheck(flipped);
}

function legalPuzzleFen(fen) {
  const game = safeChess(fen);
  if (!game) return false;

  if (inCheck(game)) return false;
  if (!sideNotToMoveNotInCheck(fen)) return false;

  return true;
}

function isSacrificeMove(fen, uci, expectedPiece) {
  const game = new Chess(fen);

  const move = game.move({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    promotion: uci.slice(4, 5) || undefined,
  });

  if (!move) return false;
  if (move.piece !== expectedPiece) return false;
  if (!move.captured) return false;

  return true;
}

function makePuzzle(theme, fen, solution, san, idNumber) {
  return {
    id: `${theme.id}-d1-${String(idNumber).padStart(5, "0")}`,
    fen,
    solution,
    line: [solution],
    san,
    distance: 1,
    goal: "stalemate",
    theme: theme.name,
    instruction: "Black to move. Force stalemate in 1.",
  };
}

function* streamCandidates(theme) {
  const defenderPiece = theme.defenderPiece;

  const edgeSquares = squares.filter((sq) => {
    const file = sq[0];
    const rank = sq[1];
    return file === "a" || file === "h" || rank === "1" || rank === "8";
  });

  for (const wk of edgeSquares) {
    for (const bk of edgeSquares) {
      if (wk === bk || kingsTouch(wk, bk)) continue;

      for (const pieceSq of squares) {
        if (pieceSq === wk || pieceSq === bk) continue;

        for (const whiteQueenSq of edgeSquares) {
          if (
            whiteQueenSq === wk ||
            whiteQueenSq === bk ||
            whiteQueenSq === pieceSq
          ) {
            continue;
          }

          const fen = fenFromPieces(
            [
              { square: wk, piece: "K" },
              { square: bk, piece: "k" },
              { square: pieceSq, piece: defenderPiece },
              { square: whiteQueenSq, piece: "Q" },
            ],
            "b"
          );

          yield fen;
        }
      }
    }
  }
}

function findStalemateInOne(theme, fen) {
  const game = safeChess(fen);
  if (!game) return null;

  const moves = game.moves({ verbose: true });

  for (const move of moves) {
    if (move.piece !== theme.defenderPiece) continue;

    const uci = moveToUci(move);

    if (!isSacrificeMove(fen, uci, theme.defenderPiece)) continue;

    const test = new Chess(fen);

    test.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion || "q",
    });

    if (isStalemate(test)) {
      return {
        solution: uci,
        san: move.san,
      };
    }
  }

  return null;
}

function writeChunks(buckets) {
  const manifestChunks = [];

  for (const theme of THEMES) {
    const puzzles = buckets[theme.id][1];

    for (let i = 0; i < puzzles.length; i += CHUNK_SIZE) {
      const chunkNumber = Math.floor(i / CHUNK_SIZE) + 1;
      const chunk = puzzles.slice(i, i + CHUNK_SIZE);

      const dir = path.join(outDir, theme.id, "distance_1");
      fs.mkdirSync(dir, { recursive: true });

      const fileName = `chunk_${String(chunkNumber).padStart(3, "0")}.json`;
      const relFile = `${theme.id}/distance_1/${fileName}`;

      fs.writeFileSync(
        path.join(dir, fileName),
        JSON.stringify(
          {
            id: `${theme.id}-d1-${chunkNumber}`,
            theme: theme.name,
            distance: 1,
            puzzles: chunk,
          },
          null,
          2
        ),
        "utf8"
      );

      manifestChunks.push({
        id: `${theme.id}-d1-${chunkNumber}`,
        theme: theme.name,
        distance: 1,
        name: `${theme.name} — Stalemate in 1`,
        file: relFile,
        count: chunk.length,
      });
    }
  }

  fs.writeFileSync(
    path.join(outDir, "manifest.json"),
    JSON.stringify(
      {
        title: "Stalemate Resources",
        chunkSize: CHUNK_SIZE,
        maxDistance: MAX_DISTANCE,
        chunks: manifestChunks,
      },
      null,
      2
    ),
    "utf8"
  );

  return manifestChunks;
}

console.log("BUILDING FAST STALEMATE-IN-1 DATA...");
resetOutput();

const buckets = {};
const seen = new Set();

for (const theme of THEMES) {
  console.log("Theme:", theme.name);

  buckets[theme.id] = { 1: [] };

  let tested = 0;
  let idNumber = 1;

  for (const fen of streamCandidates(theme)) {
    tested++;

    if (tested % 500 === 0) {
      console.log(
        " tested",
        tested,
        "| found",
        buckets[theme.id][1].length
      );
    }

    if (tested > MAX_TESTED_PER_THEME) break;
    if (buckets[theme.id][1].length >= MAX_POSITIONS_PER_DISTANCE) break;

    if (!legalPuzzleFen(fen)) continue;

    const found = findStalemateInOne(theme, fen);
    if (!found) continue;

    const key = `${theme.id}|${normalizeFenKey(fen)}|${found.solution}`;
    if (seen.has(key)) continue;
    seen.add(key);

    buckets[theme.id][1].push(
      makePuzzle(theme, fen, found.solution, found.san, idNumber)
    );

    idNumber++;
  }

  console.log("Finished theme:", theme.name);
  console.log("Tested:", tested);
  console.log(" distance 1:", buckets[theme.id][1].length);
}

const manifestChunks = writeChunks(buckets);

console.log("DONE");
console.log("Total chunks:", manifestChunks.length);
console.log("Output:", outDir);