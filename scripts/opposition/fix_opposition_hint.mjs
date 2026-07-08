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

const start = s.indexOf("function chooseHintMove(");
const end = s.indexOf("\nasync function findFirstIncompleteChunk", start);

if (start === -1 || end === -1) {
  throw new Error("Could not find chooseHintMove function.");
}

const replacement = `function chooseHintMove(
  game: Chess,
  currentPosition: TrainingPosition,
  currentChunkFile: string | null,
  engineInfo: EngineResult | null,
) {
  const legalMoves = new Set(getLegalUciMoves(game));

  const legalAllowedMoves = currentPosition.allowedMoves.filter((uci) =>
    legalMoves.has(uci),
  );

  // Opposition is rule-based. Hint must always be a legal allowed move.
  if (legalAllowedMoves.length > 0) return legalAllowedMoves[0];

  return null;
}
`;

s = s.slice(0, start) + replacement + s.slice(end);

fs.writeFileSync(file, s);

console.log("Fixed Opposition hint to use allowedMoves only.");