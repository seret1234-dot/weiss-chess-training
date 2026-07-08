import fs from "fs";
import { Chess } from "chess.js";

const OUT = "public/data/endgames/lucena";
const CHUNKS = `${OUT}/chunks`;

const themes = [
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

const filesByTheme = {
  central_pawn: ["d", "e"],
  bishop_pawn: ["c", "f"],
  knight_pawn: ["b", "g"],
  rook_pawn_special: ["a", "h"]
};

const allFiles = ["b", "c", "d", "e", "f", "g"];

function fileIndex(f) {
  return "abcdefgh".indexOf(f);
}

function sq(file, rank) {
  return `${file}${rank}`;
}

function mirrorFile(file) {
  return "abcdefgh"[7 - fileIndex(file)];
}

function addPiece(board, square, piece) {
  board[square] = piece;
}

function fenFromPieces(pieces, turn = "w") {
  const board = {};
  for (const p of pieces) addPiece(board, p.square, p.piece);

  const rows = [];
  for (let rank = 8; rank >= 1; rank--) {
    let row = "";
    let empty = 0;

    for (const file of "abcdefgh") {
      const piece = board[`${file}${rank}`];
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

function isLegalFen(fen) {
  try {
    const g = new Chess(fen);
    return g.moves().length > 0;
  } catch {
    return false;
  }
}

function makePosition(themeId, themeLabel, distance, variant) {
  const files = filesByTheme[themeId] || allFiles;
  let pawnFile = files[variant % files.length];

  const mirrored = variant >= 3;
  if (mirrored) pawnFile = mirrorFile(pawnFile);

  const fi = fileIndex(pawnFile);
  const left = fi <= 3;
  const enemyKingFile = left ? "h" : "a";
  const enemyRookFile = left ? "a" : "h";

  let pawnRank = 7;
  let whiteKingRank = 8;
  let whiteRookRank = 4;
  let blackKingRank = 6;
  let blackRookRank = 1;

  if (distance === 2) {
    whiteRookRank = 3;
    blackRookRank = 2;
  }

  if (distance === 3) {
    pawnRank = 6;
    whiteKingRank = 7;
    whiteRookRank = 4;
    blackKingRank = 5;
    blackRookRank = 1;
  }

  if (distance === 4) {
    pawnRank = 6;
    whiteKingRank = 7;
    whiteRookRank = 2;
    blackKingRank = 5;
    blackRookRank = 8;
  }

  if (distance === 5) {
    pawnRank = 5;
    whiteKingRank = 6;
    whiteRookRank = 1;
    blackKingRank = 4;
    blackRookRank = 8;
  }

  // Theme flavor adjustments.
  if (themeId === "side_checks") blackRookRank = whiteKingRank;
  if (themeId === "checking_distance") whiteRookRank = Math.max(1, whiteKingRank - 4);
  if (themeId === "short_side_punish") blackRookRank = 7;
  if (themeId === "long_side_defense") blackRookRank = 1;
  if (themeId === "cut_off_king") blackKingRank = Math.max(3, pawnRank - 2);
  if (themeId === "bridge_timing") whiteRookRank = 4;
  if (themeId === "wrong_bridge") whiteRookRank = 5;
  if (themeId === "precision_wins") whiteRookRank = variant % 2 === 0 ? 4 : 3;
  if (themeId === "conversion_after_checks") blackRookRank = whiteKingRank;

  const pieces = [
    { square: sq(pawnFile, whiteKingRank), piece: "K" },
    { square: sq(pawnFile, pawnRank), piece: "P" },
    { square: sq(pawnFile, whiteRookRank), piece: "R" },
    { square: sq(enemyKingFile, blackKingRank), piece: "k" },
    { square: sq(enemyRookFile, blackRookRank), piece: "r" }
  ];

  const fen = fenFromPieces(pieces);

  return {
    id: `${themeId}_d${distance}_${variant + 1}`,
    label: `${themeLabel} — ${distance} move${distance === 1 ? "" : "s"} from finish #${variant + 1}`,
    startFen: fen,
    result: "win",
    lucenaDistance: distance,
    theme: themeId,
    explanation:
      `Lucena: ${themeLabel}. Goal: promote safely or reach a clearly winning conversion. Distance label: ${distance}.`
  };
}

fs.mkdirSync(CHUNKS, { recursive: true });

const progression = {
  order: themes.map(([id]) => id),
  themes: {}
};

let total = 0;

for (const [themeId, themeLabel] of themes) {
  const positions = [];

  for (let distance = 1; distance <= 5; distance++) {
    for (let variant = 0; variant < 6; variant++) {
      const p = makePosition(themeId, themeLabel, distance, variant);

      if (isLegalFen(p.startFen)) {
        positions.push(p);
      } else {
        console.log("Skipped illegal:", p.id, p.startFen);
      }
    }
  }

  const chunkFile = `${themeId}_chunk_001.json`;

  progression.themes[themeId] = {
    label: themeLabel,
    chunkFiles: [chunkFile],
    maxSecondsPerMove: 5,
    mode: "convert"
  };

  fs.writeFileSync(`${CHUNKS}/${chunkFile}`, JSON.stringify(positions, null, 2));
  console.log(`${themeLabel}: ${positions.length} positions`);
  total += positions.length;
}

fs.writeFileSync(`${OUT}/progression.json`, JSON.stringify(progression, null, 2));

console.log(`DONE: generated ${total} Lucena positions across ${themes.length} themes.`);
