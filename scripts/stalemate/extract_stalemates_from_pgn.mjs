import fs from "fs";
import readline from "readline";
import { Chess } from "chess.js";

const INPUT =
  "C:/Users/Ariel/chess-trainer/lichess_dumps/lichess_db_standard_rated_2013-01.pgn";

const OUTPUT =
  "C:/Users/Ariel/chess-trainer/stalemate_games_strict.pgn";

const out = fs.createWriteStream(OUTPUT);

const rl = readline.createInterface({
  input: fs.createReadStream(INPUT),
  crlfDelay: Infinity,
});

let gameLines = [];
let scanned = 0;
let saved = 0;
let failed = 0;

function sanitizePgn(pgn) {
  return pgn
    .replace(/\r/g, "")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\$\d+/g, " ")
    .replace(/\s+\d+\.\.\./g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function flushGame() {
  const rawPgn = gameLines.join("\n").trim();
  gameLines = [];

  if (!rawPgn) return;

  scanned++;

  try {
    const game = new Chess();

    const clean = sanitizePgn(rawPgn);

    game.loadPgn(clean, {
      sloppy: true,
    });

    if (!game.isStalemate()) {
      return;
    }

    out.write(rawPgn + "\n\n");
    saved++;

    if (saved % 25 === 0) {
      console.log(`saved ${saved} | scanned ${scanned} | failed ${failed}`);
    }
  } catch {
    failed++;
  }

  if (scanned % 10000 === 0) {
    console.log(`scanned ${scanned} | saved ${saved} | failed ${failed}`);
  }
}

for await (const line of rl) {
  if (line.startsWith("[Event ") && gameLines.length > 0) {
    flushGame();
  }

  gameLines.push(line);
}

flushGame();
out.end();

console.log("DONE");
console.log(`Scanned ${scanned}`);
console.log(`Saved strict stalemates: ${saved}`);
console.log(`Failed parse: ${failed}`);
console.log(OUTPUT);
