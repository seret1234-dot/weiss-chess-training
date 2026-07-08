import fs from "fs";
import path from "path";

const OUT_DIR = path.join(process.cwd(), "public", "data", "endgames", "philidor");
fs.mkdirSync(OUT_DIR, { recursive: true });

const themes = [
  "Side Checks",
  "Rook Behind Pawn",
  "King Cutoff Defense",
  "Checking Distance",
];

function fen(wk, wr, bk, br, side = "b") {
  const board = Array.from({ length: 8 }, () => Array(8).fill("1"));

  function put(square, piece) {
    const file = square.charCodeAt(0) - 97;
    const rank = Number(square[1]) - 1;
    board[7 - rank][file] = piece;
  }

  put(wk, "K");
  put(wr, "R");
  put(bk, "k");
  put(br, "r");

  return board
    .map((row) => {
      let out = "";
      let empty = 0;
      for (const c of row) {
        if (c === "1") empty++;
        else {
          if (empty) out += empty;
          empty = 0;
          out += c;
        }
      }
      if (empty) out += empty;
      return out;
    })
    .join("/") + ` ${side} - - 0 1`;
}

const positions = [
  {
    theme: "Side Checks",
    items: [
      ["e5", "a7", "e7", "a1"],
      ["d5", "h7", "d7", "h1"],
      ["e4", "a6", "e6", "a1"],
      ["d4", "h6", "d6", "h1"],
    ],
  },
  {
    theme: "Rook Behind Pawn",
    items: [
      ["e5", "e7", "e8", "a1"],
      ["d5", "d7", "d8", "h1"],
      ["c5", "c7", "c8", "h1"],
      ["f5", "f7", "f8", "a1"],
    ],
  },
  {
    theme: "King Cutoff Defense",
    items: [
      ["e5", "a7", "g7", "a1"],
      ["d5", "h7", "b7", "h1"],
      ["e4", "a6", "g6", "a1"],
      ["d4", "h6", "b6", "h1"],
    ],
  },
  {
    theme: "Checking Distance",
    items: [
      ["e5", "a7", "e7", "h1"],
      ["d5", "h7", "d7", "a1"],
      ["c5", "a7", "c7", "h1"],
      ["f5", "h7", "f7", "a1"],
    ],
  },
];

const progression = [];

for (const group of positions) {
  const safeTheme = group.theme.toLowerCase().replaceAll(" ", "_");
  const puzzles = group.items.map(([wk, wr, bk, br], i) => ({
    id: `${safeTheme}_${i + 1}`,
    fen: fen(wk, wr, bk, br, "b"),
    title: group.theme,
    goal: "Hold the draw with the Philidor defensive method.",
    solution: [],
    explanation:
      "Keep the rook active, prevent the attacking king from advancing, and use side checks or rook-behind-pawn defense when the pawn advances.",
  }));

  const file