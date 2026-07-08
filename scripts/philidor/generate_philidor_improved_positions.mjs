import fs from "fs";
import { Chess } from "chess.js";

const OUT = "public/data/endgames/philidor";
const CHUNKS = `${OUT}/chunks`;

const THEMES = [
  ["third_rank_defense", "Third-rank Defense"],
  ["side_checks", "Side Checks"],
  ["rook_behind_pawn", "Rook Behind Pawn"],
  ["king_cutoff", "King Cutoff Defense"],
  ["checking_distance", "Checking Distance"]
];

const files = ["c", "d", "e", "f"];

function makeFen(pieces) {
  const board = {};

  for (const [sq, pc] of pieces) {
    board[sq] = pc;
  }

  const rows = [];

  for (let r = 8; r >= 1; r--) {
    let row = "";
    let empty = 0;

    for (const f of "abcdefgh") {
      const pc = board[`${f}${r}`];

      if (!pc) {
        empty++;
      } else {
        if (empty) {
          row += empty;
          empty = 0;
        }
        row += pc;
      }
    }

    if (empty) row += empty;
    rows.push(row);
  }

  return `${rows.join("/")} b - - 0 1`;
}

function legalAndSafe(fen) {
  try {
    const g = new Chess(fen);

    if (g.isCheckmate()) return false;
    if (g.isStalemate()) return false;

    const moves = g.moves();

    // reject if black can instantly win
    if (moves.some((m) => m.includes("#"))) return false;

    return true;
  } catch {
    return false;
  }
}

function build(themeId, seed) {
  const pf = files[seed % files.length];
  const pi = "abcdefgh".indexOf(pf);

  const left = pi <= 3;

  const wk = `${pf}6`;
  const wp = `${pf}5`;

  const wrFile = left ? "g" : "b";
  const wr = `${wrFile}${1 + (seed % 2)}`;

  const bkFile = pf;
  const bk = `${bkFile}7`;

  let br;

  if (themeId === "third_rank_defense") {
    br = `${left ? "a" : "h"}3`;
  } else if (themeId === "side_checks") {
    br = `${left ? "a" : "h"}6`;
  } else if (themeId === "rook_behind_pawn") {
    br = `${pf}1`;
  } else if (themeId === "king_cutoff") {
    br = `${left ? "a" : "h"}4`;
  } else {
    br = `${left ? "a" : "h"}2`;
  }

  return makeFen([
    [wk, "K"],
    [wp, "P"],
    [wr, "R"],
    [bk, "k"],
    [br, "r"],
  ]);
}

fs.mkdirSync(CHUNKS, { recursive: true });

const progression = {
  order: THEMES.map(([id]) => id),
  themes: {}
};

let total = 0;

for (const [themeId, label] of THEMES) {
  const positions = [];
  const used = new Set();

  for (let seed = 1; seed <= 200 && positions.length < 30; seed++) {
    const fen = build(themeId, seed);

    if (!legalAndSafe(fen)) continue;
    if (used.has(fen)) continue;

    used.add(fen);

    positions.push({
      id: `${themeId}_${String(positions.length + 1).padStart(3, "0")}`,
      label: `${label} #${positions.length + 1}`,
      startFen: fen,
      result: "draw",
      explanation:
        `${label}: hold the draw with active rook defense.`
    });
  }

  const chunkFile = `${themeId}_chunk_001.json`;

  fs.writeFileSync(
    `${CHUNKS}/${chunkFile}`,
    JSON.stringify(positions, null, 2)
  );

  progression.themes[themeId] = {
    label,
    chunkFiles: [chunkFile],
    maxSecondsPerMove: 5,
    mode: "convert"
  };

  console.log(`${label}: ${positions.length}`);
  total += positions.length;
}

fs.writeFileSync(
  `${OUT}/progression.json`,
  JSON.stringify(progression, null, 2)
);

console.log(`DONE: generated ${total} improved Philidor positions.`);
