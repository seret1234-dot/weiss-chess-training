const fs = require("fs");

const path = "src/pages/endgames/FortressTrainer.tsx";
let s = fs.readFileSync(path, "utf8");

const needle = `const hintMoveUci = chooseHintMove(game, analysis);`;

const patch = `const legalMoves = new Set(getLegalUciMoves(game));
 const datasetHint = currentPosition.allowedMoves.find((m) => legalMoves.has(m));
 const hintMoveUci = datasetHint ?? chooseHintMove(game, analysis);`;

if (!s.includes(needle)) {
 console.log("Could not find hint block.");
 process.exit(1);
}

s = s.replace(needle, patch);

fs.writeFileSync(path, s);
console.log("DONE: Fortress hint now prefers dataset drawing moves.");
