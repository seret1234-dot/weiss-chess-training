import fs from "fs";

const OUT = "public/data/endgames/philidor";
const CHUNKS = `${OUT}/chunks`;

const positions = [
  {
    id: "philidor_001",
    label: "Philidor Defense 1",
    startFen: "8/8/8/8/2k5/8/2p5/2K2R1r b - - 0 1",
    result: "draw",
    explanation: "Defend with the rook actively and keep the draw."
  },
  {
    id: "philidor_002",
    label: "Philidor Defense 2",
    startFen: "8/8/8/8/3k4/8/3p4/3K1R1r b - - 0 1",
    result: "draw",
    explanation: "Hold the defensive setup and avoid allowing promotion."
  },
  {
    id: "philidor_003",
    label: "Philidor Defense 3",
    startFen: "8/8/8/8/4k3/8/4p3/4KR1r b - - 0 1",
    result: "draw",
    explanation: "Use Philidor defense: keep the rook ready for checks."
  }
];

fs.mkdirSync(CHUNKS, { recursive: true });

fs.writeFileSync(
  `${OUT}/progression.json`,
  JSON.stringify({
    order: ["philidor_basic"],
    themes: {
      philidor_basic: {
        label: "Philidor Basic Defense",
        chunkFiles: ["chunk_001.json"],
        maxSecondsPerMove: 5,
        mode: "convert"
      }
    }
  }, null, 2)
);

fs.writeFileSync(
  `${CHUNKS}/chunk_001.json`,
  JSON.stringify(positions, null, 2)
);

console.log("DONE: generated starter Philidor data.");
