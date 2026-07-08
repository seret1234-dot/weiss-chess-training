import fs from "fs";
import path from "path";
import { Chess } from "chess.js";

const inputPgn = "public/data/endgames/stalemate/master_stalemate_games.pgn";
const outDir = "public/data/endgames/stalemate/chunks";
const progressionPath = "public/data/endgames/stalemate/progression.json";
const manifestPath = "public/data/endgames/stalemate/manifest.json";

fs.mkdirSync(outDir, { recursive: true });

const text = fs.readFileSync(inputPgn, "utf8").trim();
const games = text.split(/\n\n(?=\[Event )/);

function cleanPgn(pgn) {
  return pgn
    .replace(/\r/g, "")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/;[^\n]*/g, " ")
    .replace(/\$\d+/g, " ")
    .replace(/\([^()]*\)/g, " ");
}

function headersOf(pgn) {
  const headers = {};
  for (const m of pgn.matchAll(/^\[([A-Za-z0-9_]+)\s+"([^"]*)"\]/gm)) {
    headers[m[1]] = m[2];
  }
  return headers;
}

function movesOf(pgn) {
  const body = cleanPgn(pgn)
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\d+\.(\.\.)?/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return body
    .split(" ")
    .map((x) => x.trim())
    .filter((x) => x && !["1-0", "0-1", "1/2-1/2", "*"].includes(x));
}

const positions = [];

for (let i = 0; i < games.length; i++) {
  const pgn = games[i].trim();
  if (!pgn) continue;

  const headers = headersOf(pgn);
  const moves = movesOf(pgn);
  if (moves.length === 0) continue;

  const before = new Chess();
  let finalMoveSan = null;
  let finalMoveUci = null;

  try {
    for (let j = 0; j < moves.length; j++) {
      if (j === moves.length - 1) {
        const startFen = before.fen();
        const move = before.move(moves[j], { sloppy: true });
        if (!move) break;

        finalMoveSan = move.san;
        finalMoveUci = `${move.from}${move.to}${move.promotion ?? ""}`;

        if (before.isStalemate() && startFen.split(/\s+/)[1] === "b") {
          positions.push({
            id: `master-stalemate-${positions.length + 1}`,
            label: `${headers.White || "White"} - ${headers.Black || "Black"} ${headers.Date || headers.Year || ""}`,
            startFen,
            allowedMoves: [finalMoveUci],
            solution: [finalMoveUci],
            result: "draw",
            theme: "master-game-stalemate-in-1",
            subjectId: "master-game-stalemate-in-1",
            subjectName: "Master game stalemate in 1",
            explanation: `Find ${finalMoveSan}: the move that saves the draw by stalemate.`,
            source: {
              event: headers.Event || "",
              site: headers.Site || "",
              date: headers.Date || "",
              white: headers.White || "",
              black: headers.Black || "",
              result: headers.Result || "",
            },
          });
        }
      } else {
        const move = before.move(moves[j], { sloppy: true });
        if (!move) break;
      }
    }
  } catch {}
}

const chunkSize = 30;
const chunkFiles = [];

for (let i = 0; i < positions.length; i += chunkSize) {
  const chunk = positions.slice(i, i + chunkSize);
  const n = Math.floor(i / chunkSize) + 1;
  const file = `${String(n).padStart(3, "0")}_master_stalemate_in_1.json`;
  fs.writeFileSync(path.join(outDir, file), JSON.stringify(chunk, null, 2));
  chunkFiles.push(file);
}

const progression = {
  order: ["master-game-stalemate-in-1"],
  masteryFastSolves: 5,
  maxSecondsPerMove: 3,
  goal: "stalemate",
  themes: {
    "master-game-stalemate-in-1": {
      label: "Master game stalemate in 1",
      mode: "convert",
      goal: "stalemate",
      chunkFiles,
    },
  },
};

const manifest = {
  title: "Stalemate",
  totalPositions: positions.length,
  totalChunks: chunkFiles.length,
  themes: [
    {
      id: "master-game-stalemate-in-1",
      label: "Master game stalemate in 1",
      positions: positions.length,
      chunks: chunkFiles.length,
    },
  ],
};

fs.writeFileSync(progressionPath, JSON.stringify(progression, null, 2));
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log("DONE");
console.log("Positions:", positions.length);
console.log("Chunks:", chunkFiles.length);
