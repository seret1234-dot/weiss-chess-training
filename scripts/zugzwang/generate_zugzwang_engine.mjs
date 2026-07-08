import fs from "fs";
import path from "path";

const OUT_DIR = "public/data/endgames/zugzwang";
const CHUNKS_DIR = path.join(OUT_DIR, "chunks");

fs.mkdirSync(CHUNKS_DIR, { recursive: true });

const positions = [];

function add(id, fen, move, label, explanation) {
  positions.push({
    id,
    label,
    startFen: fen,
    fen,
    allowedMoves: [move],
    solution: [move],
    bestmove_uci: move,
    result: "win",
    explanation,
    theme: "zugzwang",
  });
}

add(
  "zug-001",
  "8/8/8/8/8/2k5/2P5/2K5 w - - 0 1",
  "c2c3",
  "Basic opposition",
  "White triangulates and puts black in zugzwang."
);

add(
  "zug-002",
  "8/8/8/8/8/3k4/3P4/3K4 w - - 0 1",
  "d2d3",
  "Shouldering",
  "Gain the key opposition square."
);

add(
  "zug-003",
  "8/8/8/8/3k4/8/3P4/3K4 w - - 0 1",
  "d2d4",
  "Breakthrough",
  "Advance only when opposition is correct."
);

add(
  "zug-004",
  "8/8/8/8/2k5/8/2P5/2K5 w - - 0 1",
  "c2c4",
  "Reserve tempo",
  "Use pawn tempo to force king retreat."
);

add(
  "zug-005",
  "8/8/8/8/4k3/8/4P3/4K3 w - - 0 1",
  "e2e3",
  "King opposition",
  "Black loses opposition after the pawn move."
);

const chunk = positions;

fs.writeFileSync(
  path.join(CHUNKS_DIR, "chunk_001.json"),
  JSON.stringify(chunk, null, 2)
);

fs.writeFileSync(
  path.join(OUT_DIR, "progression.json"),
  JSON.stringify(
    {
      order: ["zugzwang"],
      masteryFastSolves: 5,
      maxSecondsPerMove: 3,
      goal: "convert",
      basePath: "/data/endgames/zugzwang",
      chunkSize: 30,
      themes: {
        zugzwang: {
          id: "zugzwang",
          label: "Zugzwang",
          mode: "convert",
          goal: "convert",
          chunkFiles: ["chunk_001.json"],
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
      name: "Zugzwang",
      totalPositions: positions.length,
      totalChunks: 1,
      themes: ["zugzwang"],
      chunkFiles: ["chunk_001.json"],
    },
    null,
    2
  )
);

console.log(`DONE. Generated ${positions.length} zugzwang positions.`);