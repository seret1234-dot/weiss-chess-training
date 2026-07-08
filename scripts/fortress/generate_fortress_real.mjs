import fs from "fs";
import path from "path";
import { Chess } from "chess.js";

const OUT = "public/data/endgames/fortress";
const CHUNKS = path.join(OUT, "chunks");
fs.mkdirSync(CHUNKS, { recursive: true });

function isLegal(fen) {
  try {
    const c = new Chess(fen);
    return !c.isCheck() && !c.isGameOver() && c.moves().length > 0;
  } catch {
    return false;
  }
}

function makeFen({ wk, wq, bk, bp, turn = "b" }) {
  const board = Array.from({ length: 8 }, () => Array(8).fill(""));
  const put = (sq, p) => {
    const f = sq.charCodeAt(0) - 97;
    const r = 8 - Number(sq[1]);
    board[r][f] = p;
  };

  put(wk, "K");
  put(wq, "Q");
  put(bk, "k");
  put(bp, "p");

  const rows = board.map(row => {
    let out = "";
    let n = 0;
    for (const x of row) {
      if (!x) n++;
      else {
        if (n) out += n;
        n = 0;
        out += x;
      }
    }
    if (n) out += n;
    return out;
  });

  return `${rows.join("/")} ${turn} - - 0 1`;
}

const motifs = [
  { name: "Rook-pawn corner fortress", bk: "a1", bp: "a2", safe: ["a1b1", "a1b2"] },
  { name: "Rook-pawn corner fortress", bk: "h1", bp: "h2", safe: ["h1g1", "h1g2"] },
  { name: "Rook-pawn corner fortress", bk: "a8", bp: "a7", safe: ["a8b8", "a8b7"] },
  { name: "Rook-pawn corner fortress", bk: "h8", bp: "h7", safe: ["h8g8", "h8g7"] },
];

const queenSquares = [
  "c1","d1","e1","f1",
  "c2","d2","e2","f2",
  "c3","d3","e3","f3",
  "c4","d4","e4","f4",
  "b5","c5","d5","e5","f5","g5",
];

const kingSquares = [
  "a4","b4","c4","d4","e4","f4","g4","h4",
  "a5","b5","c5","d5","e5","f5","g5","h5",
  "a6","b6","c6","d6","e6","f6","g6","h6",
  "a7","b7","c7","d7","e7","f7","g7","h7",
];

function legalUci(fen) {
  const c = new Chess(fen);
  return c.moves({ verbose: true }).map(m => `${m.from}${m.to}${m.promotion || ""}`);
}

const positions = [];
let id = 1;

for (const motif of motifs) {
  for (const wq of queenSquares) {
    for (const wk of kingSquares) {
      const used = new Set([wk, wq, motif.bk, motif.bp]);
      if (used.size !== 4) continue;

      const fen = makeFen({ wk, wq, bk: motif.bk, bp: motif.bp, turn: "b" });
      if (!isLegal(fen)) continue;

      const legal = legalUci(fen);
      const bestMoves = motif.safe.filter(m => legal.includes(m));

      if (!bestMoves.length) continue;

      positions.push({
        id: `fortress_${String(id).padStart(4, "0")}`,
        fen,
        theme: motif.name,
        label: `${motif.name} #${id}`,
        sideToMove: "black",
        result: "draw",
        goal: "Hold the draw. Keep the king close to the rook pawn and do not abandon the fortress.",
        allowedMoves: bestMoves,
        bestMoves,
        explanation: "This is a queen vs rook-pawn fortress. The defender draws by staying near the pawn and not letting the king be driven away."
      });

      id++;
    }
  }
}

const chunkSize = 30;
const chunks = [];

for (let i = 0; i < positions.length; i += chunkSize) {
  const chunk = positions.slice(i, i + chunkSize);
  const file = `chunk_${String(chunks.length + 1).padStart(3, "0")}.json`;
  fs.writeFileSync(path.join(CHUNKS, file), JSON.stringify(chunk, null, 2));
  chunks.push(file);
}

const progression = {
  order: ["queen_rook_pawn_fortress"],
  themes: {
    queen_rook_pawn_fortress: {
      label: "Queen vs rook-pawn fortress",
      chunkFiles: chunks,
      mode: "convert",
      goal: "draw"
    }
  },
  maxSecondsPerMove: 3,
  masteryFastSolves: 5
};

fs.writeFileSync(path.join(OUT, "progression.json"), JSON.stringify(progression, null, 2));

console.log(`DONE. Generated ${positions.length} fortress positions in ${chunks.length} chunks.`);
console.log(`Output: ${OUT}`);
