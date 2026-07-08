import fs from "fs";
import path from "path";
import { Chess } from "chess.js";

const OUT_DIR = "public/data/endgames/stalemate";
const CHUNK_DIR = path.join(OUT_DIR, "chunks");

fs.mkdirSync(CHUNK_DIR, { recursive: true });

const positions = [
  {
    id: "stalemate_d1_001",
    fen: "7k/6Q1/7K/8/8/8/8/8 b - - 0 1",
    distance: 1,
    theme: "corner_box",
    label: "Black to move: stalemate defense",
    result: "draw",
    solution: ["h8h7"],
  },
];

fs.writeFileSync(
  path.join(CHUNK_DIR, "mate_001.json"),
  JSON.stringify({ positions }, null, 2),
);

fs.writeFileSync(
  path.join(OUT_DIR, "progression.json"),
  JSON.stringify(
    {
      order: ["d1_corner_box"],
      themes: {
        d1_corner_box: {
          label: "Distance 1 — Corner Box",
          chunkFiles: ["mate_001.json"],
        },
      },
    },
    null,
    2,
  ),
);

console.log("DONE: wrote starter stalemate dataset.");
console.log(path.resolve(OUT_DIR));