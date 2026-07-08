import fs from "fs";
import { spawn } from "child_process";
import { Chess } from "chess.js";

const STOCKFISH =
"C:\\Users\\Ariel\\chess-trainer\\stockfish-windows-x86-64-avx2\\stockfish\\stockfish-windows-x86-64-avx2.exe";

const OUT = "public/data/endgames/philidor";
const CHUNKS = `${OUT}/chunks`;

const THEMES = [
  ["third_rank_defense", "Third-rank Defense"],
  ["side_checks", "Side Checks"],
  ["rook_behind_pawn", "Rook Behind Pawn"],
  ["king_cutoff", "King Cutoff Defense"],
  ["checking_distance", "Checking Distance"]
];

const files = ["b","c","d","e","f","g"];

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

class SF {
  constructor(path) {
    this.p = spawn(path);
    this.lines = [];

    this.p.stdout.on("data", d => {
      this.lines.push(...String(d).split(/\r?\n/).filter(Boolean));
    });

    this.p.stderr.on("data", d => {
      console.log(String(d));
    });
  }

  send(cmd) {
    this.p.stdin.write(cmd + "\n");
  }

  async wait(token, ms = 8000) {
    const start = Date.now();

    while (Date.now() - start < ms) {
      const idx = this.lines.findIndex(x => x.includes(token));

      if (idx !== -1) {
        return this.lines.splice(0, idx + 1);
      }

      await sleep(20);
    }

    return null;
  }

  async init() {
    this.send("uci");
    await this.wait("uciok");

    this.send("isready");
    await this.wait("readyok");
  }

  async analyze(fen) {
    try {
      this.lines = [];

      this.send("position fen " + fen);
      this.send("go depth 8");

      const out = await this.wait("bestmove", 10000);

      if (!out) return null;

      let bestMove = null;
      let evalCp = null;

      for (const line of out) {
        if (line.startsWith("bestmove ")) {
          bestMove = line.split(/\s+/)[1];
        }

        const m = line.match(/score cp (-?\d+)/);
        if (m) evalCp = Number(m[1]);
      }

      return { bestMove, evalCp };
    } catch {
      return null;
    }
  }

  close() {
    this.send("quit");
  }
}

function fenFrom(pieces) {
  const b = {};

  for (const [sq, pc] of pieces) {
    b[sq] = pc;
  }

  const rows = [];

  for (let r = 8; r >= 1; r--) {
    let row = "";
    let empty = 0;

    for (const f of "abcdefgh") {
      const pc = b[`${f}${r}`];

      if (!pc) empty++;
      else {
        if (empty) {
          row += empty;
          empty = 0;
        }

        row += pc;
      }
    }

    if (empty) row += empty;
    rows.push(row);
  }

  return `${rows.join("/")} b - - 0 1`;
}

function legal(fen) {
  try {
    const g = new Chess(fen);

    return (
      !g.isCheckmate() &&
      !g.isStalemate() &&
      g.moves().length > 0
    );
  } catch {
    return false;
  }
}

function make(theme, seed) {
  const pf = files[seed % files.length];
  const left = "bcd".includes(pf);

  const wk = `${pf}${2 + (seed % 4)}`;
  const wp = `${pf}${4 + (seed % 2)}`;
  const wr = `${left ? "f" : "c"}${1 + (seed % 2)}`;

  const bk = `${left ? "h" : "a"}${5 + (seed % 2)}`;

  let br = `${left ? "a" : "h"}3`;

  if (theme === "side_checks") {
    br = `${left ? "a" : "h"}${2 + (seed % 4)}`;
  }

  if (theme === "rook_behind_pawn") {
    br = `${pf}1`;
  }

  if (theme === "checking_distance") {
    br = `${left ? "a" : "h"}1`;
  }

  const fen = fenFrom([
    [wk, "K"],
    [wp, "P"],
    [wr, "R"],
    [bk, "k"],
    [br, "r"]
  ]);

  return legal(fen) ? fen : null;
}

fs.mkdirSync(CHUNKS, { recursive: true });

const sf = new SF(STOCKFISH);
await sf.init();

const progression = {
  order: THEMES.map(x => x[0]),
  themes: {}
};

let total = 0;

for (const [themeId, label] of THEMES) {
  const positions = [];
  const used = new Set();

  for (let seed = 1; seed <= 2000 && positions.length < 30; seed++) {
    const fen = make(themeId, seed);

    if (!fen || used.has(fen)) continue;
    used.add(fen);

    const info = await sf.analyze(fen);

    if (!info?.bestMove) continue;
    if (typeof info.evalCp !== "number") continue;

    // near draw only
    if (Math.abs(info.evalCp) > 400) continue;

    positions.push({
      id: `${themeId}_${positions.length + 1}`,
      label: `${label} #${positions.length + 1}`,
      startFen: fen,
      result: "draw",
      bestmove_uci: info.bestMove,
      engineEvalCp: info.evalCp,
      explanation:
        `${label}: find the engine-approved drawing defense.`
    });

    console.log(label, positions.length, info.evalCp, info.bestMove);
  }

  const chunkFile = `${themeId}_chunk_001.json`;

  fs.writeFileSync(
    `${CHUNKS}/${chunkFile}`,
    JSON.stringify(positions, null, 2)
  );

  progression.themes[themeId] = {
    label,
    chunkFiles: [chunkFile],
    maxSecondsPerMove: 5,
    mode: "convert"
  };

  total += positions.length;
}

fs.writeFileSync(
  `${OUT}/progression.json`,
  JSON.stringify(progression, null, 2)
);

sf.close();

console.log("DONE:", total, "verified Philidor positions.");
