import fs from "fs";

const positions = [
  {
    id: "lucena_001",
    label: "Lucena Basic 1",
    startFen: "8/8/8/8/8/2K5/2PR4/2k4r w - - 0 1",
    explanation: "Build a bridge against black rook checks.",
    result: "win"
  },
  {
    id: "lucena_002",
    label: "Lucena Basic 2",
    startFen: "8/8/8/8/8/3K4/3PR3/3k3r w - - 0 1",
    explanation: "Use the rook to shelter your king from checks.",
    result: "win"
  },
  {
    id: "lucena_003",
    label: "Lucena Basic 3",
    startFen: "8/8/8/8/8/4K3/4PR2/4k2r w - - 0 1",
    explanation: "Classic Lucena bridge-building technique.",
    result: "win"
  },
  {
    id: "lucena_004",
    label: "Lucena Basic 4",
    startFen: "8/8/8/8/8/5K2/5PR1/5k1r w - - 0 1",
    explanation: "Win by building a bridge and escaping checks.",
    result: "win"
  },
  {
    id: "lucena_005",
    label: "Lucena Basic 5",
    startFen: "8/8/8/8/3K4/8/3PR3/3k3r w - - 0 1",
    explanation: "Coordinate king, rook, and pawn against the checking rook.",
    result: "win"
  }
];

fs.mkdirSync("public/data/endgames/lucena/chunks", { recursive: true });

fs.writeFileSync(
  "public/data/endgames/lucena/progression.json",
  JSON.stringify({
    order: ["lucena"],
    themes: {
      lucena: {
        label: "Lucena",
        chunkFiles: ["chunk_001.json"],
        maxSecondsPerMove: 5,
        mode: "convert"
      }
    }
  }, null, 2)
);

fs.writeFileSync(
  "public/data/endgames/lucena/chunks/chunk_001.json",
  JSON.stringify(positions, null, 2)
);

console.log("DONE: Lucena positions now include black rook.");
