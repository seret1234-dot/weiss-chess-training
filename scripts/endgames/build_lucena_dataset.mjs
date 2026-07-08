import fs from "fs";
import path from "path";

const OUT_DIR =
  "C:/Users/Ariel/chess-trainer/public/data/endgames/lucena";

fs.mkdirSync(OUT_DIR, { recursive: true });

const positions = [
  {
    id: "lucena_001",
    fen: "8/8/8/8/8/3K4/4P3/3Rk2R w - - 0 1",
    solution: ["Rh1+"],
    label: "Basic bridge setup",
  },

  {
    id: "lucena_002",
    fen: "8/8/8/8/8/3K4/4P3/4k2R w - - 0 1",
    solution: ["Rh1+"],
    label: "Bridge building",
  },

  {
    id: "lucena_003",
    fen: "8/8/8/8/3K4/8/4P3/4k2R w - - 0 1",
    solution: ["Rh1+"],
    label: "King support",
  },

  {
    id: "lucena_004",
    fen: "8/8/8/8/8/3K4/4P3/r3k2R w - - 0 1",
    solution: ["Rh1+"],
    label: "Cutoff king",
  },

  {
    id: "lucena_005",
    fen: "8/8/8/8/3K4/8/4P3/r3k2R w - - 0 1",
    solution: ["Rh1+"],
    label: "Lucena technique",
  },

  {
    id: "lucena_006",
    fen: "8/8/8/8/8/2K5/4P3/3rk2R w - - 0 1",
    solution: ["Rh1+"],
    label: "Bridge pattern",
  },
];

const expanded = [];

let counter = 1;

for (let repeat = 0; repeat < 10; repeat++) {
  for (const p of positions) {
    expanded.push({
      ...p,
      id: `lucena_${String(counter).padStart(3, "0")}`,
    });

    counter++;
  }
}

const chunkSize = 30;
const chunks = [];

for (let i = 0; i < expanded.length; i += chunkSize) {
  chunks.push(expanded.slice(i, i + chunkSize));
}

const manifest = {
  name: "Lucena",
  description: "Build the bridge and win",
  totalChunks: chunks.length,
  chunks: [],
};

chunks.forEach((chunk, index) => {
  const fileName = `lucena_chunk_${String(index + 1).padStart(3, "0")}.json`;

  fs.writeFileSync(
    path.join(OUT_DIR, fileName),
    JSON.stringify(
      {
        puzzles: chunk,
      },
      null,
      2
    )
  );

  manifest.chunks.push({
    name: `Chunk ${index + 1}`,
    file: fileName,
  });
});

fs.writeFileSync(
  path.join(OUT_DIR, "manifest.json"),
  JSON.stringify(manifest, null, 2)
);

console.log("DONE");
console.log(`Generated ${expanded.length} Lucena positions`);
console.log(`Chunks: ${chunks.length}`);
