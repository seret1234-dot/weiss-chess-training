import fs from "fs";
import { Chess } from "chess.js";

const INPUT =
  "C:/Users/Ariel/chess-trainer/stalemate_games_strict.pgn";

const OUT_DIR =
  "C:/Users/Ariel/chess-trainer/public/data/endgames/stalemate";

const CHUNK_DIR = `${OUT_DIR}/chunks`;

fs.mkdirSync(CHUNK_DIR, { recursive: true });

const text = fs.readFileSync(INPUT, "utf8");

const rawGames = text
  .split(/\n(?=\[Event )/)
  .map((g) => g.trim())
  .filter(Boolean);

console.log(`Loaded ${rawGames.length} stalemate games`);

function cleanPgn(pgn) {
  return pgn
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\$\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const byDistance = {
  1: [],
  2: [],
  3: [],
  4: [],
  5: [],
};

const seen = new Set();

let scanned = 0;

for (const raw of rawGames) {
  scanned++;

  try {
    const game = new Chess();

    game.loadPgn(cleanPgn(raw), {
      sloppy: true,
    });

    if (!game.isStalemate()) continue;

    const history = game.history();

    for (let dist = 1; dist <= 5; dist++) {
      if (history.length <= dist) continue;

      const rewind = new Chess();

      rewind.loadPgn(cleanPgn(raw), {
        sloppy: true,
      });

      for (let i = 0; i < dist; i++) {
        rewind.undo();
      }

      if (rewind.turn() !== "b") continue;
      if (rewind.isGameOver()) continue;

      const fen = rewind.fen();

      if (seen.has(fen)) continue;
      seen.add(fen);

      byDistance[dist].push({
        id: `stalemate_d${dist}_${String(byDistance[dist].length + 1).padStart(4, "0")}`,
        fen,
        distance: dist,
        theme: "mixed",
        label: `Distance ${dist} stalemate defense`,
        result: "draw",
      });
    }
  } catch {
    continue;
  }

  if (scanned % 100 === 0) {
    console.log(`scanned ${scanned}`);
  }
}

for (let dist = 1; dist <= 5; dist++) {
  const positions = byDistance[dist];

  console.log(`distance ${dist}: ${positions.length}`);

  const chunks = [];

  for (let i = 0; i < positions.length; i += 30) {
    chunks.push(positions.slice(i, i + 30));
  }

  chunks.forEach((chunk, idx) => {
    fs.writeFileSync(
      `${CHUNK_DIR}/d${dist}_chunk_${String(idx + 1).padStart(3, "0")}.json`,
      JSON.stringify({ positions: chunk }, null, 2),
    );
  });
}

const progression = {
  order: [
    "distance_1",
    "distance_2",
    "distance_3",
    "distance_4",
    "distance_5",
  ],
  themes: {},
};

for (let dist = 1; dist <= 5; dist++) {
  const count = byDistance[dist].length;
  const chunkCount = Math.ceil(count / 30);

  progression.themes[`distance_${dist}`] = {
    label: `Distance ${dist}`,
    chunkFiles: Array.from({ length: chunkCount }, (_, i) =>
      `d${dist}_chunk_${String(i + 1).padStart(3, "0")}.json`
    ),
  };
}

fs.writeFileSync(
  `${OUT_DIR}/progression.json`,
  JSON.stringify(progression, null, 2),
);

console.log("DONE");
console.log(OUT_DIR);