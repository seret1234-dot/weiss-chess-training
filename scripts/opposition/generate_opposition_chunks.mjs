import fs from "fs";
import path from "path";
import { Chess } from "chess.js";

const root = process.cwd();

const baseDir = path.join(root, "public", "data", "endgames", "opposition");
const chunksDir = path.join(baseDir, "chunks");

fs.mkdirSync(chunksDir, { recursive: true });

for (const file of fs.readdirSync(chunksDir)) {
  if (file.endsWith(".json")) fs.unlinkSync(path.join(chunksDir, file));
}

const CHUNK_SIZE = 30;
const FILES = "abcdefgh";

function sq(file, rank) {
  return FILES[file] + String(rank + 1);
}

function inside(file, rank) {
  return file >= 0 && file < 8 && rank >= 0 && rank < 8;
}

function same(a, b) {
  return a.file === b.file && a.rank === b.rank;
}

function kingDistance(a, b) {
  return Math.max(Math.abs(a.file - b.file), Math.abs(a.rank - b.rank));
}

function legalKings(wk, bk) {
  return kingDistance(wk, bk) > 1;
}

function makeFen(wk, wp, bk, side = "w") {
  const board = Array.from({ length: 8 }, () => Array(8).fill(""));

  board[wk.rank][wk.file] = "K";
  board[wp.rank][wp.file] = "P";
  board[bk.rank][bk.file] = "k";

  const rows = [];

  for (let r = 7; r >= 0; r--) {
    let row = "";
    let empty = 0;

    for (let f = 0; f < 8; f++) {
      const piece = board[r][f];

      if (!piece) {
        empty++;
      } else {
        if (empty) row += empty;
        empty = 0;
        row += piece;
      }
    }

    if (empty) row += empty;
    rows.push(row);
  }

  return `${rows.join("/")} ${side} - - 0 1`;
}

function isLegalFen(fen) {
  try {
    const game = new Chess(fen);
    return game.moves().length > 0;
  } catch {
    return false;
  }
}

function legalMoveFromFen(fen, uci) {
  try {
    const game = new Chess(fen);

    const move = game.move({
      from: uci.slice(0, 2),
      to: uci.slice(2, 4),
      promotion: uci[4],
    });

    return Boolean(move);
  } catch {
    return false;
  }
}

function add(out, themeKey, themeName, wk, wp, bk, move, explanation) {
  if (!inside(wk.file, wk.rank)) return;
  if (!inside(wp.file, wp.rank)) return;
  if (!inside(bk.file, bk.rank)) return;

  if (!legalKings(wk, bk)) return;
  if (same(wk, wp)) return;
  if (same(bk, wp)) return;
  if (wp.rank <= 0 || wp.rank >= 7) return;

  const fen = makeFen(wk, wp, bk, "w");

  if (!isLegalFen(fen)) return;
  if (!legalMoveFromFen(fen, move)) return;

  out.push({
    id: `${themeKey}_${String(out.length + 1).padStart(5, "0")}`,
    label: `${themeName} #${out.length + 1}`,
    fen,
    allowedMoves: [move],
    theme: themeName,
    result: "win",
    explanation,
  });
}

function unique(list) {
  const seen = new Set();
  const result = [];

  for (const p of list) {
    const key = `${p.fen}|${p.allowedMoves.join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(p);
  }

  return result;
}

function finalizeTheme(themeKey, themeName, list) {
  return unique(list).map((p, idx) => ({
    ...p,
    id: `${themeKey}_${String(idx + 1).padStart(5, "0")}`,
    label: `${themeName} #${idx + 1}`,
  }));
}

function buildBasicOpposition() {
  const out = [];
  const key = "basic_opposition";
  const name = "Basic Opposition";

  for (let pawnFile = 0; pawnFile <= 7; pawnFile++) {
    for (let pawnRank = 1; pawnRank <= 5; pawnRank++) {
      const wp = { file: pawnFile, rank: pawnRank };

      const patterns = [
        {
          wk: { file: pawnFile - 1, rank: pawnRank - 1 },
          bk: { file: pawnFile, rank: pawnRank + 2 },
          to: { file: pawnFile, rank: pawnRank - 1 },
        },
        {
          wk: { file: pawnFile + 1, rank: pawnRank - 1 },
          bk: { file: pawnFile, rank: pawnRank + 2 },
          to: { file: pawnFile, rank: pawnRank - 1 },
        },
        {
          wk: { file: pawnFile - 1, rank: pawnRank },
          bk: { file: pawnFile + 1, rank: pawnRank + 2 },
          to: { file: pawnFile, rank: pawnRank + 1 },
        },
        {
          wk: { file: pawnFile + 1, rank: pawnRank },
          bk: { file: pawnFile - 1, rank: pawnRank + 2 },
          to: { file: pawnFile, rank: pawnRank + 1 },
        },
        {
          wk: { file: pawnFile - 2, rank: pawnRank - 1 },
          bk: { file: pawnFile, rank: pawnRank + 2 },
          to: { file: pawnFile - 1, rank: pawnRank - 1 },
        },
        {
          wk: { file: pawnFile + 2, rank: pawnRank - 1 },
          bk: { file: pawnFile, rank: pawnRank + 2 },
          to: { file: pawnFile + 1, rank: pawnRank - 1 },
        },
      ];

      for (const p of patterns) {
        if (!inside(p.to.file, p.to.rank)) continue;

        const move = sq(p.wk.file, p.wk.rank) + sq(p.to.file, p.to.rank);

        add(
          out,
          key,
          name,
          p.wk,
          wp,
          p.bk,
          move,
          "Take opposition before pushing the pawn.",
        );
      }
    }
  }

  return finalizeTheme(key, name, out);
}

function buildKeySquares() {
  const out = [];
  const key = "key_squares";
  const name = "Key Squares";

  for (let pawnFile = 0; pawnFile <= 7; pawnFile++) {
    for (let pawnRank = 1; pawnRank <= 4; pawnRank++) {
      const wp = { file: pawnFile, rank: pawnRank };

      const targetRanks =
        pawnRank === 1
          ? [pawnRank + 2, pawnRank + 3]
          : [pawnRank + 2];

      for (const targetRank of targetRanks) {
        const targetFiles = [
          pawnFile - 1,
          pawnFile,
          pawnFile + 1,
        ];

        for (const targetFile of targetFiles) {
          const starts = [
            { file: targetFile - 1, rank: targetRank - 1 },
            { file: targetFile + 1, rank: targetRank - 1 },
            { file: targetFile, rank: targetRank - 1 },
            { file: targetFile - 1, rank: targetRank },
            { file: targetFile + 1, rank: targetRank },
          ];

          for (const wk of starts) {
            const bkCandidates = [
              { file: pawnFile, rank: pawnRank + 4 },
              { file: pawnFile - 1, rank: pawnRank + 4 },
              { file: pawnFile + 1, rank: pawnRank + 4 },
            ];

            for (const bk of bkCandidates) {
              const to = { file: targetFile, rank: targetRank };
              if (!inside(to.file, to.rank)) continue;

              const move = sq(wk.file, wk.rank) + sq(to.file, to.rank);

              add(
                out,
                key,
                name,
                wk,
                wp,
                bk,
                move,
                "Reach a key square in front of the pawn.",
              );
            }
          }
        }
      }
    }
  }

  return finalizeTheme(key, name, out);
}

function buildPawnPushTiming() {
  const out = [];
  const key = "pawn_push_timing";
  const name = "Pawn Push Timing";

  for (let pawnFile = 0; pawnFile <= 7; pawnFile++) {
    for (let pawnRank = 1; pawnRank <= 5; pawnRank++) {
      const wp = { file: pawnFile, rank: pawnRank };

      const kingSupports = [
        { file: pawnFile, rank: pawnRank - 1 },
        { file: pawnFile - 1, rank: pawnRank },
        { file: pawnFile + 1, rank: pawnRank },
        { file: pawnFile - 1, rank: pawnRank - 1 },
        { file: pawnFile + 1, rank: pawnRank - 1 },
      ];

      const blackKings = [
        { file: pawnFile, rank: pawnRank + 3 },
        { file: pawnFile - 1, rank: pawnRank + 3 },
        { file: pawnFile + 1, rank: pawnRank + 3 },
        { file: pawnFile - 2, rank: pawnRank + 2 },
        { file: pawnFile + 2, rank: pawnRank + 2 },
      ];

      for (const wk of kingSupports) {
        for (const bk of blackKings) {
          const oneStep = sq(pawnFile, pawnRank) + sq(pawnFile, pawnRank + 1);

          add(
            out,
            key,
            name,
            wk,
            wp,
            bk,
            oneStep,
            "Push only when the king supports promotion.",
          );

          if (pawnRank === 1) {
            const twoStep = sq(pawnFile, pawnRank) + sq(pawnFile, pawnRank + 2);

            add(
              out,
              key,
              name,
              wk,
              wp,
              bk,
              twoStep,
              "Use the two-square push when it keeps the winning path.",
            );
          }
        }
      }
    }
  }

  return finalizeTheme(key, name, out);
}

function buildTriangulation() {
  const out = [];
  const key = "triangulation";
  const name = "Triangulation";

  for (let pawnFile = 1; pawnFile <= 6; pawnFile++) {
    for (let pawnRank = 2; pawnRank <= 4; pawnRank++) {
      const wp = { file: pawnFile, rank: pawnRank };

      const patterns = [
        {
          wk: { file: pawnFile - 1, rank: pawnRank - 1 },
          bk: { file: pawnFile + 1, rank: pawnRank + 2 },
          to: { file: pawnFile, rank: pawnRank - 1 },
        },
        {
          wk: { file: pawnFile + 1, rank: pawnRank - 1 },
          bk: { file: pawnFile - 1, rank: pawnRank + 2 },
          to: { file: pawnFile, rank: pawnRank - 1 },
        },
        {
          wk: { file: pawnFile - 1, rank: pawnRank },
          bk: { file: pawnFile + 1, rank: pawnRank + 2 },
          to: { file: pawnFile - 1, rank: pawnRank - 1 },
        },
        {
          wk: { file: pawnFile + 1, rank: pawnRank },
          bk: { file: pawnFile - 1, rank: pawnRank + 2 },
          to: { file: pawnFile + 1, rank: pawnRank - 1 },
        },
        {
          wk: { file: pawnFile, rank: pawnRank - 1 },
          bk: { file: pawnFile, rank: pawnRank + 2 },
          to: { file: pawnFile - 1, rank: pawnRank - 1 },
        },
        {
          wk: { file: pawnFile, rank: pawnRank - 1 },
          bk: { file: pawnFile, rank: pawnRank + 2 },
          to: { file: pawnFile + 1, rank: pawnRank - 1 },
        },
      ];

      for (const p of patterns) {
        const move = sq(p.wk.file, p.wk.rank) + sq(p.to.file, p.to.rank);

        add(
          out,
          key,
          name,
          p.wk,
          wp,
          p.bk,
          move,
          "Lose a tempo and gain opposition.",
        );
      }
    }
  }

  return finalizeTheme(key, name, out);
}

function buildShouldering() {
  const out = [];
  const key = "shouldering";
  const name = "Shouldering";

  for (let pawnFile = 0; pawnFile <= 7; pawnFile++) {
    for (let pawnRank = 1; pawnRank <= 4; pawnRank++) {
      const wp = { file: pawnFile, rank: pawnRank };

      const patterns = [
        {
          wk: { file: pawnFile - 1, rank: pawnRank },
          bk: { file: pawnFile + 2, rank: pawnRank + 2 },
          to: { file: pawnFile, rank: pawnRank + 1 },
        },
        {
          wk: { file: pawnFile + 1, rank: pawnRank },
          bk: { file: pawnFile - 2, rank: pawnRank + 2 },
          to: { file: pawnFile, rank: pawnRank + 1 },
        },
        {
          wk: { file: pawnFile - 1, rank: pawnRank - 1 },
          bk: { file: pawnFile + 2, rank: pawnRank + 1 },
          to: { file: pawnFile, rank: pawnRank },
        },
        {
          wk: { file: pawnFile + 1, rank: pawnRank - 1 },
          bk: { file: pawnFile - 2, rank: pawnRank + 1 },
          to: { file: pawnFile, rank: pawnRank },
        },
        {
          wk: { file: pawnFile, rank: pawnRank + 1 },
          bk: { file: pawnFile + 2, rank: pawnRank + 3 },
          to: { file: pawnFile + 1, rank: pawnRank + 2 },
        },
        {
          wk: { file: pawnFile, rank: pawnRank + 1 },
          bk: { file: pawnFile - 2, rank: pawnRank + 3 },
          to: { file: pawnFile - 1, rank: pawnRank + 2 },
        },
        {
          wk: { file: pawnFile - 2, rank: pawnRank },
          bk: { file: pawnFile + 2, rank: pawnRank + 1 },
          to: { file: pawnFile - 1, rank: pawnRank + 1 },
        },
        {
          wk: { file: pawnFile + 2, rank: pawnRank },
          bk: { file: pawnFile - 2, rank: pawnRank + 1 },
          to: { file: pawnFile + 1, rank: pawnRank + 1 },
        },
        {
          wk: { file: pawnFile - 1, rank: pawnRank + 1 },
          bk: { file: pawnFile + 2, rank: pawnRank + 2 },
          to: { file: pawnFile, rank: pawnRank + 2 },
        },
        {
          wk: { file: pawnFile + 1, rank: pawnRank + 1 },
          bk: { file: pawnFile - 2, rank: pawnRank + 2 },
          to: { file: pawnFile, rank: pawnRank + 2 },
        },
      ];

      for (const p of patterns) {
        const move = sq(p.wk.file, p.wk.rank) + sq(p.to.file, p.to.rank);

        add(
          out,
          key,
          name,
          p.wk,
          wp,
          p.bk,
          move,
          "Use the king to shoulder the enemy king away from the pawn path.",
        );
      }
    }
  }

  return finalizeTheme(key, name, out);
}

function buildBreakthrough() {
  const out = [];
  const key = "breakthrough";
  const name = "Breakthrough";

  for (let pawnFile = 0; pawnFile <= 7; pawnFile++) {
    for (let pawnRank = 2; pawnRank <= 5; pawnRank++) {
      const wp = { file: pawnFile, rank: pawnRank };

      const patterns = [
        {
          wk: { file: pawnFile, rank: pawnRank - 1 },
          bk: { file: pawnFile + 1, rank: pawnRank + 2 },
          to: { file: pawnFile + 1, rank: pawnRank },
        },
        {
          wk: { file: pawnFile, rank: pawnRank - 1 },
          bk: { file: pawnFile - 1, rank: pawnRank + 2 },
          to: { file: pawnFile - 1, rank: pawnRank },
        },
        {
          wk: { file: pawnFile - 1, rank: pawnRank - 1 },
          bk: { file: pawnFile + 1, rank: pawnRank + 2 },
          to: { file: pawnFile, rank: pawnRank },
        },
        {
          wk: { file: pawnFile + 1, rank: pawnRank - 1 },
          bk: { file: pawnFile - 1, rank: pawnRank + 2 },
          to: { file: pawnFile, rank: pawnRank },
        },
        {
          wk: { file: pawnFile - 1, rank: pawnRank },
          bk: { file: pawnFile + 2, rank: pawnRank + 2 },
          to: { file: pawnFile, rank: pawnRank + 1 },
        },
        {
          wk: { file: pawnFile + 1, rank: pawnRank },
          bk: { file: pawnFile - 2, rank: pawnRank + 2 },
          to: { file: pawnFile, rank: pawnRank + 1 },
        },
      ];

      for (const p of patterns) {
        const move = sq(p.wk.file, p.wk.rank) + sq(p.to.file, p.to.rank);

        add(
          out,
          key,
          name,
          p.wk,
          wp,
          p.bk,
          move,
          "Break through after taking opposition.",
        );
      }
    }
  }

  return finalizeTheme(key, name, out);
}

function chunk(arr, size) {
  const out = [];

  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }

  return out;
}

const themes = [
  ["basic_opposition", "Basic Opposition", buildBasicOpposition()],
  ["key_squares", "Key Squares", buildKeySquares()],
  ["pawn_push_timing", "Pawn Push Timing", buildPawnPushTiming()],
  ["triangulation", "Triangulation", buildTriangulation()],
  ["shouldering", "Shouldering", buildShouldering()],
  ["breakthrough", "Breakthrough", buildBreakthrough()],
];

const progression = {
  order: [],
  themes: {},
};

for (const [key, label, positions] of themes) {
  const chunks = chunk(positions, CHUNK_SIZE);

  progression.order.push(key);

  progression.themes[key] = {
    label,
    chunkFiles: [],
    mode: "convert",
    goal: "opposition",
    maxSecondsPerMove: 4,
  };

  chunks.forEach((items, idx) => {
    const fileName = `${key}_chunk_${String(idx + 1).padStart(3, "0")}.json`;

    fs.writeFileSync(
      path.join(chunksDir, fileName),
      JSON.stringify(items, null, 2),
    );

    progression.themes[key].chunkFiles.push(fileName);
  });

  console.log(`${label}: ${positions.length} positions, ${chunks.length} chunks`);
}

fs.writeFileSync(
  path.join(baseDir, "progression.json"),
  JSON.stringify(progression, null, 2),
);

console.log("DONE generating expanded practical opposition dataset.");