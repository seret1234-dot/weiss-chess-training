import fs from "fs";
import path from "path";
import { Chess } from "chess.js";

const OUT = "public/data/endgames/fortress";
fs.mkdirSync(OUT, { recursive: true });

const themes = [
  "Queen vs rook-pawn fortress",
  "Queen vs bishop-pawn fortress",
  "Corner fortress",
  "Passive king fortress",
  "Mixed fortress"
];

const files = ["a", "h", "c", "f"];
const corners = {
  a: { bk: "a1", pawn: "a2" },
  h: { bk: "h1", pawn: "h2" },
  c: { bk: "c1", pawn: "c2" },
  f: { bk: "f1", pawn: "f2" },
};

const queenSquares = [
  "b3","c3","d3","e3","f3","g3",
  "b4","c4","d4","e4","f4","g4",
  "b5","c5","d5","e5","f5","g5"
];

const whiteKingSquares = [
  "a5","b5","c5","d5","e5","f5","g5","h5",
  "a6","b6","c6","d6","e6","f6","g6","h6",
  "a7","b7","c7","d7","e7","f7","g7","h7"
];

function emptyBoardFen(pieces, turn = "b") {
  const board = Array.from({ length: 8 }, () => Array(8).fill(""));
  const fileIndex = f => f.charCodeAt(0) - 97;

  for (const p of pieces) {
    const f = fileIndex(p.square[0]);
    const r = 8 - Number(p.square[1]);
    board[r][f] = p.piece;
  }

  const rows = board.map(row => {
    let s = "";
    let empty = 0;
    for (const cell of row) {
      if (!cell) empty++;
      else {
        if (empty) s += empty;
        empty = 0;
        s += cell;
      }
    }
    if (empty) s += empty;
    return s;
  });

  return `${rows.join("/")} ${turn} - - 0 1`;
}

function isLegalFen(fen) {
  try {
    const c = new Chess(fen);
    if (c.isCheck()) return false;
    if (c.isGameOver()) return false;
    return c.moves({ verbose: true }).length > 0;
  } catch {
    return false;
  }
}

const positions = [];
let id = 1;

for (const file of files) {
  const base = corners[file];

  for (const q of queenSquares) {
    for (const wk of whiteKingSquares) {
      const squares = new Set([base.bk, base.pawn, q, wk]);
      if (squares.size !== 4) continue;

      const fen = emptyBoardFen([
        { piece: "k", square: base.bk },
        { piece: "p", square: base.pawn },
        { piece: "Q", square: q },
        { piece: "K", square: wk },
      ]);

      if (!isLegalFen(fen)) continue;

      const chess = new Chess(fen);
      const legal = chess.moves({ verbose: true });

      const safeMoves = legal
        .filter(m => !m.san.includes("#"))
        .map(m => m.from + m.to + (m.promotion || ""));

      if (!safeMoves.length) continue;

      positions.push({
        id: `fortress_${String(id).padStart(4, "0")}`,
        fen,
        theme: themes[id % themes.length],
        goal: "Find the defensive move that keeps the fortress and holds the draw.",
        sideToMove: "black",
        bestMove: safeMoves[0],
        bestMoves: safeMoves.slice(0, 4),
      });

      id++;
    }
  }
}

const chunkSize = 30;
const chunks = [];

for (let i = 0; i < positions.length; i += chunkSize) {
  const chunk = positions.slice(i, i + chunkSize);
  const name = `chunk_${String(chunks.length + 1).padStart(3, "0")}.json`;
  fs.writeFileSync(path.join(OUT, name), JSON.stringify(chunk, null, 2));
  chunks.push({ file: name, count: chunk.length });
}

fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify({
  name: "Fortress",
  total: positions.length,
  chunkSize,
  chunks,
}, null, 2));

fs.writeFileSync(path.join(OUT, "progression.json"), JSON.stringify(chunks.map((c, i) => ({
  id: `fortress_${i + 1}`,
  title: `Fortress ${i + 1}`,
  file: c.file,
  count: c.count,
})), null, 2));

console.log(`DONE. Generated ${positions.length} fortress positions in ${chunks.length} chunks.`);
