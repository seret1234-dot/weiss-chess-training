import fs from "fs";
import { Chess } from "chess.js";

const OUT = "public/data/endgames/lucena";
const CHUNKS = `${OUT}/chunks`;

const THEMES = [
  ["basic_bridge", "Basic Bridge Building"],
  ["side_checks", "Side Checks"],
  ["checking_distance", "Checking Distance"],
  ["short_side_punish", "Short Side Defense Punishment"],
  ["long_side_defense", "Long Side Defense"],
  ["cut_off_king", "Cutting Off the King"],
  ["central_pawn", "Central Pawn"],
  ["bishop_pawn", "Bishop Pawn"],
  ["knight_pawn", "Knight Pawn"],
  ["rook_pawn_special", "Rook Pawn Special Cases"],
  ["bridge_timing", "Bridge Timing"],
  ["wrong_bridge", "Wrong Bridge Attempts"],
  ["precision_wins", "Precise Engine Wins"],
  ["conversion_after_checks", "Conversion After Checks"]
];

const FILES = ["b", "c", "d", "e", "f", "g"];

function sq(file, rank) {
  return `${file}${rank}`;
}

function idx(file) {
  return "abcdefgh".indexOf(file);
}

function mirror(file) {
  return "abcdefgh"[7 - idx(file)];
}

function buildFen(pieces, turn = "w") {
  const board = {};

  for (const p of pieces) {
    board[p.square] = p.piece;
  }

  const rows = [];

  for (let r = 8; r >= 1; r--) {
    let row = "";
    let empty = 0;

    for (const f of "abcdefgh") {
      const piece = board[`${f}${r}`];

      if (!piece) {
        empty++;
      } else {
        if (empty) {
          row += empty;
          empty = 0;
        }
        row += piece;
      }
    }

    if (empty) row += empty;
    rows.push(row);
  }

  return `${rows.join("/")} ${turn} - - 0 1`;
}

function legal(fen) {
  try {
    const g = new Chess(fen);

    if (g.isCheckmate()) return false;
    if (g.isStalemate()) return false;

    return true;
  } catch {
    return false;
  }
}

function createPosition(themeId, themeLabel, distance, seed) {
  let pawnFile = FILES[seed % FILES.length];

  if (seed % 2 === 1) {
    pawnFile = mirror(pawnFile);
  }

  const leftSide = idx(pawnFile) <= 3;

  const blackKingFile = leftSide ? "h" : "a";
  const blackRookFile = leftSide ? "a" : "h";

  let pawnRank = 5;
  let whiteKingRank = 6;
  let whiteRookRank = 4;

  if (distance === 1) {
    pawnRank = 7;
    whiteKingRank = 8;
    whiteRookRank = 4;
  }

  if (distance === 2) {
    pawnRank = 7;
    whiteKingRank = 8;
    whiteRookRank = 3;
  }

  if (distance === 3) {
    pawnRank = 6;
    whiteKingRank = 7;
    whiteRookRank = 4;
  }

  if (distance === 4) {
    pawnRank = 6;
    whiteKingRank = 7;
    whiteRookRank = 2;
  }

  if (distance === 5) {
    pawnRank = 5;
    whiteKingRank = 6;
    whiteRookRank = 1;
  }

  let blackKingRank = Math.max(3, pawnRank - 1);
  let blackRookRank = 1;

  if (themeId === "side_checks") {
    blackRookRank = whiteKingRank;
  }

  if (themeId === "checking_distance") {
    blackRookRank = 1;
    whiteRookRank = 4;
  }

  if (themeId === "short_side_punish") {
    blackRookRank = 7;
  }

  if (themeId === "long_side_defense") {
    blackRookRank = 1;
  }

  if (themeId === "cut_off_king") {
    blackKingRank = Math.max(3, pawnRank - 2);
  }

  if (themeId === "bridge_timing") {
    whiteRookRank = 4;
  }

  if (themeId === "wrong_bridge") {
    whiteRookRank = 5;
  }

  if (themeId === "precision_wins") {
    whiteRookRank = seed % 2 === 0 ? 4 : 3;
  }

  if (themeId === "conversion_after_checks") {
    blackRookRank = whiteKingRank;
  }

  const pieces = [
    {
      square: sq(pawnFile, whiteKingRank),
      piece: "K"
    },
    {
      square: sq(pawnFile, pawnRank),
      piece: "P"
    },
    {
      square: sq(
        idx(pawnFile) < 4
          ? String.fromCharCode(pawnFile.charCodeAt(0) + 1)
          : String.fromCharCode(pawnFile.charCodeAt(0) - 1),
        whiteRookRank
      ),
      piece: "R"
    },
    {
      square: sq(blackKingFile, blackKingRank),
      piece: "k"
    },
    {
      square: sq(blackRookFile, blackRookRank),
      piece: "r"
    }
  ];

  const fen = buildFen(pieces);

  return {
    id: `${themeId}_d${distance}_${seed}`,
    label: `${themeLabel} ${distance}-move conversion #${seed}`,
    startFen: fen,
    result: "win",
    lucenaDistance: distance,
    explanation:
      `Lucena technique: ${themeLabel}. Convert the position by promoting safely against best defense.`
  };
}

fs.mkdirSync(CHUNKS, { recursive: true });

const progression = {
  order: THEMES.map(([id]) => id),
  themes: {}
};

let total = 0;

for (const [themeId, themeLabel] of THEMES) {
  const positions = [];

  for (let distance = 1; distance <= 5; distance++) {
    for (let i = 1; i <= 30; i++) {
      const p = createPosition(themeId, themeLabel, distance, i);

      if (legal(p.startFen)) {
        positions.push(p);
      }
    }
  }

  const chunkFiles = [];

  for (let c = 0; c < positions.length; c += 30) {
    const chunkIndex = Math.floor(c / 30) + 1;

    const chunkName =
      `${themeId}_chunk_${String(chunkIndex).padStart(3, "0")}.json`;

    chunkFiles.push(chunkName);

    fs.writeFileSync(
      `${CHUNKS}/${chunkName}`,
      JSON.stringify(positions.slice(c, c + 30), null, 2)
    );
  }

  progression.themes[themeId] = {
    label: themeLabel,
    chunkFiles,
    maxSecondsPerMove: 5,
    mode: "convert"
  };

  console.log(`${themeLabel}: ${positions.length} positions`);
  total += positions.length;
}

fs.writeFileSync(
  `${OUT}/progression.json`,
  JSON.stringify(progression, null, 2)
);

console.log(`DONE: generated ${total} Lucena positions.`);
