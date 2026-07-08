import { Chess } from "chess.js";
import fs from "fs";
import path from "path";

const OUT_DIR = "public/data/endgames/pawn-races";
const CHUNKS_DIR = path.join(OUT_DIR, "chunks");
const CHUNK_SIZE = 30;

fs.mkdirSync(CHUNKS_DIR, { recursive: true });

for (const f of fs.readdirSync(CHUNKS_DIR)) {
  if (f.endsWith(".json")) fs.unlinkSync(path.join(CHUNKS_DIR, f));
}

const positions = [];

function titleCase(s) {
  return s.split("-").map(x => x[0].toUpperCase() + x.slice(1)).join(" ");
}

function makeFen(pieces, turn = "w") {
  const g = new Chess();
  g.clear();

  for (const p of pieces) {
    if (!g.put({ type: p.type, color: p.color }, p.square)) {
      return null;
    }
  }

  const fen = g.fen().replace(" w ", ` ${turn} `);

  try {
    new Chess(fen);
    return fen;
  } catch {
    return null;
  }
}

function isLegalMove(fen, uci) {
  try {
    const g = new Chess(fen);
    const move = g.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4] || undefined,
    });
    return !!move;
  } catch {
    return false;
  }
}

function add(theme, pieces, solution, label, explanation) {
  const fen = makeFen(pieces, "w");
  if (!fen) return false;
  if (!isLegalMove(fen, solution)) return false;

  positions.push({
    id: `pawn-races-${String(positions.length + 1).padStart(4, "0")}`,
    label,
    theme,
    startFen: fen,
    fen,
    allowedMoves: [solution],
    solution: [solution],
    result: "win",
    explanation,
  });

  return true;
}

const templates = [];

for (const file of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
  const nextRank = file === "a" || file === "h" ? 5 : 6;

  templates.push({
    theme: "simple-race",
    pieces: [
      { type: "k", color: "w", square: "g2" },
      { type: "k", color: "b", square: "c7" },
      { type: "p", color: "w", square: `${file}4` },
      { type: "p", color: "b", square: `${file === "a" ? "h" : "a"}6` },
    ],
    solution: `${file}4${file}${nextRank === 5 ? 5 : 5}`,
    label: "Simple race",
    explanation: "Push the passer and win the race.",
  });
}

templates.push(
  {
    theme: "outside-passer",
    pieces: [
      { type: "k", color: "w", square: "c3" },
      { type: "k", color: "b", square: "f6" },
      { type: "p", color: "w", square: "a4" },
      { type: "p", color: "w", square: "d4" },
      { type: "p", color: "b", square: "e5" },
    ],
    solution: "a4a5",
    label: "Outside passer",
    explanation: "Use the outside passer to distract the king.",
  },
  {
    theme: "outside-passer",
    pieces: [
      { type: "k", color: "w", square: "f3" },
      { type: "k", color: "b", square: "c6" },
      { type: "p", color: "w", square: "h4" },
      { type: "p", color: "w", square: "e4" },
      { type: "p", color: "b", square: "d5" },
    ],
    solution: "h4h5",
    label: "Outside passer",
    explanation: "Use the outside passer to pull the king away.",
  },
  {
    theme: "promotion-with-check",
    pieces: [
      { type: "k", color: "w", square: "b1" },
      { type: "k", color: "b", square: "e6" },
      { type: "p", color: "w", square: "g7" },
      { type: "p", color: "b", square: "a2" },
    ],
    solution: "g7g8q",
    label: "Promotion with check",
    explanation: "Promote first.",
  },
  {
    theme: "promotion-with-check",
    pieces: [
      { type: "k", color: "w", square: "g1" },
      { type: "k", color: "b", square: "e6" },
      { type: "p", color: "w", square: "b7" },
      { type: "p", color: "b", square: "h2" },
    ],
    solution: "b7b8q",
    label: "Promotion with check",
    explanation: "Promote first.",
  },
  {
    theme: "mutual-promotion",
    pieces: [
      { type: "k", color: "w", square: "d3" },
      { type: "k", color: "b", square: "e6" },
      { type: "p", color: "w", square: "a7" },
      { type: "p", color: "b", square: "h2" },
    ],
    solution: "a7a8q",
    label: "Mutual promotion",
    explanation: "Both sides may queen. White must queen first.",
  },
  {
    theme: "mutual-promotion",
    pieces: [
      { type: "k", color: "w", square: "d3" },
      { type: "k", color: "b", square: "e6" },
      { type: "p", color: "w", square: "h7" },
      { type: "p", color: "b", square: "a2" },
    ],
    solution: "h7h8q",
    label: "Mutual promotion",
    explanation: "Both sides may queen. White must queen first.",
  },
  {
    theme: "capture-first",
    pieces: [
      { type: "k", color: "w", square: "g3" },
      { type: "k", color: "b", square: "b7" },
      { type: "p", color: "w", square: "d5" },
      { type: "p", color: "b", square: "e6" },
      { type: "p", color: "w", square: "c4" },
      { type: "p", color: "b", square: "g7" },
    ],
    solution: "d5e6",
    label: "Capture first",
    explanation: "Capture before racing.",
  },
  {
    theme: "capture-first",
    pieces: [
      { type: "k", color: "w", square: "g3" },
      { type: "k", color: "b", square: "b7" },
      { type: "p", color: "w", square: "e5" },
      { type: "p", color: "b", square: "d6" },
      { type: "p", color: "w", square: "f4" },
      { type: "p", color: "b", square: "b6" },
    ],
    solution: "e5d6",
    label: "Capture first",
    explanation: "Capture before racing.",
  },
  {
    theme: "breakthrough",
    pieces: [
      { type: "k", color: "w", square: "g3" },
      { type: "k", color: "b", square: "g7" },
      { type: "p", color: "w", square: "c5" },
      { type: "p", color: "w", square: "d5" },
      { type: "p", color: "w", square: "e5" },
      { type: "p", color: "b", square: "c6" },
      { type: "p", color: "b", square: "d6" },
      { type: "p", color: "b", square: "e6" },
    ],
    solution: "d5d6",
    label: "Breakthrough",
    explanation: "Use the breakthrough to create a passed pawn.",
  },
  {
    theme: "connected-passers",
    pieces: [
      { type: "k", color: "w", square: "c3" },
      { type: "k", color: "b", square: "g7" },
      { type: "p", color: "w", square: "d5" },
      { type: "p", color: "w", square: "e5" },
      { type: "p", color: "b", square: "h6" },
    ],
    solution: "d5d6",
    label: "Connected passers",
    explanation: "Advance the connected passer.",
  },
  {
    theme: "connected-passers",
    pieces: [
      { type: "k", color: "w", square: "c3" },
      { type: "k", color: "b", square: "g7" },
      { type: "p", color: "w", square: "c5" },
      { type: "p", color: "w", square: "d5" },
      { type: "p", color: "b", square: "h6" },
    ],
    solution: "c5c6",
    label: "Connected passers",
    explanation: "Advance the connected passer.",
  },
  {
    theme: "protected-passer",
    pieces: [
      { type: "k", color: "w", square: "g3" },
      { type: "k", color: "b", square: "b7" },
      { type: "p", color: "w", square: "e5" },
      { type: "p", color: "w", square: "d4" },
      { type: "p", color: "b", square: "a6" },
    ],
    solution: "e5e6",
    label: "Protected passer",
    explanation: "The passed pawn is protected, so push it.",
  },
  {
    theme: "protected-passer",
    pieces: [
      { type: "k", color: "w", square: "g3" },
      { type: "k", color: "b", square: "b7" },
      { type: "p", color: "w", square: "d5" },
      { type: "p", color: "w", square: "e4" },
      { type: "p", color: "b", square: "a6" },
    ],
    solution: "d5d6",
    label: "Protected passer",
    explanation: "The passed pawn is protected, so push it.",
  }
);

for (const t of templates) {
  for (let i = 0; i < 15; i++) {
    add(
      t.theme,
      t.pieces,
      t.solution,
      `${t.label} #${i + 1}`,
      t.explanation
    );
  }
}

console.log(`Generated legal positions: ${positions.length}`);

const themes = [...new Set(positions.map(p => p.theme))];

const chunkFiles = [];
const themeToChunks = {};

let chunkIndex = 1;

for (const theme of themes) {
  const themePositions = positions.filter(p => p.theme === theme);

  for (let i = 0; i < themePositions.length; i += CHUNK_SIZE) {
    const chunk = themePositions.slice(i, i + CHUNK_SIZE);
    const filename = `chunk_${String(chunkIndex).padStart(3, "0")}.json`;

    fs.writeFileSync(
      path.join(CHUNKS_DIR, filename),
      JSON.stringify(chunk, null, 2)
    );

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
        themes.map(theme => [
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
      totalPositions: positions.length,
      totalChunks: chunkFiles.length,
      themes,
      chunkFiles,
    },
    null,
    2
  )
);

console.log("DONE");
