import fs from "fs";
import path from "path";
import { Chess } from "chess.js";

const OUT = "public/data/endgames/shouldering";
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

const files = "abcdefgh";
const ranks = "12345678";

function sq(f, r) {
  return files[f] + ranks[r];
}

function dist(a, b) {
  const af = files.indexOf(a[0]);
  const ar = ranks.indexOf(a[1]);
  const bf = files.indexOf(b[0]);
  const br = ranks.indexOf(b[1]);
  return Math.max(Math.abs(af - bf), Math.abs(ar - br));
}

function kingsFar(a, b) {
  return dist(a, b) > 1;
}

function makeBoard(wk, bk, wp) {
  const board = Array.from({ length: 8 }, () => Array(8).fill("1"));

  function put(piece, square) {
    const f = files.indexOf(square[0]);
    const r = ranks.indexOf(square[1]);
    board[7 - r][f] = piece;
  }

  put("K", wk);
  put("k", bk);
  put("P", wp);

  return board.map(row => {
    let out = "";
    let empty = 0;
    for (const c of row) {
      if (c === "1") empty++;
      else {
        if (empty) out += empty;
        empty = 0;
        out += c;
      }
    }
    if (empty) out += empty;
    return out;
  }).join("/");
}

function chooseShoulderingMove(fen, pawnSq, blackKingSq) {
  const game = new Chess(fen);
  const moves = game.moves({ verbose: true });

  const kingMoves = moves.filter(m => m.piece === "k");

  let best = null;
  let bestScore = -9999;

  for (const m of kingMoves) {
    const to = m.to;

    const score =
      20 - dist(to, blackKingSq) +
      8 - Math.abs(files.indexOf(to[0]) - files.indexOf(pawnSq[0])) +
      4 - Math.abs(ranks.indexOf(to[1]) - ranks.indexOf(blackKingSq[1]));

    if (score > bestScore) {
      bestScore = score;
      best = `${m.from}${m.to}${m.promotion ?? ""}`;
    }
  }

  return best;
}

const positions = [];

for (let pf = 1; pf <= 6; pf++) {
  for (let pr = 2; pr <= 4; pr++) {
    const pawn = sq(pf, pr);

    for (const side of [-1, 1]) {
      const wkf = Math.max(0, Math.min(7, pf + side));
      const bkf = Math.max(0, Math.min(7, pf - side * 2));

      for (let wkr = pr + 1; wkr <= Math.min(6, pr + 2); wkr++) {
        for (let bkr = pr + 2; bkr <= Math.min(7, pr + 3); bkr++) {
          const wk = sq(wkf, wkr);
          const bk = sq(bkf, bkr);

          if (!kingsFar(wk, bk)) continue;
          if (wk === pawn || bk === pawn) continue;

          const fenBoard = makeBoard(wk, bk, pawn);
          const fen = `${fenBoard} w - - 0 1`;

          let bestMove = null;
          try {
            bestMove = chooseShoulderingMove(fen, pawn, bk);
          } catch {
            continue;
          }

          if (!bestMove) continue;

          positions.push({
            id: `shouldering_${String(positions.length + 1).padStart(4, "0")}`,
            fen,
            sideToMove: "w",
            theme: "Shouldering",
            goal: "Use your king to shoulder the enemy king away.",
            allowedMoves: [bestMove],
            solution: [bestMove],
            bestmove_uci: bestMove
          });
        }
      }
    }
  }
}

const CHUNK_SIZE = 30;
const chunks = [];

for (let i = 0; i < positions.length; i += CHUNK_SIZE) {
  const chunk = positions.slice(i, i + CHUNK_SIZE);
  const fileName = `chunk_${String(chunks.length + 1).padStart(3, "0")}.json`;

  fs.writeFileSync(path.join(OUT, fileName), JSON.stringify(chunk, null, 2));

  chunks.push({
    id: chunks.length + 1,
    file: fileName,
    count: chunk.length
  });
}

fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify({
  id: "shouldering",
  title: "Shouldering",
  description: "King shouldering technique positions.",
  chunks
}, null, 2));

fs.writeFileSync(path.join(OUT, "progression.json"), JSON.stringify({
  order: ["shouldering"],
  themes: {
    shouldering: {
      id: "shouldering",
      title: "Shouldering",
      chunks: chunks.map(c => c.file)
    }
  }
}, null, 2));

console.log(`DONE. Generated ${positions.length} shouldering positions in ${chunks.length} chunks.`);
