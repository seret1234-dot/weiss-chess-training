const fs = require("fs");
const path = "src/pages/endgames/StalemateTrainer.tsx";
let s = fs.readFileSync(path, "utf8");

// Fix hint: choose from current puzzle solution, not undefined currentPosition scope.
s = s.replace(
/function chooseHintMove\([\s\S]*?\n\}/,
`function chooseHintMove(
 game: Chess,
 engineInfo: EngineResult | null,
 position: TrainingPosition | null,
) {
 const legalMoves = new Set(getLegalUciMoves(game));

 const listedMoves = position?.allowedMoves?.length
 ? position.allowedMoves
 : position?.solution ?? [];

 const listed = listedMoves.find((uci) => legalMoves.has(uci));
 if (listed) return listed;

 const engineBestMove = engineInfo?.bestMove ?? null;
 if (engineBestMove && legalMoves.has(engineBestMove)) return engineBestMove;

 return null;
}`
);

s = s.replaceAll(
 "chooseHintMove(game, analysis)",
 "chooseHintMove(game, analysis, currentPosition)"
);

s = s.replaceAll(
 "chooseHintMove(game, engineInfo)",
 "chooseHintMove(game, engineInfo, currentPosition)"
);

// Make stalemate immediate success everywhere.
s = s.replace(
/if \(nextGame\.isStalemate\(\)\) \{[\s\S]*?showWrongAndReset\([\s\S]*?\);\s*return true;\s*\}/g,
`if (nextGame.isStalemate()) {
 handleSolved(nextGame, move);
 return true;
 }`
);

s = s.replace(
/if \(isKpkStalemate\(afterUserGame\)\) \{[\s\S]*?return;\s*\}/g,
`if (afterUserGame.isStalemate()) {
 handleSolved(afterUserGame, userMove);
 return;
 }`
);

// Fix success text.
s = s.replaceAll("Stalemate - fail.", "STALEMATE!");
s = s.replaceAll("You let the defender escape.", "Correct - stalemate saves the draw.");

fs.writeFileSync(path, s);
console.log("DONE: stalemate is success and hint uses puzzle solution");
