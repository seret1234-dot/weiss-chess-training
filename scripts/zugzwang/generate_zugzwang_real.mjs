import fs from "fs";
import path from "path";
import { Chess } from "chess.js";

const OUT = path.join(process.cwd(), "public/data/endgames/zugzwang");
const CHUNKS = path.join(OUT, "chunks");
fs.mkdirSync(CHUNKS, { recursive: true });

const FILES = "abcdefgh";
const positions = [];

function fen(wk, wp, bk, turn = "w") {
  return `8/8/8/8/8/8/8/8 ${turn} - - 0 1`
    .replace("8/8/8/8/8/8/8/8", board(wk, wp, bk));
}

function board(wk, wp, bk) {
  const b = Array.from({ length: 8 }, () => Array(8).fill("1"));
  for (const [sq, p] of [[wk, "K"], [wp, "P"], [bk, "k"]]) {
    const f = FILES.indexOf(sq[0]);
    const r = 8 - Number(sq[1]);
    b[r][f] = p;
  }
  return b.map(row => {
    let out = "", n = 0;
    for (const x of row) {
      if (x === "1") n++;
      else {
        if (n) out += n;
        n = 0;
        out += x;
      }
    }
    if (n) out += n;
    return out;
  }).join("/");
}

function sq(file, rank) {
  return FILES[file] + rank;
}

function legalFen(f) {
  try {
    const g = new Chess(f);
    const wk = find(g, "k", "w");
    const bk = find(g, "k", "b");
    if (!wk || !bk) return false;
    const dx = Math.abs(FILES.indexOf(wk[0]) - FILES.indexOf(bk[0]));
    const dy = Math.abs(Number(wk[1]) - Number(bk[1]));
    return Math.max(dx, dy) > 1 && g.moves().length > 0;
  } catch {
    return false;
  }
}

function find(g, type, color) {
  const brd = g.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = brd[r][f];
      if (p?.type === type && p.color === color) return FILES[f] + (8 - r);
    }
  }
  return null;
}

function isPawnPush(g, uci) {
  const p = g.get(uci.slice(0, 2));
  return p?.type === "p" && uci[0] === uci[2] && Number(uci[3]) > Number(uci[1]);
}

function oppositionWinCandidate(g, move) {
  const n = new Chess(g.fen());
  n.move({ from: move.from, to: move.to, promotion: move.promotion || "q" });

  const wk = find(n, "k", "w");
  const wp = find(n, "p", "w");
  const bk = find(n, "k", "b");
  if (!wk || !wp || !bk) return false;

  const pawnFile = wp[0];
  const pawnRank = Number(wp[1]);

  if (pawnRank >= 7) return true;

  const wkFile = FILES.indexOf(wk[0]);
  const bkFile = FILES.indexOf(bk[0]);
  const wpFile = FILES.indexOf(pawnFile);

  const whiteInFront = Number(wk[1]) > pawnRank;
  const kingSupportsPawn = Math.abs(wkFile - wpFile) <= 1;
  const blackInFront = bkFile === wpFile && Number(bk[1]) > pawnRank;

  return whiteInFront && kingSupportsPawn && !blackInFront;
}

for (let pf = 0; pf < 8; pf++) {
  for (let pr = 2; pr <= 6; pr++) {
    const wp = sq(pf, pr);

    for (let wkf = Math.max(0, pf - 1); wkf <= Math.min(7, pf + 1); wkf++) {
      for (let wkr = pr + 1; wkr <= Math.min(7, pr + 2); wkr++) {
        const wk = sq(wkf, wkr);

        for (let bkf = Math.max(0, pf - 1); bkf <= Math.min(7, pf + 1); bkf++) {
          for (let bkr = pr + 2; bkr <= 8; bkr++) {
            const bk = sq(bkf, bkr);
            if (new Set([wk, wp, bk]).size < 3) continue;

            const f = fen(wk, wp, bk);
            if (!legalFen(f)) continue;

            const g = new Chess(f);
            const moves = g.moves({ verbose: true });

            const good = moves.filter(m => {
              const uci = `${m.from}${m.to}${m.promotion ?? ""}`;
              return isPawnPush(g, uci) || oppositionWinCandidate(g, m);
            });

            if (good.length === 0 || good.length > 2) continue;

            positions.push({
              id: `zugzwang_${String(positions.length + 1).padStart(4, "0")}`,
              label: `KPK Zugzwang #${positions.length + 1}`,
              fen: f,
              startFen: f,
              allowedMoves: good.map(m => `${m.from}${m.to}${m.promotion ?? ""}`),
              solution: good.map(m => `${m.from}${m.to}${m.promotion ?? ""}`),
              theme: "zugzwang",
              result: "win",
              explanation: "Use opposition or pawn timing. Avoid useless king shuffling."
            });
          }
        }
      }
    }
  }
}

positions.sort(() => Math.random() - 0.5);

const chunkSize = 30;
const chunkFiles = [];

for (let i = 0; i < positions.length; i += chunkSize) {
  const chunk = positions.slice(i, i + chunkSize);
  const name = `chunk_${String(chunkFiles.length + 1).padStart(3, "0")}.json`;
  fs.writeFileSync(path.join(CHUNKS, name), JSON.stringify(chunk, null, 2));
  chunkFiles.push(name);
}

const progression = {
  order: ["zugzwang"],
  masteryFastSolves: 5,
  maxSecondsPerMove: 3,
  chunkSize,
  themes: {
    zugzwang: {
      id: "zugzwang",
      label: "KPK Zugzwang",
      chunkFiles,
      mode: "convert"
    }
  }
};

fs.writeFileSync(path.join(OUT, "progression.json"), JSON.stringify(progression, null, 2));

console.log(`DONE. Generated ${positions.length} positions in ${chunkFiles.length} chunks.`);
