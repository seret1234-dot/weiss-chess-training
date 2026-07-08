import fs from "fs";

const file = "src/pages/endgames/KRKPTrainer.tsx";
let s = fs.readFileSync(file, "utf8");

const re = /const analysis = [\s\S]*?const hintMoveUci = chooseHintMove\(\s*game,\s*currentPosition,\s*currentChunkFile,\s*analysis,\s*\);/m;

const fixed = `const legalNow = getLegalUciMoves(game);

    const immediateFinish = legalNow.find((uci) => {
      const result = applyUciMoveToGame(game.fen(), uci);
      if (!result) return false;
      if (krkpBlackCanCaptureWhiteRookNow(result.game)) return false;
      return userMoveCompletesGoal(result.game);
    });

    const freshAnalysis = await evaluatePosition(game.fen());
    if (freshAnalysis) setEngineInfo(freshAnalysis);

    const hintMoveUci =
      immediateFinish ||
      (freshAnalysis?.bestMove && legalNow.includes(freshAnalysis.bestMove)
        ? freshAnalysis.bestMove
        : chooseHintMove(game, currentPosition, currentChunkFile, freshAnalysis));`;

if (!re.test(s)) {
  console.log("Could not find hint block. Show me this output:");
  const i = s.indexOf("async function showHintAction");
  console.log(s.slice(i, i + 1200));
  process.exit(1);
}

s = s.replace(re, fixed);

fs.writeFileSync(file, s);
console.log("DONE: KRKP hint patched.");
