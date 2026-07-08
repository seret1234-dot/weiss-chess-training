const fs = require("fs");
const path = "src/pages/endgames/StalemateTrainer.tsx";
let s = fs.readFileSync(path, "utf8");

// 1) Hint: prefer dataset solution before engine
s = s.replace(
`function chooseHintMove(game: Chess, engineInfo: EngineResult | null) {
 const legalMoves = new Set(getLegalUciMoves(game));
 const engineBestMove = engineInfo?.bestMove ?? null;

 if (engineBestMove && legalMoves.has(engineBestMove)) return engineBestMove;
 return null;
}`,
`function chooseHintMove(game: Chess, engineInfo: EngineResult | null) {
 const legalMoves = new Set(getLegalUciMoves(game));
 const listedMoves = currentPosition?.allowedMoves?.length
 ? currentPosition.allowedMoves
 : currentPosition?.solution ?? [];

 const listed = listedMoves.find((uci) => legalMoves.has(uci));
 if (listed) return listed;

 const engineBestMove = engineInfo?.bestMove ?? null;
 if (engineBestMove && legalMoves.has(engineBestMove)) return engineBestMove;

 return null;
}`
);

// 2) Replace copied KPK validate logic with stalemate logic
s = s.replace(
/ async function validateByEngine\([\s\S]*?\n }\n\nfunction onDrop/,
` async function validateByEngine(
 beforeFen: string,
 afterFen: string,
 attemptedUci: string,
 nextGame: Chess,
 ) {
 const beforeInfo = engineInfo ?? (await evaluatePosition(beforeFen));
 const afterInfo = await evaluatePosition(afterFen);

 const listedMoves = currentPosition?.allowedMoves?.length
 ? currentPosition.allowedMoves
 : currentPosition?.solution ?? [];

 if (nextGame.isStalemate()) {
 return { ok: true, reason: "", afterUser: afterInfo };
 }

 if (listedMoves.includes(attemptedUci)) {
 return { ok: true, reason: "", afterUser: afterInfo };
 }

 if (lastHintMoveRef.current && attemptedUci === lastHintMoveRef.current) {
 lastHintMoveRef.current = null;
 return { ok: true, reason: "", afterUser: afterInfo };
 }

 if (isEngineBestMove(beforeInfo, attemptedUci)) {
 return { ok: true, reason: "", afterUser: afterInfo };
 }

 return {
 ok: false,
 reason: "Wrong: this does not keep the stalemate resource.",
 afterUser: afterInfo,
 };
 }

function onDrop`
);

// 3) Allow side-to-move from FEN, not only black
s = s.replace(
` // In Stalemate trainer the user plays White. Black must auto-reply.
 if (game.turn() !== "b") return false;`,
` // User plays the side to move from the FEN.`
);

// 4) Remove promotion/checkmate as fake success, make stalemate success
s = s.replace(
` if (move.promotion || moveObj.promotion || hasWhiteQueenExact(nextGame)) {
 handleSolved(nextGame, move);
 return true;
 }

 if (nextGame.isStalemate()) {
 showWrongAndReset(
 nextGame,
 move,
 "Stalemate - fail.",
 "You let the defender escape.",
 );
 return true;
 }`,
` if (nextGame.isStalemate()) {
 handleSolved(nextGame, move);
 return true;
 }`
);

// 5) Fix copied message
s = s.replaceAll(
 "Find a stalemate resource. White replies with best engine moves.",
 "Find the defensive stalemate resource. The stronger side replies with engine moves."
);

fs.writeFileSync(path, s);
console.log("DONE: patched StalemateTrainer.tsx");
