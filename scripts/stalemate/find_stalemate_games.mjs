import "dotenv/config";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { createClient } from "@supabase/supabase-js";
import { Chess } from "chess.js";

const SUPABASE_URL =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL;

const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("Missing Supabase env keys.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const csvPath = "scripts/stalemate/draw_games.csv";
const outDir = "public/data/endgames/stalemate";
const outJson = path.join(outDir, "master_stalemate_games.json");
const outPgn = path.join(outDir, "master_stalemate_games.pgn");

fs.mkdirSync(outDir, { recursive: true });

const csv = fs.readFileSync(csvPath, "utf8");
const rows = parse(csv, {
  columns: true,
  skip_empty_lines: true,
});

console.log("Draw games to scan:", rows.length);

function cleanPgn(pgn) {
  return pgn
    .replace(/\r/g, "")
    .replace(/\{[^}]*\}/g, " ")
    .replace(/;[^\n]*/g, " ")
    .replace(/\$\d+/g, " ")
    .replace(/\([^()]*\)/g, " ");
}

function replayPgn(pgn) {
  const chess = new Chess();

  const body = cleanPgn(pgn)
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\d+\.(\.\.)?/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = body.split(" ");

  for (const raw of tokens) {
    const token = raw.trim();
    if (!token) continue;
    if (["1-0", "0-1", "1/2-1/2", "*"].includes(token)) continue;

    const ok = chess.move(token, { sloppy: true });
    if (!ok) return null;
  }

  return chess;
}

const found = [];
const pgns = [];

for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  const key = row.pgn_storage_key;

  if (!key) continue;

  const { data, error } = await supabase.storage
    .from("master-games-pgn")
    .download(key);

  if (error || !data) {
    console.log("Download failed:", key, error?.message);
    continue;
  }

  const pgn = await data.text();
  const game = replayPgn(pgn);

  if (game?.isStalemate()) {
    const finalFen = game.fen();

    found.push({
      id: row.id,
      slug: row.slug,
      white: row.white,
      black: row.black,
      year: row.year,
      result: row.result,
      pgn_storage_key: key,
      finalFen,
    });

    pgns.push(pgn.trim());

    console.log("STALEMATE", found.length, row.white, "-", row.black, row.year);
  }

  if ((i + 1) % 500 === 0) {
    console.log(`Scanned ${i + 1}/${rows.length}, found ${found.length}`);
    fs.writeFileSync(outJson, JSON.stringify(found, null, 2));
    fs.writeFileSync(outPgn, pgns.join("\n\n"));
  }
}

fs.writeFileSync(outJson, JSON.stringify(found, null, 2));
fs.writeFileSync(outPgn, pgns.join("\n\n"));

console.log("DONE");
console.log("Scanned:", rows.length);
console.log("Stalemates found:", found.length);
console.log("JSON:", outJson);
console.log("PGN:", outPgn);
