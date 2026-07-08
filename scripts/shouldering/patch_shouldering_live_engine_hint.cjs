const fs = require("fs");

const p = "src/pages/endgames/ShoulderingTrainer.tsx";
let s = fs.readFileSync(p, "utf8");

const backup = p + ".bak_live_engine_hint";
fs.writeFileSync(backup, s);

s = s.replace(
/function chooseHintMove\(game: Chess, engineInfo: EngineResult \| null\) \{[\s\S]*?\n\}/,
`function chooseHintMove(game: Chess, engineInfo: EngineResult | null) {
 const legalMoves = new Set(getLegalUciMoves(game));
 const engineBestMove = engineInfo?.bestMove ?? null;

 if (engineBestMove && legalMoves.has(engineBestMove)) return engineBestMove;

 return null;
}`
);

s = s.replace(
/async function showHintAction\(\) \{[\s\S]*?\n async function validateByEngine/,
`async function showHintAction() {
 if (loadingChunk || inputLocked || !currentPosition || phase === "classify") {
 return;
 }

 setStatus("Hint");
 setMessage("Engine is finding the best move...");

 const analysis = await evaluatePosition(game.fen());
 setEngineInfo(analysis);

 const hintMoveUci = chooseHintMove(game, analysis);
 const parsed = parseUciMove(hintMoveUci);

 if (!parsed) {
 setHintSquares([]);
 setMessage("Engine did not return a legal best move yet. Try hint again.");
 return;
 }

 setHintSquares([parsed.from, parsed.to]);
 setMessage("Best engine move: " + parsed.from + " ? " + parsed.to);
 }

 async function validateByEngine`
);

fs.writeFileSync(p, s);
console.log("DONE patched Shouldering hint to use live engine best move only");
console.log("Backup:", backup);
