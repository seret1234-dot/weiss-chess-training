import fs from "fs";
import path from "path";
import { Chess } from "chess.js";

const root = process.cwd();
const dataDir = path.join(root, "public/data/endgames/stalemate");

const CHUNK_SIZE = 30;
const MAX_CHUNKS_PER_THEME = 30;
const MAX_POSITIONS_PER_THEME = CHUNK_SIZE * MAX_CHUNKS_PER_THEME;

const files = "abcdefgh";
const ranks = "12345678";
const squares = [];

for (const f of files) {
  for (const r of ranks) squares.push(f + r);
}

function resetOutputDir() {
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
}

function kingsTouch(a, b) {
  const df = Math.abs(files.indexOf(a[0]) - files.indexOf(b[0]));
  const dr = Math.abs(ranks.indexOf(a[1]) - ranks.indexOf(b[1]));
  return Math.max(df, dr) <= 1;
}

function fenFromPieces(pieces, turn = "b") {
  const board = {};

  for (const p of pieces) {
    board[p.square] = p.piece;
  }

  const rows = [];

  for (let r = 7; r >= 0; r--) {
    let row = "";
    let empty = 0;

    for (let f = 0; f < 8; f++) {
      const sq = files[f] + ranks[r];
      const piece = board[sq];

      if (piece) {
        if (empty) row += empty;
        empty = 0;
        row += piece;
      } else {
        empty++;
      }
    }

    if (empty) row += empty;
    rows.push(row);
  }

  return `${rows.join("/")} ${turn} - - 0 1`;
}

function safeChess(fen) {
  try {
    return new Chess(fen);
  } catch {
    return null;
  }
}

function isInCheck(game) {
  if (typeof game.inCheck === "function") return game.inCheck();
  if (typeof game.isCheck === "function") return game.isCheck();
  return false;
}

function uniquePush(list, seen, puzzle) {
  const key = `${puzzle.fen}|${puzzle.solution}|${puzzle.promotion || ""}`;
  if (seen.has(key)) return false;

  seen.add(key);
  list.push(puzzle);
  return true;
}

function enough(list) {
  return list.length >= MAX_POSITIONS_PER_THEME;
}

function writeTheme(themeId, themeName, puzzles, manifestChunks) {
  const themeDir = path.join(dataDir, themeId);
  fs.mkdirSync(themeDir, { recursive: true });

  const limited = puzzles.slice(0, MAX_POSITIONS_PER_THEME);

  for (let i = 0; i < limited.length; i += CHUNK_SIZE) {
    const chunkNumber = Math.floor(i / CHUNK_SIZE) + 1;
    const chunk = limited.slice(i, i + CHUNK_SIZE);
    const file = `chunk_${String(chunkNumber).padStart(3, "0")}.json`;

    fs.writeFileSync(
      path.join(themeDir, file),
      JSON.stringify(
        {
          id: `${themeId}-${chunkNumber}`,
          theme: themeName,
          puzzles: chunk,
        },
        null,
        2
      ),
      "utf8"
    );

    manifestChunks.push({
      id: `${themeId}-${chunkNumber}`,
      theme: themeName,
      name: `${themeName} ${chunkNumber}`,
      file: `${themeId}/${file}`,
      count: chunk.length,
    });
  }

  console.log(
    `${themeName}: ${limited.length} positions (${Math.ceil(
      limited.length / CHUNK_SIZE
    )} chunks)`
  );
}

function generateBlackQueenSacrificeStalemates() {
  const puzzles = [];
  const seen = new Set();
  let id = 1;

  outer:
  for (const wk of squares) {
    for (const bk of squares) {
      if (wk === bk || kingsTouch(wk, bk)) continue;

      for (const bq of squares) {
        if (bq === wk || bq === bk) continue;

        const fen = fenFromPieces(
          [
            { square: wk, piece: "K" },
            { square: bk, piece: "k" },
            { square: bq, piece: "q" },
          ],
          "b"
        );

        const game = safeChess(fen);
        if (!game) continue;

        // Black to move must not already be in check.
        if (isInCheck(game)) continue;

        for (const move of game.moves({ verbose: true })) {
          if (move.piece !== "q") continue;

          const test = new Chess(fen);
          test.move({
            from: move.from,
            to: move.to,
          });

          if (test.isStalemate()) {
            uniquePush(puzzles, seen, {
              id: `black-queen-stalemate-${String(id).padStart(5, "0")}`,
              fen,
              solution: move.from + move.to,
              san: move.san,
              goal: "stalemate",
              theme: "Queen sacrifice stalemate",
              instruction: "Black to move. Save the game by stalemate.",
            });

            id++;
            if (enough(puzzles)) break outer;
          }
        }
      }
    }
  }

  return puzzles;
}

function generateBlackRookSacrificeStalemates() {
  const puzzles = [];
  const seen = new Set();
  let id = 1;

  outer:
  for (const wk of squares) {
    for (const bk of squares) {
      if (wk === bk || kingsTouch(wk, bk)) continue;

      for (const br of squares) {
        if (br === wk || br === bk) continue;

        const fen = fenFromPieces(
          [
            { square: wk, piece: "K" },
            { square: bk, piece: "k" },
            { square: br, piece: "r" },
          ],
          "b"
        );

        const game = safeChess(fen);
        if (!game) continue;

        // Black to move must not already be in check.
        if (isInCheck(game)) continue;

        for (const move of game.moves({ verbose: true })) {
          if (move.piece !== "r") continue;

          const test = new Chess(fen);
          test.move({
            from: move.from,
            to: move.to,
          });

          if (test.isStalemate()) {
            uniquePush(puzzles, seen, {
              id: `black-rook-stalemate-${String(id).padStart(5, "0")}`,
              fen,
              solution: move.from + move.to,
              san: move.san,
              goal: "stalemate",
              theme: "Rook sacrifice stalemate",
              instruction: "Black to move. Save the game by stalemate.",
            });

            id++;
            if (enough(puzzles)) break outer;
          }
        }
      }
    }
  }

  return puzzles;
}

function generateWhiteUnderpromotionStalemateTricks() {
  const puzzles = [];
  const seen = new Set();
  let id = 1;

  for (const bk of squares) {
    for (const wk of squares) {
      if (bk === wk || kingsTouch(bk, wk)) continue;

      for (const pawn of squares) {
        if (pawn === bk || pawn === wk) continue;
        if (!pawn.endsWith("7")) continue;

        const target = pawn[0] + "8";

        const fen = fenFromPieces(
          [
            { square: bk, piece: "k" },
            { square: wk, piece: "K" },
            { square: pawn, piece: "P" },
          ],
          "w"
        );

        const game = safeChess(fen);
        if (!game) continue;

        // White to move must not already be in check.
        if (isInCheck(game)) continue;

        let queenStalemates = false;

        try {
          const q = new Chess(fen);
          q.move({
            from: pawn,
            to: target,
            promotion: "q",
          });
          queenStalemates = q.isStalemate();
        } catch {
          continue;
        }

        if (!queenStalemates) continue;

        for (const promotion of ["r", "b", "n"]) {
          try {
            const test = new Chess(fen);
            const move = test.move({
              from: pawn,
              to: target,
              promotion,
            });

            if (move && !test.isStalemate()) {
              uniquePush(puzzles, seen, {
                id: `underpromotion-stalemate-${String(id).padStart(5, "0")}`,
                fen,
                solution: pawn + target + promotion,
                promotion,
                san: move.san,
                goal: "underpromotion",
                theme: "Underpromotion stalemate trick",
                instruction:
                  "White to move. Queen promotion stalemates. Find the underpromotion.",
              });

              id++;
              if (enough(puzzles)) return puzzles;
            }
          } catch {
            // skip illegal underpromotions
          }
        }
      }
    }
  }

  return puzzles;
}

console.log("GENERATING CORRECT STALEMATE RESOURCE CONTENT...");

resetOutputDir();

const manifestChunks = [];

writeTheme(
  "queen-sacrifice-stalemate",
  "Queen sacrifice stalemate",
  generateBlackQueenSacrificeStalemates(),
  manifestChunks
);

writeTheme(
  "rook-sacrifice-stalemate",
  "Rook sacrifice stalemate",
  generateBlackRookSacrificeStalemates(),
  manifestChunks
);

writeTheme(
  "underpromotion-stalemate-tricks",
  "Underpromotion stalemate trick",
  generateWhiteUnderpromotionStalemateTricks(),
  manifestChunks
);

fs.writeFileSync(
  path.join(dataDir, "manifest.json"),
  JSON.stringify(
    {
      title: "Stalemate Resources",
      chunkSize: CHUNK_SIZE,
      maxChunksPerTheme: MAX_CHUNKS_PER_THEME,
      chunks: manifestChunks,
    },
    null,
    2
  ),
  "utf8"
);

console.log("DONE");
console.log("Total chunks:", manifestChunks.length);
console.log("Output:", dataDir);