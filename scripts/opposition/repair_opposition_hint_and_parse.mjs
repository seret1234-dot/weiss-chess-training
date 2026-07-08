import fs from "fs";

const file =
  "C:/Users/Ariel/chess-trainer/src/pages/endgames/OppositionTrainer.tsx";

let text = fs.readFileSync(file, "utf8");

function replaceBetween(source, startMarker, endMarker, replacement) {
  const start = source.indexOf(startMarker);

  if (start === -1) {
    throw new Error("Could not find start marker: " + startMarker);
  }

  const end = source.indexOf(endMarker, start);

  if (end === -1) {
    throw new Error("Could not find end marker: " + endMarker);
  }

  return source.slice(0, start) + replacement + source.slice(end);
}

const chooseHintMoveReplacement = `function chooseHintMove(
  game: Chess,
  currentPosition: TrainingPosition,
  currentChunkFile: string | null,
  engineInfo: EngineResult | null,
) {
  const legalMoves = new Set(getLegalUciMoves(game));

  // Always prefer Stockfish best move if available and legal.
  if (engineInfo?.bestMove && legalMoves.has(engineInfo.bestMove)) {
    return engineInfo.bestMove;
  }

  // Fallback only if engine did not return a usable move.
  const legalAllowedMoves = currentPosition.allowedMoves.filter((uci) =>
    legalMoves.has(uci),
  );

  if (legalAllowedMoves.length > 0) {
    return legalAllowedMoves[0];
  }

  return null;
}

`;

const showHintActionReplacement = `async function showHintAction() {
    if (
      loadingChunk ||
      inputLocked ||
      !currentPosition ||
      phase === "classify" ||
      allComplete
    ) {
      return;
    }

    setStatus("Hint");
    setMessage("Finding best engine move...");

    let analysis: EngineResult | null = null;

    try {
      analysis = await evaluatePosition(game.fen());
      setEngineInfo(analysis);
    } catch {
      analysis = null;
    }

    const hintMoveUci = chooseHintMove(
      game,
      currentPosition,
      currentChunkFile,
      analysis,
    );

    if (!hintMoveUci) {
      setStatus("Hint");
      setMessage("No legal hint available.");
      setInputLocked(false);
      return;
    }

    lastHintMoveRef.current = hintMoveUci;

    const parsed = parseUciMove(hintMoveUci);

    if (!parsed) {
      setStatus("Hint");
      setMessage("Suggested move: " + hintMoveUci);
      setInputLocked(false);
      return;
    }

    setMarkedSquare(parsed.from);
    setHintSquares([parsed.to]);
    setEscapeSquares([]);

    const promotionText = parsed.promotion
      ? " (" + parsed.promotion + ")"
      : "";

    setStatus("Hint");
    setMessage(
      "Best engine move: " +
        parsed.from +
        " → " +
        parsed.to +
        promotionText,
    );

    setInputLocked(false);
  }

  `;

const scoreForWhiteReplacement = `function scoreForWhite(info: EngineResult | null) {
    if (!info) return null;

    if (typeof info.mate === "number") {
      return info.mate > 0 ? 100 : -100;
    }

    if (typeof info.eval === "number") {
      return info.eval;
    }

    return null;
  }

  `;

text = replaceBetween(
  text,
  "function chooseHintMove(",
  "async function findFirstIncompleteChunk",
  chooseHintMoveReplacement,
);

text = replaceBetween(
  text,
  "async function showHintAction()",
  "function withTimeout",
  showHintActionReplacement,
);

text = replaceBetween(
  text,
  "function scoreForWhite(",
  "function getKpkTargetResult",
  scoreForWhiteReplacement,
);

fs.writeFileSync(file, text);

console.log("DONE - repaired parse error, hint shows best engine move only");