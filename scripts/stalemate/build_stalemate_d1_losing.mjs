import fs from "fs";
import { Chess } from "chess.js";
import { spawn } from "child_process";

const INPUT =
  "C:/Users/Ariel/chess-trainer/stalemate_games_strict.pgn";

const OUT_DIR =
  "C:/Users/Ariel/chess-trainer/public/data/endgames/stalemate";

const CHUNK_DIR = `${OUT_DIR}/chunks`;

const STOCKFISH =
  "C:/Users/Ariel/chess-trainer/stockfish-windows-x86-64-avx2/stockfish/stockfish-windows-x86-64-avx2.exe";

fs.mkdirSync(CHUNK_DIR, { recursive: true });

function startEngine() {
  const engine = spawn(STOCKFISH);

  engine.stdin.setDefaultEncoding("utf8");

  let buffer = "";
  const waiters = [];

  engine.stdout.on("data", (d) => {
    buffer += d.toString();

    for (let i = waiters.length - 1; i >= 0; i--) {
      const w = waiters[i];

      if (buffer.includes(w.token)) {
        waiters.splice(i, 1);
        w.resolve(buffer);
        buffer = "";
      }
    }
  });

  function send(cmd) {
    engine.stdin.write(cmd + "\n");
  }

  function waitFor(token) {
    return new Promise((resolve) => {
      waiters.push({ token, resolve });
    });
  }

  async function init() {
    send("uci");
    await waitFor("uciok");

    send("isready");
    await waitFor("readyok");
  }

  async function analyze(fen, depth = 14) {
    send(`position fen ${fen}`);
    send(`go depth ${depth}`);

    const out = await waitFor("bestmove");

    let evalCp = null;
    let mate = null;

    const cpMatches = [...out.matchAll(/score cp (-?\d+)/g)];

    if (cpMatches.length > 0) {
      evalCp = Number(cpMatches.at(-1)[1]) / 100;
    }

    const mateMatches = [...out.matchAll(/score mate (-?\d+)/g)];

    if (mateMatches.length > 0) {
      mate = Number(mateMatches.at(-1)[1]);
    }

    return {
      eval: evalCp,
      mate,
    };
  }

  function destroy() {
    send("quit");
  }

  return {
    init,
    analyze,
    destroy,
  };
}

function cleanPgn(pgn) {
  return pgn
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\$\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// FIXED:
// side to move must be LOSING badly.
function isSideToMoveLosingBadly(info, turn) {
  if (!info) return false;

  // mate score is from side-to-move perspective
  if (typeof info.mate === "number") {
    if (turn === "b") return info.mate < 0;
    if (turn === "w") return info.mate > 0;
  }

  // cp score positive = White better
  if (typeof info.eval === "number") {
    if (turn === "b") return info.eval >= 5;
    if (turn === "w") return info.eval <= -5;
  }

  return false;
}

const text = fs.readFileSync(INPUT, "utf8");

const rawGames = text
  .split(/\n(?=\[Event )/)
  .map((g) => g.trim())
  .filter(Boolean);

console.log(`Loaded ${rawGames.length} stalemate games`);

const engine = startEngine();

await engine.init();

const positions = [];
const seen = new Set();

let scanned = 0;

for (const raw of rawGames) {
  scanned++;

  try {
    const finalGame = new Chess();

    finalGame.loadPgn(cleanPgn(raw), {
      sloppy: true,
    });

    if (!finalGame.isStalemate()) continue;

    const start = new Chess();

    start.loadPgn(cleanPgn(raw), {
      sloppy: true,
    });

    const lastMove = start.undo();

    if (!lastMove) continue;
    if (start.isGameOver()) continue;

    // verify the move immediately causes stalemate
    const verify = new Chess(start.fen());

    const played = verify.move({
      from: lastMove.from,
      to: lastMove.to,
      promotion: lastMove.promotion || "q",
    });

    if (!played) continue;

    if (!verify.isStalemate()) {
      continue;
    }

    const fen = start.fen();

    if (seen.has(fen)) continue;

    const info = await engine.analyze(fen, 14);

    if (!isSideToMoveLosingBadly(info, start.turn())) {
      continue;
    }

    seen.add(fen);

    positions.push({
      id: `stalemate_d1_${String(
        positions.length + 1
      ).padStart(4, "0")}`,

      fen,

      distance: 1,

      theme: "mixed_losing_side",

      label: "Distance 1: save the draw by stalemate",

      result: "draw",

      solution: [
        lastMove.from +
          lastMove.to +
          (lastMove.promotion ?? "")
      ],

      finalFen: finalGame.fen(),

      engineEval: info.eval ?? null,

      engineMate: info.mate ?? null,

      sideToMove: start.turn(),
    });

    if (positions.length % 10 === 0) {
      console.log(
        `kept ${positions.length} | scanned ${scanned}`
      );
    }

    if (positions.length >= 120) {
      break;
    }
  } catch {
    continue;
  }
}

engine.destroy();

const chunks = [];

for (let i = 0; i < positions.length; i += 30) {
  chunks.push(positions.slice(i, i + 30));
}

chunks.forEach((chunk, idx) => {
  fs.writeFileSync(
    `${CHUNK_DIR}/d1_losing_chunk_${String(
      idx + 1
    ).padStart(3, "0")}.json`,

    JSON.stringify(
      {
        positions: chunk,
      },
      null,
      2
    )
  );
});

fs.writeFileSync(
  `${OUT_DIR}/progression.json`,

  JSON.stringify(
    {
      order: ["distance_1_losing"],

      themes: {
        distance_1_losing: {
          label:
            "Distance 1 — Losing side saves draw",

          chunkFiles: chunks.map(
            (_, i) =>
              `d1_losing_chunk_${String(
                i + 1
              ).padStart(3, "0")}.json`
          ),
        },
      },
    },

    null,
    2
  )
);

console.log("DONE");
console.log(`Scanned: ${scanned}`);
console.log(`Kept: ${positions.length}`);
console.log(OUT_DIR);
