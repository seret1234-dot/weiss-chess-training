const fs = require("fs");

const path = "src/pages/endgames/FortressTrainer.tsx";
let s = fs.readFileSync(path, "utf8");

if (!s.includes("const HOLD_TARGET_MOVES = 20;")) {
 s = s.replace(
 "const POSITION_FAST_SOLVES_TO_MASTER = 5;",
 "const POSITION_FAST_SOLVES_TO_MASTER = 5;\nconst HOLD_TARGET_MOVES = 20;"
 );
}

if (!s.includes("const [holdMoves, setHoldMoves]")) {
 s = s.replace(
 'const [phase, setPhase] = useState<"classify" | "play">("play");',
 'const [phase, setPhase] = useState<"classify" | "play">("play");\n const [holdMoves, setHoldMoves] = useState(0);'
 );
}

s = s.replaceAll("setMateCountdown(null);", "setMateCountdown(null);\n setHoldMoves(0);");

s = s.replace(
 /function handleSolved\([\s\S]*?\n function markEvaluationSolved\(/,
`function handleSolved(
 nextGame: Chess,
 correctMove: { from: string; to: string; promotion?: string },
 ) {
 if (!progress || !currentThemeId || !currentPosition || !currentThemeConfig)
 return;

 clearPendingFeedbackTimeout();

 const nextHoldMoves = holdMoves + 1;
 setHoldMoves(nextHoldMoves);

 setGame(nextGame);
 setLastMove({ from: correctMove.from, to: correctMove.to });
 setMarkedSquare(null);
 setEscapeSquares([]);
 setHintSquares([]);
 addCorrectSquare(correctMove.to);
 setJustMated(false);
 setJustStalemated(false);

 if (nextHoldMoves < HOLD_TARGET_MOVES) {
 setStatus("Fortress held.");
 setMessage(\`Good defense. Hold moves: \${nextHoldMoves}/\${HOLD_TARGET_MOVES}.\`);
 setInputLocked(false);
 moveStartedAtRef.current = Date.now();
 setCurrentMoveElapsedMs(0);
 void analyzeCurrentFen(nextGame.fen());
 return;
 }

 setFlashSolvedPositionId(currentPosition.id);

 const moveElapsedMs = Date.now() - moveStartedAtRef.current;
 setCurrentMoveElapsedMs(moveElapsedMs);

 const nextMoveTimes = [...moveTimesMs, moveElapsedMs];
 setMoveTimesMs(nextMoveTimes);

 const maxSecondsPerMove = currentThemeConfig.maxSecondsPerMove ?? 3;
 const maxMsPerMove = maxSecondsPerMove * 1000;
 const wasFast = nextMoveTimes.every((ms) => ms <= maxMsPerMove);

 const oldStats = getPositionStats(progress, currentPosition.id);

 const nextFastSolves = wasFast
 ? Math.min(POSITION_FAST_SOLVES_TO_MASTER, oldStats.fastSolves + 1)
 : oldStats.fastSolves;

 const positionMastered = nextFastSolves >= POSITION_FAST_SOLVES_TO_MASTER;

 const updatedProgress: TrainerProgress = {
 ...progress,
 positions: {
 ...progress.positions,
 [currentPosition.id]: {
 fastSolves: nextFastSolves,
 totalSolves: oldStats.totalSolves + 1,
 mastered: positionMastered,
 },
 },
 themes: {
 ...progress.themes,
 [currentThemeId]: {
 ...progress.themes[currentThemeId],
 },
 },
 };

 setProgress(updatedProgress);
 setStatus("Fortress held for 20 moves.");
 setMessage(
 wasFast
 ? \`Solved. Fast solve \${nextFastSolves}/\${POSITION_FAST_SOLVES_TO_MASTER}.\`
 : \`Solved, but slower than \${maxSecondsPerMove} seconds.\`,
 );
 setHoldMoves(0);

 feedbackTimeoutRef.current = window.setTimeout(() => {
 moveToNextChunkOrTheme(updatedProgress);
 }, CORRECT_DELAY_MS);
 }

 function markEvaluationSolved(`
);

fs.writeFileSync(path, s);
console.log("DONE: Fortress now requires holding the draw for 20 defender moves.");
