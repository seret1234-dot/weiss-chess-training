const fs = require("fs");
const path = "src/pages/endgames/StalemateTrainer.tsx";
let s = fs.readFileSync(path, "utf8");

const needle = `function normalizeFen(fen: string) {
 const trimmed = fen.trim();
 const parts = trimmed.split(/\\s+/);
 if (parts.length === 4) return \`\${trimmed} 0 1\`;
 return trimmed;
}`;

const insert = `${needle}

function forceBlackToMoveFen(fen: string) {
 const parts = normalizeFen(fen).split(/\\s+/);

 if (parts.length < 6) {
 return normalizeFen(fen);
 }

 parts[1] = "b";
 return parts.join(" ");
}`;

if (!s.includes(needle)) {
 throw new Error("Could not find normalizeFen block");
}

s = s.replace(needle, insert);

fs.writeFileSync(path, s);
console.log("DONE: added forceBlackToMoveFen");
