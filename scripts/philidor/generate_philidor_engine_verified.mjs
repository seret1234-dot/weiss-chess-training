import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "public", "data", "endgames", "philidor");
const CHUNK_DIR = path.join(OUT_DIR, "chunks");
fs.mkdirSync(CHUNK_DIR, { recursive: true });

const STOCKFISH_CANDIDATES = [
  path.join(ROOT, "C:\\Users\\Ariel\\chess-trainer\\stockfish-windows-x86-64-avx2\\stockfish\\stockfish-windows-x86-64-avx2.exe", "stockfish-windows-x86-64-avx2.exe"),
  path.join(ROOT, "C:\\Users\\Ariel\\chess-trainer\\stockfish-windows-x86-64-avx2\\stockfish\\stockfish-windows-x86-64-avx2.exe", "stockfish.exe"),
  path.join(ROOT, "public", "C:\\Users\\Ariel\\chess-trainer\\stockfish-windows-x86-64-avx2\\stockfish\\stockfish-windows-x86-64-avx2.exe", "stockfish-windows-x86-64-avx2.exe"),
  path.join(ROOT, "public", "C:\\Users\\Ariel\\chess-trainer\\stockfish-windows-x86-64-avx2\\stockfish\\stockfish-windows-x86-64-avx2.exe", "stockfish.exe"),
  "C:\\Users\\Ariel\\chess-trainer\\stockfish-windows-x86-64-avx2\\stockfish\\stockfish-windows-x86-64-avx2.exe",
];

function findStockfish() {
  for (const p of STOCKFISH_CANDIDATES) {
    if (p === "C:\\Users\\Ariel\\chess-trainer\\stockfish-windows-x86-64-avx2\\stockfish\\stockfish-windows-x86-64-avx2.exe") return p;
    if (fs.existsSync(p)) return p;
  }
  return "C:\\Users\\Ariel\\chess-trainer\\stockfish-windows-x86-64-avx2\\stockfish\\stockfish-windows-x86-64-avx2.exe";
}

class Engine {
  constructor() {
    this.proc = spawn(findStockfish());
    this.queue = [];
    this.buffer = "";
    this.proc.stdout.on("data", (d) => {
      this.buffer += d.toString();
      this.flush();
    });
    this.proc.stderr.on("data", (d) => process.stderr.write(d.toString()));
    this.send("uci");
    this.send("isready");
  }

  send(x) {
    this.proc.stdin.write(x + "\n");
  }

  flush() {
    const waiter = this.queue[0];
    if (!waiter) return;
    if (this.buffer.includes(waiter.until)) {
      const text = this.buffer;
      this.buffer = "";
      this.queue.shift();
      waiter.resolve(text);
    }
  }

  wait(until) {
    return new Promise((resolve) => {
      this.queue.push({ until, resolve });
      this.flush();
    });
  }

  async analyse(fen, depth = 12) {
    this.buffer = "";
    this.send("ucinewgame");
    this.send("position fen " + fen);
    this.send("go depth " + depth);
    const out = await this.wait("bestmove");

    const best = out.match(/bestmove\s+(\S+)/)?.[1] ?? null;
    const scores = [...out.matchAll(/score\s+(cp|mate)\s+(-?\d+)/g)];
    const last = scores.at(-1);

    let cp = null;
    let mate = null;

    if (last) {
      if (last[1] === "cp") cp = Number(last[2]);
      if (last[1] === "mate") mate = Number(last[2]);
    }

    return { best, cp, mate, raw: out };
  }

  quit() {
    this.send("quit");
  }
}

function fenFromPieces(pieces, side = "b") {
  const board = Array.from({ length: 8 }, () => Array(8).fill(""));
  for (const [sq, piece] of Object.entries(pieces)) {
    const file = sq.charCodeAt(0) - 97;
    const rank = 8 - Number(sq[1]);
    board[rank][file] = piece;
  }

  const rows = board.map((row) => {
    let out = "";
    let empty = 0;
    for (const p of row) {
      if (!p) empty++;
      else {
        if (empty) out += empty;
        empty = 0;
        out += p;
      }
    }
    if (empty) out += empty;
    return out;
  });

  return `${rows.join("/")} ${side} - - 0 1`;
}

function sq(file, rank) {
  return "abcdefgh"[file] + String(rank);
}

function kingDist(a, b) {
  const af = a.charCodeAt(0) - 97;
  const ar = Number(a[1]);
  const bf = b.charCodeAt(0) - 97;
  const br = Number(b[1]);
  return Math.max(Math.abs(af - bf), Math.abs(ar - br));
}

function illegalKings(wk, bk) {
  return kingDist(wk, bk) <= 1;
}

function makeCandidates() {
  const out = [];

  for (let file = 1; file <= 6; file++) {
    const pawnFile = "abcdefgh"[file];

    for (const pawnRank of [5, 6]) {
      const wp = `${pawnFile}${pawnRank}`;
      const wk = `${pawnFile}${pawnRank + 1}`;
      const bk = `${pawnFile}8`;

      if (illegalKings(wk, bk)) continue;

      for (const brFile of [0, 7]) {
        for (const brRank of [1, 2, 3, 4, 5]) {
          const br = sq(brFile, brRank);
          if ([wk, wp, bk].includes(br)) continue;

          for (const wrFile of [0, 7]) {
            for (const wrRank of [4, 5, 6, 7]) {
              const wr = sq(wrFile, wrRank);
              if ([wk, wp, bk, br].includes(wr)) continue;

              out.push({
                wk,
                wr,
                wp,
                bk,
                br,
                fen: fenFromPieces({ [wk]: "K", [wr]: "R", [wp]: "P", [bk]: "k", [br]: "r" }, "b"),
              });
            }
          }
        }
      }
    }
  }

  return out;
}

function isDrawish(info) {
  if (info.mate !== null) return false;
  if (info.cp === null) return false;
  return Math.abs(info.cp) <= 120;
}

function isBadForWhite(info) {
  if (info.mate !== null) return true;
  if (info.cp === null) return false;
  return info.cp < -250;
}

const engine = new Engine();

console.log("Stockfish:", findStockfish());
console.log("Generating Philidor candidates...");

const candidates = makeCandidates();
console.log("Candidates:", candidates.length);

const kept = [];

for (let i = 0; i < candidates.length; i++) {
  const c = candidates[i];

  if (i % 20 === 0) {
    console.log(`checking ${i}/${candidates.length} | kept ${kept.length}`);
  }

  const before = await engine.analyse(c.fen, 12);
  if (!isDrawish(before)) continue;
  if (!before.best || before.best === "(none)") continue;

  kept.push({
    id: `philidor_engine_${String(kept.length + 1).padStart(3, "0")}`,
    fen: c.fen,
    allowedMoves: [before.best],
    bestmove_uci: before.best,
    result: "draw",
    theme: "philidor_basics",
    label: "Philidor defensive position",
    explanation: `Engine-verified Philidor defense. Best defensive move: ${before.best}`,
    evalCp: before.cp,
  });

  if (kept.length >= 30) break;
}

engine.quit();

if (kept.length === 0) {
  throw new Error("No engine-verified Philidor positions found.");
}

fs.writeFileSync(
  path.join(CHUNK_DIR, "chunk_1.json"),
  JSON.stringify(
    {
      chunkName: "Philidor Engine Verified",
      description: "Engine-verified Philidor rook endgame defensive positions.",
      positions: kept,
    },
    null,
    2,
  ),
);

fs.writeFileSync(
  path.join(OUT_DIR, "progression.json"),
  JSON.stringify(
    {
      name: "Philidor",
      order: ["philidor_basics"],
      themes: {
        philidor_basics: {
          label: "Philidor Basics",
          chunks: ["chunk_1.json"],
          mode: "convert",
          goal: "hold_draw",
          maxSecondsPerMove: 3,
        },
      },
    },
    null,
    2,
  ),
);

console.log("DONE");
console.log("Kept:", kept.length);
console.log(path.join(CHUNK_DIR, "chunk_1.json"));
console.log(path.join(OUT_DIR, "progression.json"));

