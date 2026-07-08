import { Chess } from "chess.js";

const tests = [
  "8/8/8/8/8/3k4/3P4/3K1R1r b - - 0 1",
  "8/8/8/8/8/4k3/4P3/4KR1r b - - 0 1",
  "8/8/8/8/8/2k5/2P5/2K2R1r b - - 0 1"
];

for (const fen of tests) {
  try {
    const g = new Chess(fen);
    console.log("LEGAL", fen);
    console.log(g.ascii());
    console.log(g.moves());
  } catch (e) {
    console.log("BAD", fen, e.message);
  }
}
