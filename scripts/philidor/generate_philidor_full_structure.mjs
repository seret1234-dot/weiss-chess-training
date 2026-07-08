import fs from "fs";
import { Chess } from "chess.js";

const OUT = "public/data/endgames/philidor";
const CHUNKS = `${OUT}/chunks`;

const themes = [
  ["third_rank_defense", "Third-rank Defense"],
  ["side_checks", "Side Checks"],
  ["rook_behind_pawn", "Rook Behind Pawn"],
  ["king_cutoff", "King Cutoff Defense"],
  ["checking_distance", "Checking Distance"],
  ["pawn_reaches_sixth", "Pawn Reaches Sixth"],
  ["short_side", "Short-side Defense"],
  ["long_side", "Long-side Defense"],
  ["rook_activity", "Rook Activity"],
  ["last_chance_checks", "Last-chance Checks"]
];

function writeJson(path, data) {
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

fs.mkdirSync(CHUNKS, { recursive: true });

const progression = {
  order: themes.map(([id]) => id),
  themes: {}
};

for (const [id, label] of themes) {
  const positions = [];

  // Safe starter only: small verified-by-human style placeholders.
  // We will replace this later with Stockfish/tablebase generation.
  for (let i = 1; i <= 30; i++) {
    const file = ["b", "c", "d", "e", "f", "g"][i % 6];
    const fen = `8/8/8/8/8/${file === "b" ? "1" : ""}k6/8/1K3R1r b - - 0 1`;

    positions.push({
      id: `${id}_${String(i).padStart(3, "0")}`,
      label: `${label} #${i}`,
      startFen: "8/8/8/8/3k4/8/3P4/3K1R1r b - - 0 1",
      result: "draw",
      explanation: `${label}: find the defensive rook move that holds the draw.`
    });
  }

  const chunkFile = `${id}_chunk_001.json`;
  writeJson(`${CHUNKS}/${chunkFile}`, positions);

  progression.themes[id] = {
    label,
    chunkFiles: [chunkFile],
    maxSecondsPerMove: 5,
    mode: "convert"
  };
}

writeJson(`${OUT}/progression.json`, progression);

console.log("DONE: generated Philidor full structure: 10 themes x 30 starter positions.");
console.log("NOTE: These are structure placeholders, not final verified tablebase data.");
