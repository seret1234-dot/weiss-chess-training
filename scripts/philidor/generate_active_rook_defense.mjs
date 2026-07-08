import fs from "fs";
import path from "path";
import { spawn } from "child_process";

const ROOT = process.cwd();
const STOCKFISH = "C:\\Users\\Ariel\\chess-trainer\\stockfish-windows-x86-64-avx2\\stockfish\\stockfish-windows-x86-64-avx2.exe";
const OUT = path.join(ROOT, "public", "data", "endgames", "philidor", "chunks");
fs.mkdirSync(OUT,{recursive:true});

console.log("Generating active rook defense...");
console.log("Skipped for now: generator needs better candidate geometry.");
console.log("DONE");
