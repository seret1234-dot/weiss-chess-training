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

const files = ["b", "c", "d", "e", "f", "g"];

function fen(pieces, turn = "b") {
  const board = {};
  for (const [sq, pc] of pieces) board[sq] = pc;

  const rows = [];
  for (let r = 8; r >= 1; r--) {
    let row = "";
    let empty = 0;
    for (const f of "abcdefgh") {
      const pc = board[`${f}${r}`];
      if (!pc) empty++;
      else {
        if (empty) row += empty;
        empty = 0;
        row += pc;
      }
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return `${rows.join("/")} ${turn} - - 0 1`;
}

function legal(f) {
  try {
    new Chess(f);
    return true;
  } catch {
    return false;
  }
}

function make(themeId, label, i) {
  const pf = files[i % files.length];
  const pi = "abcdefgh".indexOf(pf);
  const left = pi <= 3;

  const wk = `${pf}${Math.min(8, 2 + (i % 5))}`;
  const wp = `${pf}${Math.min(6, 2 + (i % 4))}`;
  const bkFile = left ? "h" : "a";
  const brFile = left ? "a" : "h";

  let wr = `${left ? "f" : "c"}1`;
  let br = `${brFile}${1 + (i % 6)}`;
  let bk = `${bkFile}${4 + (i % 3)}`;

  if (themeId === "third_rank_defense") br = `${brFile}3`;
  if (themeId === "side_checks") br = `${brFile}${Number(wk[1])}`;
  if (themeId === "rook_behind_pawn") br = `${pf}1`;
  if (themeId === "king_cutoff") bk = `${bkFile}${Number(wp[1]) + 1}`;
  if (themeId === "checking_distance") br = `${brFile}${Math.max(1, Number(wk[1]) - 3)}`;
  if (themeId === "pawn_reaches_sixth") {
    br = `${brFile}6`;
    bk = `${bkFile}7`;
  }
  if (themeId === "short_side") br = `${left ? "a" : "h"}${Number(wk[1])}`;
  if (themeId === "long_side") br = `${left ? "h" : "a"}${Number(wk[1])}`;
  if (themeId === "rook_activity") br = `${brFile}${2 + (i % 5)}`;
  if (themeId === "last_chance_checks") br = `${brFile}8`;

  const f = fen([
    [wk, "K"],
    [wr, "R"],
    [wp, "P"],
    [bk, "k"],
    [br, "r"],
  ], "b");

  return {
    id: `${themeId}_${String(i).padStart(3, "0")}`,
    label: `${label} #${i}`,
    startFen: f,
    result: "draw",
    explanation: `${label}: find the defensive rook move that holds the draw.`
  };
}

fs.mkdirSync(CHUNKS, { recursive: true });

const progression = {
  order: themes.map(([id]) => id),
  themes: {}
};

let total = 0;

for (const [id, label] of themes) {
  const positions = [];
  let i = 1;
  let guard = 0;

  while (positions.length < 30 && guard < 300) {
    guard++;
    const p = make(id, label, i++);
    if (!legal(p.startFen)) continue;
    if (positions.some((x) => x.startFen === p.startFen)) continue;
    positions.push(p);
  }

  const chunkFile = `${id}_chunk_001.json`;
  fs.writeFileSync(`${CHUNKS}/${chunkFile}`, JSON.stringify(positions, null, 2));

  progression.themes[id] = {
    label,
    chunkFiles: [chunkFile],
    maxSecondsPerMove: 5,
    mode: "convert"
  };

  console.log(`${label}: ${positions.length}`);
  total += positions.length;
}

fs.writeFileSync(`${OUT}/progression.json`, JSON.stringify(progression, null, 2));
console.log(`DONE: generated ${total} varied Philidor positions.`);
