import fs from "fs";
import path from "path";

const OUT = path.join(process.cwd(), "public/data/endgames/zugzwang");
const CHUNKS = path.join(OUT, "chunks");
fs.rmSync(CHUNKS, { recursive: true, force: true });
fs.mkdirSync(CHUNKS, { recursive: true });

const FILES = "abcdefgh";
const positions = [];

function boardFen(pieces) {
  const b = Array.from({ length: 8 }, () => Array(8).fill(""));
  for (const [sq, piece] of pieces) {
    const f = FILES.indexOf(sq[0]);
    const r = 8 - Number(sq[1]);
    b[r][f] = piece;
  }

  return b.map(row => {
    let out = "", empty = 0;
    for (const x of row) {
      if (!x) empty++;
      else {
        if (empty) out += empty;
        empty = 0;
        out += x;
      }
    }
    if (empty) out += empty;
    return out;
  }).join("/");
}

function fen(wk, wp, bk) {
  return `${boardFen([[wk, "K"], [wp, "P"], [bk, "k"]])} w - - 0 1`;
}

function sq(f, r) {
  return FILES[f] + r;
}

function dist(a, b) {
  return Math.max(
    Math.abs(FILES.indexOf(a[0]) - FILES.indexOf(b[0])),
    Math.abs(Number(a[1]) - Number(b[1]))
  );
}

function add(wk, wp, bk, move, label) {
  if (new Set([wk, wp, bk]).size < 3) return;
  if (dist(wk, bk) <= 1) return;

  positions.push({
    id: `zugzwang_${String(positions.length + 1).padStart(4, "0")}`,
    label,
    fen: fen(wk, wp, bk),
    startFen: fen(wk, wp, bk),
    allowedMoves: [move],
    solution: [move],
    theme: "KPK Zugzwang",
    result: "win",
    explanation: "Winning KPK: use opposition, then push the pawn at the right moment."
  });
}

// Strict obvious winning KPK:
// pawn files b-g only, king already in front/supporting.
// Avoid drawn locked positions like WK b5, WP b6, BK b7.

for (let f = 1; f <= 6; f++) {
  // Pattern A: pawn on 5th, white king controls 6th, black king too far.
  for (const side of [-1, 1]) {
    const wkf = f + side;
    if (wkf < 0 || wkf > 7) continue;

    const wp = sq(f, 5);
    const wk = sq(wkf, 6);

    for (let bkf = 0; bkf <= 7; bkf++) {
      for (const bkr of [7, 8]) {
        const bk = sq(bkf, bkr);
        if (dist(wk, bk) <= 1) continue;
        if (bk[0] === wp[0]) continue;

        add(wk, wp, bk, `${wp}${sq(f, 6)}`, "KPK Zugzwang — winning pawn push");
      }
    }
  }

  // Pattern B: pawn on 6th, white king on 6th/7th beside it, black king not in front.
  for (const side of [-1, 1]) {
    const wkf = f + side;
    if (wkf < 0 || wkf > 7) continue;

    const wp = sq(f, 6);

    for (const wkr of [6, 7]) {
      const wk = sq(wkf, wkr);

      for (let bkf = 0; bkf <= 7; bkf++) {
        for (const bkr of [7, 8]) {
          const bk = sq(bkf, bkr);
          if (dist(wk, bk) <= 1) continue;
          if (bk === sq(f, 7)) continue;
          if (bk === sq(f, 8)) continue;

          add(wk, wp, bk, `${wp}${sq(f, 7)}`, "KPK Zugzwang — push to 7th");
        }
      }
    }
  }

  // Pattern C: direct promotion.
  const wp = sq(f, 7);
  for (const side of [-1, 1]) {
    const wkf = f + side;
    if (wkf < 0 || wkf > 7) continue;

    const wk = sq(wkf, 7);

    for (let bkf = 0; bkf <= 7; bkf++) {
      const bk = sq(bkf, 8);
      if (bk === sq(f, 8)) continue;
      if (dist(wk, bk) <= 1) continue;

      add(wk, wp, bk, `${wp}${sq(f, 8)}q`, "KPK Zugzwang — promote");
    }
  }
}

const unique = [];
const seen = new Set();

for (const p of positions) {
  if (seen.has(p.startFen)) continue;
  seen.add(p.startFen);
  unique.push(p);
}

unique.sort(() => Math.random() - 0.5);

const chunkSize = 30;
const chunkFiles = [];

for (let i = 0; i < unique.length; i += chunkSize) {
  const chunk = unique.slice(i, i + chunkSize);
  const name = `chunk_${String(chunkFiles.length + 1).padStart(3, "0")}.json`;
  fs.writeFileSync(path.join(CHUNKS, name), JSON.stringify(chunk, null, 2));
  chunkFiles.push(name);
}

fs.writeFileSync(path.join(OUT, "progression.json"), JSON.stringify({
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
}, null, 2));

console.log(`DONE. Generated ${unique.length} strict positions in ${chunkFiles.length} chunks.`);
