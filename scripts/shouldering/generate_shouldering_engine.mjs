import { Chess } from "chess.js";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const STOCKFISH =
  "C:/Users/Ariel/chess-trainer/stockfish-windows-x86-64-avx2/stockfish/stockfish-windows-x86-64-avx2.exe";

const OUT_DIR = "public/data/endgames/shouldering";
const CHUNKS_DIR = path.join(OUT_DIR, "chunks");

const CHUNK_SIZE = 30;
const TARGET = 180;
const MAX_TESTED = 12000;

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(CHUNKS_DIR, { recursive: true });

const FILES = "abcdefgh";

function coord(s) {
  return { f: FILES.indexOf(s[0]), r: Number(s[1]) };
}

function kingDist(a, b) {
  const x = coord(a);
  const y = coord(b);
  return Math.max(Math.abs(x.f - y.f), Math.abs(x.r - y.r));
}

function kingsFar(a, b) {
  return kingDist(a, b) > 1;
}

function findPieceSquare(g, color, type) {
  for (const f of FILES) {
    for (let r = 1; r <= 8; r++) {
      const sq = `${f}${r}`;
      const p = g.get(sq);
      if (p?.color === color && p?.type === type) return sq;
    }
  }
  return null;
}

function makeFen(wk, bk, wp, turn = "w") {
  if (!kingsFar(wk, bk)) return null;
  if (wk === bk || wk === wp || bk === wp) return null;

  const g = new Chess();
  g.clear();

  if (!g.put({ type: "k", color: "w" }, wk)) return null;
  if (!g.put({ type: "k", color: "b" }, bk)) return null;
  if (!g.put({ type: "p", color: "w" }, wp)) return null;

  let fen = g.fen().replace(" w ", ` ${turn} `);

  try {
    const test = new Chess(fen);
    if (test.isCheck()) return null;
    if (test.moves().length === 0) return null;
    return fen;
  } catch {
    return null;
  }
}

async function analyzeFen(fen, movetime = 180) {
  return new Promise((resolve) => {
    const engine = spawn(STOCKFISH);
    const lines = [];

    const timer = setTimeout(() => {
      try { engine.kill(); } catch {}
      resolve(null);
    }, 6000);

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
    engine.stdin.write(`go movetime ${movetime}\n`);
  });
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

function whiteWinning(info, fen) {
  if (!info) return false;

  const turn = fen.split(" ")[1];

  if (typeof info.mate === "number") {
    if (turn === "w") return info.mate > 0;
    return info.mate < 0;
  }

  if (typeof info.cp === "number") {
    if (turn === "w") return info.cp >= 80;
    return info.cp <= -80;
  }

  return false;
}

function blackCanTakePawnAfter(fen, pawnSq) {
  try {
    const g = new Chess(fen);
    const moves = g.moves({ verbose: true });
    return moves.some((m) => m.color === "b" && m.to === pawnSq);
  } catch {
    return true;
  }
}

function isShoulderingKingMove(fen, moveObj) {
  if (!moveObj || moveObj.piece !== "k" || moveObj.color !== "w") return false;

  const g = new Chess(fen);
  const bk = findPieceSquare(g, "b", "k");
  const wp = findPieceSquare(g, "w", "p");
  if (!bk || !wp) return false;

  const beforeToBlack = kingDist(moveObj.from, bk);
  const afterToBlack = kingDist(moveObj.to, bk);

  const beforeToPawnFile =
    Math.abs(FILES.indexOf(moveObj.from[0]) - FILES.indexOf(wp[0]));
  const afterToPawnFile =
    Math.abs(FILES.indexOf(moveObj.to[0]) - FILES.indexOf(wp[0]));

  const movedForwardOrSide =
    Number(moveObj.to[1]) >= Number(moveObj.from[1]);

  const stayedNearPawn = afterToPawnFile <= 1;

  const doesNotRunAwayFromBlock =
    afterToBlack >= beforeToBlack - 1;

  return movedForwardOrSide && stayedNearPawn && doesNotRunAwayFromBlock;
}

function buildCandidates() {
  const out = [];
  const seen = new Set();

  for (let pf = 1; pf <= 6; pf++) {
    for (let pr = 2; pr <= 5; pr++) {
      const wp = `${FILES[pf]}${pr}`;

      for (let wdf = -1; wdf <= 1; wdf++) {
        for (let wdr = 1; wdr <= 3; wdr++) {
          const wf = pf + wdf;
          const wr = pr + wdr;
          if (wf < 0 || wf > 7 || wr < 1 || wr > 8) continue;

          const wk = `${FILES[wf]}${wr}`;

          for (const side of [-1, 1]) {
            for (let bdf = 2; bdf <= 4; bdf++) {
              for (let bdr = 1; bdr <= 4; bdr++) {
                const bf = pf + side * bdf;
                const br = pr + bdr;
                if (bf < 0 || bf > 7 || br < 1 || br > 8) continue;

                const bk = `${FILES[bf]}${br}`;
                const fen = makeFen(wk, bk, wp, "w");
                if (!fen || seen.has(fen)) continue;

                seen.add(fen);
                out.push({ fen, wk, bk, wp });
              }
            }
          }
        }
      }
    }
  }

  return out;
}

function writeOutput(positions) {
  const chunkFiles = [];

  for (let i = 0; i < positions.length; i += CHUNK_SIZE) {
    const chunk = positions.slice(i, i + CHUNK_SIZE);
    const file = `chunk_${String(chunkFiles.length + 1).padStart(3, "0")}.json`;

    fs.writeFileSync(
      path.join(CHUNKS_DIR, file),
      JSON.stringify(chunk, null, 2)
    );

    chunkFiles.push(file);
  }

  fs.writeFileSync(
    path.join(OUT_DIR, "progression.json"),
    JSON.stringify(
      {
        order: ["shouldering"],
        masteryFastSolves: 5,
        maxSecondsPerMove: 3,
        goal: "convert",
        basePath: "/data/endgames/shouldering",
        chunkSize: CHUNK_SIZE,
        themes: {
          shouldering: {
            id: "shouldering",
            label: "KPK Shouldering",
            mode: "convert",
            goal: "convert",
            chunkFiles,
          },
        },
      },
      null,
      2
    )
  );

  fs.writeFileSync(
    path.join(OUT_DIR, "manifest.json"),
    JSON.stringify(
      {
        name: "Shouldering",
        totalPositions: positions.length,
        totalChunks: chunkFiles.length,
        themes: ["shouldering"],
        chunkFiles,
      },
      null,
      2
    )
  );
}

async function main() {
  if (!fs.existsSync(STOCKFISH)) {
    throw new Error(`Stockfish not found: ${STOCKFISH}`);
  }

  const candidates = buildCandidates();
  console.log(`Built candidates: ${candidates.length}`);

  const kept = [];
  let tested = 0;

  for (const c of candidates) {
    tested++;
    if (tested > MAX_TESTED) break;

    if (tested % 100 === 0) {
      console.log(`tested ${tested}/${candidates.length} | kept ${kept.length}`);
    }

    const info = await analyzeFen(c.fen, 180);
    if (!whiteWinning(info, c.fen)) continue;

    const moves = legalMoves(c.fen);
    const best = moves.find((m) => m.uci === info.bestMove);
    if (!best) continue;

    if (!isShoulderingKingMove(c.fen, best)) continue;

    const afterFen = applyMove(c.fen, info.bestMove);
    if (!afterFen) continue;

    if (blackCanTakePawnAfter(afterFen, c.wp)) continue;

    const afterInfo = await analyzeFen(afterFen, 150);
    if (!whiteWinning(afterInfo, afterFen)) continue;

    kept.push({
      id: `shouldering_${String(kept.length + 1).padStart(4, "0")}`,
      label: "Engine shouldering",
      startFen: c.fen,
      fen: c.fen,
      allowedMoves: [info.bestMove],
      solution: [info.bestMove],
      bestmove_uci: info.bestMove,
      result: "win",
      explanation:
        "Stockfish confirms the king move keeps the win and shoulders the enemy king away.",
      theme: "shouldering",
      subjectName: "Shouldering",
      engine: {
        cp: info.cp,
        mate: info.mate,
        bestMove: info.bestMove,
      },
    });

    if (kept.length >= TARGET) break;
  }

  writeOutput(kept);

  console.log(`DONE. Tested ${tested}. Generated ${kept.length} positions in ${Math.ceil(kept.length / CHUNK_SIZE)} chunks.`);
  console.log(OUT_DIR);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
