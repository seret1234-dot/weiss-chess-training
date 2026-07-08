import fs from "fs";
import path from "path";

const file = path.join(
  process.cwd(),
  "src",
  "pages",
  "endgames",
  "OppositionTrainer.tsx"
);

if (!fs.existsSync(file)) {
  throw new Error("Could not find OppositionTrainer.tsx");
}

let s = fs.readFileSync(file, "utf8");

// 1. Remove the bad "always accept hinted move" block.
s = s.replace(
/\s*\/\/ OPPOSITION_HINT_ALWAYS_ACCEPT\s*if \(lastHintMoveRef\.current && attemptedUci === lastHintMoveRef\.current\) \{\s*lastHintMoveRef\.current = null;\s*const afterInfo = await evaluatePosition\(afterFen\);\s*return \{\s*ok: true,\s*reason: "",\s*afterUser: afterInfo,\s*\};\s*\}\s*/g,
"\n"
);

// 2. Replace chooseHintMove so it never falls back to random legal moves.
const hintStart = s.indexOf("function chooseHintMove(");
const hintEnd = s.indexOf("\nasync function findFirstIncompleteChunk", hintStart);

if (hintStart === -1 || hintEnd === -1) {
  throw new Error("Could not find chooseHintMove function.");
}

const newHintFunction = `function chooseHintMove(
  game: Chess,
  currentPosition: TrainingPosition,
  currentChunkFile: string | null,
  engineInfo: EngineResult | null,
) {
  const legalMoves = new Set(getLegalUciMoves(game));
  const atStart =
    normalizeFen(game.fen()) === normalizeFen(currentPosition.startFen);

  // First move: use the prepared opposition concept move.
  if (atStart) {
    const legalAllowedMoves = currentPosition.allowedMoves.filter((uci) =>
      legalMoves.has(uci),
    );

    if (legalAllowedMoves.length > 0) return legalAllowedMoves[0];
    return null;
  }

  // Later moves: only trust engine best move. No random fallback.
  if (engineInfo?.bestMove && legalMoves.has(engineInfo.bestMove)) {
    return engineInfo.bestMove;
  }

  return null;
}
`;

s = s.slice(0, hintStart) + newHintFunction + s.slice(hintEnd);

// 3. Remove showHintAction random fallback.
s = s.replace(
/\s*\/\/ Fallback: if engine is not ready at puzzle start,[\s\S]*?hintMoveUci = `\$\{firstLegal\.from\}\$\{firstLegal\.to\}\$\{firstLegal\.promotion \?\? ""\}`;\s*\}\s*\}\s*/g,
"\n"
);

fs.writeFileSync(file, s);

console.log("Fixed Opposition safe hints: no auto-accept and no random hint fallback.");