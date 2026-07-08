import fs from "fs";
import path from "path";

const root = "C:/Users/Ariel/chess-trainer";

const sourceDir = path.join(
  root,
  "public",
  "data",
  "endgames",
  "opposition",
  "chunks",
);

const targetDir = path.join(
  root,
  "public",
  "data",
  "endgames",
  "kpk",
  "chunks",
);

function copy(sourceName, targetName) {
  const source = path.join(sourceDir, sourceName);
  const target = path.join(targetDir, targetName);

  if (!fs.existsSync(source)) {
    throw new Error("Missing source: " + sourceName);
  }

  fs.copyFileSync(source, target);
  console.log(sourceName + " -> " + targetName);
}

const oppositionSources = [
  "basic_opposition_chunk_001.json",
  "basic_opposition_chunk_002.json",
  "basic_opposition_chunk_003.json",
  "basic_opposition_chunk_004.json",
  "basic_opposition_chunk_005.json",
  "triangulation_chunk_001.json",
  "triangulation_chunk_002.json",
  "triangulation_chunk_003.json",
  "triangulation_chunk_004.json",
  "shouldering_chunk_001.json",
];

const keySquareSources = [
  "key_squares_chunk_001.json",
  "key_squares_chunk_002.json",
  "key_squares_chunk_003.json",
  "key_squares_chunk_004.json",
  "key_squares_chunk_005.json",
  "key_squares_chunk_006.json",
  "key_squares_chunk_007.json",
  "key_squares_chunk_008.json",
  "key_squares_chunk_009.json",
  "key_squares_chunk_010.json",
];

oppositionSources.forEach((sourceName, index) => {
  const targetName = `chunk_${String(11 + index).padStart(3, "0")}.json`;
  copy(sourceName, targetName);
});

keySquareSources.forEach((sourceName, index) => {
  const targetName = `chunk_${String(21 + index).padStart(3, "0")}.json`;
  copy(sourceName, targetName);
});

console.log("DONE - replaced KPK Opposition and Key Squares chunks.");