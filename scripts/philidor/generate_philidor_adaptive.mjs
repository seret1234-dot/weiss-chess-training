import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const ROOT = process.cwd();
const STOCKFISH = "C:\\Users\\Ariel\\chess-trainer\\stockfish-windows-x86-64-avx2\\stockfish\\stockfish-windows-x86-64-avx2.exe";

const OUT_DIR = path.join(ROOT, "public", "data", "endgames", "philidor");
const CHUNK_DIR = path.join(OUT_DIR, "chunks");

fs.rmSync(CHUNK_DIR, { recursive: true, force: true });
fs.mkdirSync(CHUNK_DIR, { recursive: true });

const THEMES = [
  { id: "basic_philidor", label: "Basic Philidor" },
  { id: "checking_distance", label: "Checking Distance" },
];

const TARGET_PER_THEME = 60;
const CHUNK_SIZE = 30;

class Engine {
  constructor() {
    this.proc = spawn(STOCKFISH);
    this.queue = [];
    this.buffer = "";

    this.proc.stdout.on("data", d => {
      this.buffer += d.toString();
      this.flush();
    });

    this.send("uci");
    this.send("isready");
  }

  send(x) {
    this.proc.stdin.write(x + "\n");
  }

  wait(until) {
    return new Promise(resolve => {
      this.queue.push({ until, resolve });
      this.flush();
    });
  }

  flush() {
    const w = this.queue[0];
    if (!w) return;

    if (this.buffer.includes(w.until)) {
      const txt = this.buffer;
      this.buffer = "";
      this.queue.shift();
      w.resolve(txt);
    }
  }

  async analyse(fen, depth = 10) {
    this.buffer = "";

    this.send("ucinewgame");
    this.send("position fen " + fen);
    this.send("go depth " + depth);

    const out = await Promise.race([
      this.wait("bestmove"),
      new Promise(r => setTimeout(() => r("TIMEOUT"), 2000)),
    ]);

    if (out === "TIMEOUT") {
      this.send("stop");
      return null;
    }

    const best = out.match(/bestmove\s+(\S+)/)?.[1] ?? null;

    const scores = [...out.matchAll(/score\s+(cp|mate)\s+(-?\d+)/g)];
    const last = scores.at(-1);

    let cp = null;
    let mate = null;

    if (last) {
      if (last[1] === "cp") cp = Number(last[2]);
      if (last[1] === "mate") mate = Number(last[2]);
    }

    return { best, cp, mate };
  }

  quit() {
    this.send("quit");
  }
}

function sq(f, r) {
  return "abcdefgh"[f] + String(r);
}

function kingDist(a, b) {
  return Math.max(
    Math.abs(a.charCodeAt(0) - b.charCodeAt(0)),
    Math.abs(Number(a[1]) - Number(b[1]))
  );
}

function fenFromPieces(pieces, side = "b") {
  const board = Array.from({ length: 8 }, () => Array(8).fill(""));

  for (const [square, piece] of Object.entries(pieces)) {
    const file = square.charCodeAt(0) - 97;
    const rank = 8 - Number(square[1]);
    board[rank][file] = piece;
  }

  const rows = board.map(row => {
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

function classify(c) {
  const rookDistance = Math.abs(Number(c.br[1]) - Number(c.wp[1]));

  if (rookDistance >= 3) return "checking_distance";

  if (
    c.br[0] !== c.wp[0] &&
    Math.abs(c.br.charCodeAt(0) - c.wp.charCodeAt(0)) >= 2
  ) {
    return "active_defense";
  }

  return "basic_philidor";
}

function makeCandidates() {
  const out = [];

  for (let file = 1; file <= 6; file++) {
    const pawnFile = "abcdefgh"[file];

    for (const pawnRank of [4,5,6]) {
      const wp = `${pawnFile}${pawnRank}`;

      for (const wkRank of [pawnRank+1, pawnRank+2].filter(x => x <= 7)) {
        const wk = `${pawnFile}${wkRank}`;

        for (const bkFile of [file-1,file,file+1].filter(x => x >= 0 && x <= 7)) {
          for (const bkRank of [7,8]) {

            const bk = sq(bkFile,bkRank);

            if (kingDist(wk,bk) <= 1) continue;

            for (let brFile=0;brFile<8;brFile++) {
              for (let brRank=1;brRank<=6;brRank++) {

                const br = sq(brFile,brRank);

                if ([wk,wp,bk].includes(br)) continue;

                for (let wrFile=0;wrFile<8;wrFile++) {
                  for (let wrRank=3;wrRank<=8;wrRank++) {

                    const wr = sq(wrFile,wrRank);

                    if ([wk,wp,bk,br].includes(wr)) continue;

                    out.push({
                      wk,wr,wp,bk,br,
                      fen: fenFromPieces({
                        [wk]:"K",
                        [wr]:"R",
                        [wp]:"P",
                        [bk]:"k",
                        [br]:"r",
                      },"b"),
                    });
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return out;
}

function drawish(info) {
  return (
    info &&
    info.mate === null &&
    info.cp !== null &&
    Math.abs(info.cp) <= 120
  );
}

const engine = new Engine();

const candidates = makeCandidates();

const buckets = Object.fromEntries(
  THEMES.map(t => [t.id, []])
);

console.log("Candidates:", candidates.length);

const MAX_SCAN = 2000;

for (let i=0;i<Math.min(candidates.length, MAX_SCAN);i++) {

  if (i % 100 === 0) {
    console.log(
      `checking ${i}/${candidates.length} | ` +
      THEMES.map(t => `${t.id}:${buckets[t.id].length}`).join(" | ")
    );
  }

  if (
    buckets.basic_philidor.length >= 60 &&
    buckets.checking_distance.length >= 30
  ) break;

  const c = candidates[i];

  const info = await engine.analyse(c.fen,10);

  if (!drawish(info)) continue;
  if (!info.best || info.best === "(none)") continue;

  const theme = classify(c);

  if (buckets[theme].length >= TARGET_PER_THEME) continue;

  buckets[theme].push({
    id: `${theme}_${String(buckets[theme].length + 1).padStart(3,"0")}`,
    fen: c.fen,
    allowedMoves: [info.best],
    bestmove_uci: info.best,
    result: "draw",
    theme,
    label: THEMES.find(t => t.id === theme)?.label ?? theme,
    explanation: `Engine verified Philidor defense`,
    evalCp: info.cp,
  });
}

engine.quit();

const progression = {
  name: "Philidor",
  order: THEMES.map(t => t.id),
  themes: {},
};

for (const theme of THEMES) {

  const list = buckets[theme.id];

  console.log(`${theme.label}: ${list.length}`);

  progression.themes[theme.id] = {
    label: theme.label,
    chunks: [],
    mode: "convert",
    goal: "hold_draw",
    maxSecondsPerMove: 3,
  };

  const chunkCount = Math.ceil(list.length / CHUNK_SIZE);

  for (let i=0;i<chunkCount;i++) {

    const positions = list.slice(
      i * CHUNK_SIZE,
      (i+1) * CHUNK_SIZE
    );

    const file =
      `${theme.id}_chunk_${String(i+1).padStart(3,"0")}.json`;

    fs.writeFileSync(
      path.join(CHUNK_DIR,file),
      JSON.stringify({
        chunkName: `${theme.label} ${i+1}`,
        description: theme.label,
        positions,
      },null,2)
    );

    progression.themes[theme.id].chunks.push(file);
  }
}

fs.writeFileSync(
  path.join(OUT_DIR,"progression.json"),
  JSON.stringify(progression,null,2)
);

console.log("DONE");
console.log("Output:", CHUNK_DIR);


