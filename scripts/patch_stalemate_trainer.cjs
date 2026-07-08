const fs = require("fs");
const path = "src/pages/endgames/StalemateTrainer.tsx";
let s = fs.readFileSync(path, "utf8");

s = s.replace(
`function userMoveCompletesGoal(nextGame: Chess) {
 return nextGame.isStalemate();
 }`,
`function userMoveCompletesGoal(nextGame: Chess) {
 return nextGame.isStalemate();
 }

 function positionMoveList() {
 return currentPosition?.allowedMoves?.length
 ? currentPosition.allowedMoves
 : currentPosition?.solution ?? [];
 }

 function isListedSolutionMove(uci: string) {
 return positionMoveList().includes(uci);
 }`
);

s = s.replace(
` if (isKpkStalemate(afterUserGame)) {
 clearPendingFeedbackTimeout();

 setGame(afterUserGame);
 setLastMove({ from: userMove.from, to: userMove.to });
 setMarkedSquare(getBlackKingSquare(afterUserGame));
 setCorrectSquares([]);
 setHintSquares([]);
 setEscapeSquares([]);
 setJustMated(false);
 setJustStalemated(true);

 setStatus("STALEMATE - FAIL");
 setMessage("Stalemate is a failed conversion. Try again from the beginning.");
 setInputLocked(true);

 feedbackTimeoutRef.current = window.setTimeout(() => {
 loadPosition(currentIndex);
 }, WRONG_DELAY_MS);

 return;
 }

`,
``
);

s = s.replace(
` function chooseHintMove(game: Chess, engineInfo: EngineResult | null) {
 const legalMoves = new Set(getLegalUciMoves(game));
 const engineBestMove = engineInfo?.bestMove ?? null;

 if (engineBestMove && legalMoves.has(engineBestMove)) return engineBestMove;
 return null;
}`,
` function chooseHintMove(game: Chess, engineInfo: EngineResult | null) {
 const legalMoves = new Set(getLegalUciMoves(game));

 const listed = positionMoveList().find((uci) => legalMoves.has(uci));
 if (listed) return listed;

 const engineBestMove = engineInfo?.bestMove ?? null;
 if (engineBestMove && legalMoves.has(engineBestMove)) return engineBestMove;

 return null;
}`
);

const start = s.indexOf(" async function validateByEngine(");
const end = s.indexOf("\\nfunction onDrop", start);
if (start === -1 || end === -1) throw new Error("Could not find validateByEngine block");

const newValidate = ` async function validateByEngine(
 beforeFen: string,
 afterFen: string,
 attemptedUci: string,
 nextGame: Chess,
 ) {
 const beforeInfo = engineInfo ?? (await evaluatePosition(beforeFen));
 const afterInfo = await evaluatePosition(afterFen);

 if (nextGame.isStalemate()) {
 return { ok: true, reason: "", afterUser: afterInfo };
 }

 if (isListedSolutionMove(attemptedUci)) {
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
`;

s = s.slice(0, start) + newValidate + s.slice(end);

s = s.replace(
` // In Stalemate trainer the user plays White. Black must auto-reply.
 if (game.turn() !== "b") return false;`,
` // In Stalemate trainer the user plays the side to move from the FEN.
 // Most defensive-stalemate positions are Black to move.`
);

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

s = s.replaceAll(
`"Find a stalemate resource. White replies with best engine moves."`,
`"Find the defensive stalemate resource. The stronger side replies with engine moves."`
);

fs.writeFileSync(path, s);
console.log("DONE: patched StalemateTrainer.tsx");
