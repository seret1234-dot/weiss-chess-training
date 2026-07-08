import fs from "fs";
import path from "path";
import { Chess } from "chess.js";

const inputPgn = "public/data/endgames/stalemate/master_stalemate_games.pgn";
const outDir = "public/data/endgames/stalemate/chunks";
const progressionPath = "public/data/endgames/stalemate/progression.json";
const manifestPath = "public/data/endgames/stalemate/manifest.json";

fs.mkdirSync(outDir, { recursive: true });

for (const file of fs.readdirSync(outDir)) {
  if (file.includes("master_stalemate_in_1")) {
    fs.unlinkSync(path.join(outDir, file));
  }
}

const text = fs.readFileSync(inputPgn, "utf8").trim();
const games = text.split(/\n\n(?=\[Event )/);

const pieceValue = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

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

function material(game) {
  let w = 0;
  let b = 0;
  let wPieces = 0;
  let bPieces = 0;

  for (const row of game.board()) {
    for (const piece of row) {
      if (!piece) continue;
      const v = pieceValue[piece.type] ?? 0;
      if (piece.color === "w") {
        w += v;
        if (piece.type !== "k") wPieces++;
      } else {
        b += v;
        if (piece.type !== "k") bPieces++;
      }
    }
  }

  return { w, b, wPieces, bPieces };
}

function isDefenderMove(beforeGame, moverColor) {
  const m = material(beforeGame);

  const moverValue = moverColor === "w" ? m.w : m.b;
  const opponentValue = moverColor === "w" ? m.b : m.w;
  const moverPieces = moverColor === "w" ? m.wPieces : m.bPieces;
  const opponentPieces = moverColor === "w" ? m.bPieces : m.wPieces;

  // Keep only cases where the side making stalemate is not materially ahead.
  if (moverValue > opponentValue) return false;

  // Stronger filter: opponent must have at least as much material,
  // or mover is basically bare king / pawns.
  if (opponentValue >= moverValue) return true;

  return moverPieces <= opponentPieces;
}

const positions = [];
let checkedFinalStalemates = 0;
let rejectedWinningSideBlunders = 0;

for (let i = 0; i < games.length; i++) {
  const pgn = games[i].trim();
  if (!pgn) continue;

  const headers = headersOf(pgn);
  const moves = movesOf(pgn);
  if (moves.length === 0) continue;

  const before = new Chess();

  try {
    for (let j = 0; j < moves.length; j++) {
      if (j === moves.length - 1) {
        const startFen = before.fen();
        const moverColor = before.turn();

        const move = before.move(moves[j], { sloppy: true });
        if (!move) break;

        const finalMoveSan = move.san;
        const finalMoveUci = `${move.from}${move.to}${move.promotion ?? ""}`;

        if (!before.isStalemate()) break;

        checkedFinalStalemates++;

        const beforeGame = new Chess(startFen);

        if (!isDefenderMove(beforeGame, moverColor)) {
          rejectedWinningSideBlunders++;
          break;
        }

        positions.push({
          id: `master-stalemate-${positions.length + 1}`,
          label: `${headers.White || "White"} - ${headers.Black || "Black"} ${headers.Date || headers.Year || ""}`,
          startFen,
          allowedMoves: [finalMoveUci],
          solution: [finalMoveUci],
          result: "draw",
          theme: "master-game-defensive-stalemate-in-1",
          subjectId: "master-game-defensive-stalemate-in-1",
          subjectName: "Master game defensive stalemate in 1",
          explanation: `Find ${finalMoveSan}: the defender's move that saves the draw by stalemate.`,
          source: {
            event: headers.Event || "",
            site: headers.Site || "",
            date: headers.Date || "",
            white: headers.White || "",
            black: headers.Black || "",
            result: headers.Result || "",
          },
        });
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
  const file = `${String(n).padStart(3, "0")}_master_defensive_stalemate_in_1.json`;
  fs.writeFileSync(path.join(outDir, file), JSON.stringify(chunk, null, 2));
  chunkFiles.push(file);
}

const progression = {
  order: ["master-game-defensive-stalemate-in-1"],
  masteryFastSolves: 5,
  maxSecondsPerMove: 3,
  goal: "stalemate",
  themes: {
    "master-game-defensive-stalemate-in-1": {
      label: "Master game defensive stalemate in 1",
      mode: "convert",
      goal: "stalemate",
      chunkFiles,
    },
  },
};

const manifest = {
  title: "Defensive Stalemate",
  totalPositions: positions.length,
  totalChunks: chunkFiles.length,
  checkedFinalStalemates,
  rejectedWinningSideBlunders,
  themes: [
    {
      id: "master-game-defensive-stalemate-in-1",
      label: "Master game defensive stalemate in 1",
      positions: positions.length,
      chunks: chunkFiles.length,
    },
  ],
};

fs.writeFileSync(progressionPath, JSON.stringify(progression, null, 2));
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log("DONE");
console.log("Final stalemates checked:", checkedFinalStalemates);
console.log("Rejected winning-side blunders:", rejectedWinningSideBlunders);
console.log("Kept defensive stalemates:", positions.length);
console.log("Chunks:", chunkFiles.length);
