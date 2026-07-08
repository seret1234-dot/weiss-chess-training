import { Chess } from "chess.js";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const STOCKFISH = "C:/Users/Ariel/chess-trainer/stockfish-windows-x86-64-avx2/stockfish/stockfish-windows-x86-64-avx2.exe";

const OUT_DIR = "public/data/endgames/pawn-races";
const CHUNKS_DIR = path.join(OUT_DIR, "chunks");

const CHUNK_SIZE = 30;
const MAX_CANDIDATES = 800;
const TARGET_PER_THEME = 30;

fs.mkdirSync(CHUNKS_DIR, { recursive: true });

// keep existing chunks

function rand(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function titleCase(s) {
  return s.split("-").map((x) => x[0].toUpperCase() + x.slice(1)).join(" ");
}

async function analyzeFen(fen) {
  return new Promise((resolve) => {
    const engine = spawn(STOCKFISH);
    const lines = [];

    const timer = setTimeout(() => {
      try { engine.kill(); } catch {}
      resolve(null);
    }, 5000);

    engine.stdout.on("data", (data) => {
      for (const line of data.toString().split(/\r?\n/)) {
        const clean = line.trim();
        if (!clean) continue;

        lines.push(clean);

        if (clean.startsWith("bestmove ")) {
          clearTimeout(timer);

          const infoLines = lines.filter((l) => l.startsWith("info "));
          const lastInfo = [...infoLines].reverse().find((l) => l.includes(" score "));

          let cp = null;
          let mate = null;

          if (lastInfo) {
            const cpMatch = lastInfo.match(/score cp (-?\d+)/);
            const mateMatch = lastInfo.match(/score mate (-?\d+)/);

            if (cpMatch) cp = Number(cpMatch[1]);
            if (mateMatch) mate = Number(mateMatch[1]);
          }

          const bestMove = clean.split(/\s+/)[1];

          try { engine.kill(); } catch {}
          resolve({ bestMove, cp, mate });
        }
      }
    });

    engine.on("error", () => {
      clearTimeout(timer);
      resolve(null);
    });

    engine.stdin.write("uci\n");
    engine.stdin.write("isready\n");
    engine.stdin.write(`position fen ${fen}\n`);
    engine.stdin.write("go movetime 150\n");
  });
}

function makeFen(pieces, turn = "w") {
  const g = new Chess();
  g.clear();

  for (const p of pieces) {
    const ok = g.put({ type: p.type, color: p.color }, p.square);
    if (!ok) return null;
  }

  const fen = g.fen().replace(" w ", ` ${turn} `);

  try {
    const test = new Chess(fen);
    if (test.isCheck()) return null;
    return fen;
  } catch {
    return null;
  }
}

function coord(square) {
  return {
    file: "abcdefgh".indexOf(square[0]),
    rank: Number(square[1]),
  };
}

function kingsFar(a, b) {
  const ca = coord(a);
  const cb = coord(b);
  return Math.max(Math.abs(ca.file - cb.file), Math.abs(ca.rank - cb.rank)) > 1;
}

function legalMoves(fen) {
  try {
    const g = new Chess(fen);

    return g.moves({ verbose: true }).map((m) => ({
      uci: `${m.from}${m.to}${m.promotion ?? ""}`,
      san: m.san,
      piece: m.piece,
      color: m.color,
      from: m.from,
      to: m.to,
      promotion: m.promotion,
    }));
  } catch {
    return [];
  }
}

function applyMove(fen, uci) {
  try {
    const g = new Chess(fen);

    const move = g.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4] || undefined,
    });

    if (!move) return null;
    return g.fen();
  } catch {
    return null;
  }
}

function isWinning(info) {
  if (!info) return false;

  if (typeof info.mate === "number") {
    return Math.abs(info.mate) > 0;
  }

  if (typeof info.cp === "number") {
    return Math.abs(info.cp) >= 150;
  }

  return false;
}

function pushCandidate(out, seen, theme, pieces, label, explanation) {
  const fen = makeFen(pieces, "w");
  if (!fen) return;
  if (seen.has(fen)) return;

  seen.add(fen);
  out.push({ theme, fen, label, explanation });
}

function buildCandidates() {
  const out = [];
  const seen = new Set();

  const files = ["a", "b", "c", "d", "e", "f", "g", "h"];

  const whiteKings = [
    "a1","b1","c1","d1","e1","f1","g1","h1",
    "a2","b2","c2","d2","e2","f2","g2","h2",
    "a3","b3","c3","d3","e3","f3","g3","h3",
    "c4","d4","e4","f4"
  ];

  const blackKings = [
    "a8","b8","c8","d8","e8","f8","g8","h8",
    "a7","b7","c7","d7","e7","f7","g7","h7",
    "a6","b6","c6","d6","e6","f6","g6","h6",
    "c5","d5","e5","f5"
  ];

  for (let i = 0; i < 4000; i++) {
    const wf = rand(files);
    const bf = rand(files);
    if (Math.abs(files.indexOf(wf) - files.indexOf(bf)) <= 1) continue;

    const wk = rand(whiteKings);
    const bk = rand(blackKings);
    if (!kingsFar(wk, bk)) continue;

    pushCandidate(
      out,
      seen,
      "simple-race",
      [
        { type: "k", color: "w", square: wk },
        { type: "k", color: "b", square: bk },
        { type: "p", color: "w", square: `${wf}${rand([2,3,4,5,6])}` },
        { type: "p", color: "b", square: `${bf}${rand([2,3,4,5,6,7])}` },
      ],
      "Simple race",
      "Calculate the direct pawn race."
    );
  }

  const captureSeeds = [
  ["d5","e6","c4","g7","g3","b7"],
  ["e5","d6","f4","b7","g3","b6"],
  ["c5","d6","b4","h7","f3","a7"],
  ["f5","e6","g4","a7","g2","b7"],
  ["b5","c6","a4","h7","f2","c7"],
  ["g5","f6","h4","a7","g3","a6"],
];

for (const s of captureSeeds) {
  for (let i = 0; i < 80; i++) {
    pushCandidate(
      out,
      seen,
      "capture-first",
      [
        { type: "k", color: "w", square: s[4] },
        { type: "k", color: "b", square: s[5] },
        { type: "p", color: "w", square: s[0] },
        { type: "p", color: "b", square: s[1] },
        { type: "p", color: "w", square: s[2] },
        { type: "p", color: "b", square: s[3] },
      ],
      "Capture first",
      "Do not race immediately. Capture first if it wins."
    );
  }
}

  for (let i = 0; i < 1200; i++) {
    const s = rand([
      ["c5","d5","e5","c6","d6","e6"],
      ["b5","c5","d5","b6","c6","d6"],
      ["e5","f5","g5","e6","f6","g6"],
    ]);

    pushCandidate(
      out,
      seen,
      "breakthrough",
      [
        { type: "k", color: "w", square: rand(["f2","g2","h2","f3","g3","h3"]) },
        { type: "k", color: "b", square: rand(["f7","g7","h7","f6","g6","h6"]) },
        { type: "p", color: "w", square: s[0] },
        { type: "p", color: "w", square: s[1] },
        { type: "p", color: "w", square: s[2] },
        { type: "p", color: "b", square: s[3] },
        { type: "p", color: "b", square: s[4] },
        { type: "p", color: "b", square: s[5] },
      ],
      "Breakthrough",
      "Create a passed pawn with a breakthrough."
    );
  }

  for (let i = 0; i < 2000; i++) {
    const s = rand([
      ["d5", "e5"], ["c5", "d5"], ["e5", "f5"], ["b5", "c5"], ["f5", "g5"],
    ]);

    pushCandidate(
      out,
      seen,
      "connected-passers",
      [
        { type: "k", color: "w", square: rand(["b2","c2","d2","b3","c3","d3","e3"]) },
        { type: "k", color: "b", square: rand(["f7","g7","h7","f6","g6","h6"]) },
        { type: "p", color: "w", square: s[0] },
        { type: "p", color: "w", square: s[1] },
        { type: "p", color: "b", square: rand(["a6", "h6", "a7", "h7"]) },
      ],
      "Connected passers",
      "Advance connected passers correctly."
    );
  }

  console.log(`Built candidates: ${out.length}`);
  return out.filter((p) => p.theme === "protected-passer").slice(0, MAX_CANDIDATES);
}

async function verifyCandidate(candidate, index) {
  const moves = legalMoves(candidate.fen);
  const pawnMoves = moves.filter((m) => m.color === "w" && m.piece === "p");

  if (pawnMoves.length === 0) return null;

  const before = await analyzeFen(candidate.fen);
  if (!isWinning(before)) return null;

  const winningMoves = [];

  for (const move of pawnMoves) {
    const afterFen = applyMove(candidate.fen, move.uci);
    if (!afterFen) continue;

    const after = await analyzeFen(afterFen);
    if (isWinning(after)) {
      winningMoves.push({ move, after });
    }
  }

  const bestMove = pawnMoves.find((m) => m.uci === before.bestMove);

  if (!bestMove) return null;

  const afterFen = applyMove(candidate.fen, bestMove.uci);
  if (!afterFen) return null;

  const after = await analyzeFen(afterFen);
  if (!isWinning(after)) return null;

  const best = { move: bestMove, after };

  return {
    id: `pawn-races-${String(index).padStart(4, "0")}`,
    label: `${candidate.label} #${index}`,
    theme: candidate.theme,
    startFen: candidate.fen,
    fen: candidate.fen,
    allowedMoves: [best.move.uci],
    solution: [best.move.uci],
    bestmove_uci: best.move.uci,
    result: "win",
    explanation: candidate.explanation,
    engine: {
      bestMove: before.bestMove,
      beforeCp: before.cp,
      beforeMate: before.mate,
      afterCp: best.after.cp,
      afterMate: best.after.mate,
    },
  };
}

async function main() {
  const candidates = buildCandidates();
  const kept = [];
  const counts = {};

  let tested = 0;

  for (const candidate of candidates) {
    tested++;

    if (tested % 5 === 0) {
      console.log(`tested ${tested}/${candidates.length} | kept ${kept.length}`);
    }

    const verified = await verifyCandidate(candidate, kept.length + 1);
    if (!verified) continue;

    counts[verified.theme] = counts[verified.theme] ?? 0;
    if (counts[verified.theme] >= TARGET_PER_THEME) continue;

    counts[verified.theme]++;
    kept.push(verified);

    console.log(`KEPT ${kept.length}: ${verified.theme} ${verified.bestmove_uci}`);
  }

  const themes = [...new Set(kept.map((p) => p.theme))];

  if (kept.length === 0) {
    console.log("No verified positions kept.");
    return;
  }

  const chunkFiles = [];
  const themeToChunks = {};
  let chunkIndex = fs.readdirSync(CHUNKS_DIR).filter((f) => f.endsWith(".json")).length + 1;

  for (const theme of themes) {
    const themePositions = kept.filter((p) => p.theme === theme);

    for (let i = 0; i < themePositions.length; i += CHUNK_SIZE) {
      const chunk = themePositions.slice(i, i + CHUNK_SIZE);
      const filename = `chunk_${String(chunkIndex).padStart(3, "0")}.json`;

      fs.writeFileSync(path.join(CHUNKS_DIR, filename), JSON.stringify(chunk, null, 2));

      chunkFiles.push(filename);
      themeToChunks[theme] ??= [];
      themeToChunks[theme].push(filename);

      console.log(`Saved ${filename}: ${theme} (${chunk.length})`);

      chunkIndex++;
    }
  }

  fs.writeFileSync(
    path.join(OUT_DIR, "progression.json"),
    JSON.stringify(
      {
        order: themes,
        masteryFastSolves: 5,
        maxSecondsPerMove: 3,
        goal: "convert",
        basePath: "/data/endgames/pawn-races",
        chunkSize: 30,
        themes: Object.fromEntries(
          themes.map((theme) => [
            theme,
            {
              id: theme,
              label: titleCase(theme),
              mode: "convert",
              goal: "convert",
              chunkFiles: themeToChunks[theme],
            },
          ])
        ),
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(OUT_DIR, "manifest.json"),
    JSON.stringify(
      {
        name: "Pawn Races",
        totalPositions: kept.length,
        totalChunks: chunkFiles.length,
        themes,
        chunkFiles,
      },
      null,
      2
    )
  );

  console.log(`DONE. Tested ${tested}, kept ${kept.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});











