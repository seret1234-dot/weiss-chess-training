import fs from "fs";
import path from "path";

const root = process.cwd();

function read(p) {
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

function write(p, txt) {
  fs.writeFileSync(p, txt, "utf8");
  console.log("updated:", p);
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(tsx|ts|jsx|js)$/.test(name)) out.push(p);
  }
  return out;
}

const stalematePage = path.join(root, "src/pages/endgames/StalemateTrainer.tsx");
fs.mkdirSync(path.dirname(stalematePage), { recursive: true });

if (!fs.existsSync(stalematePage)) {
  write(stalematePage, `import React from "react";

export default function StalemateTrainer() {
  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h1>Stalemate</h1>
      <p>
        This study will train stalemate patterns: when the side to move has no legal
        moves but is not in check.
      </p>

      <div
        style={{
          marginTop: 18,
          padding: 16,
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 12,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Coming next</h2>
        <p>
          Add stalemate positions here using the same chunk / trainer shell system
          as the other endgame studies.
        </p>
      </div>
    </div>
  );
}
`);
}

const files = walk(path.join(root, "src"));

for (const file of files) {
  let txt = read(file);
  let next = txt;

  const lower = file.toLowerCase();

  const isLikelyNavOrRoute =
    lower.includes("app.") ||
    lower.includes("route") ||
    lower.includes("endgame") ||
    lower.includes("navigation") ||
    lower.includes("menu") ||
    lower.includes("sidebar");

  if (!isLikelyNavOrRoute) continue;
  if (!/opposition|Opposition/.test(next)) continue;

  next = next
    .replace(/OppositionTrainer/g, "StalemateTrainer")
    .replace(/opposition-trainer/g, "stalemate-trainer")
    .replace(/opposition/g, "stalemate")
    .replace(/Opposition/g, "Stalemate");

  next = next.replace(
    /from\s+["']([^"']*?)StalemateTrainer["']/g,
    `from "$1StalemateTrainer"`
  );

  if (next !== txt) write(file, next);
}

console.log("");
console.log("DONE");
console.log("Opposition was removed/replaced in endgame nav/routes.");
console.log("Stalemate page exists at src/pages/endgames/StalemateTrainer.tsx");