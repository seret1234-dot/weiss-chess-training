const fs = require("fs");

const path = "src/pages/endgames/FortressTrainer.tsx";
let s = fs.readFileSync(path, "utf8");

// Flip board automatically for black-to-move fortress puzzles.
s = s.replace(
 'const nextGame = new Chess(position.startFen);\n setGame(nextGame);',
 'const nextGame = new Chess(position.startFen);\n setGame(nextGame);\n setBoardOrientation(position.sideToMove === "black" ? "black" : "white");'
);

// Stop misleading engine/eval display for fortress.
s = s.replaceAll(
 'void analyzeCurrentFen(p.startFen);',
 '// Fortress draw positions are tablebase-like; normal eval is misleading.\n setEngineInfo(null);'
);

s = s.replaceAll(
 'void analyzeCurrentFen(nextPosition.startFen);',
 '// Fortress draw positions are tablebase-like; normal eval is misleading.\n setEngineInfo(null);'
);

s = s.replaceAll(
 'void analyzeCurrentFen(nextGame.fen());',
 'setEngineInfo(null);'
);

s = s.replaceAll(
 'void analyzeCurrentFen(replyResult.game.fen());',
 'setEngineInfo(null);'
);

fs.writeFileSync(path, s);
console.log("DONE: Fortress board flips for Black and eval is disabled.");
