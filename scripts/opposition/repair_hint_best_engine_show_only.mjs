import fs from "fs";

const file =
  "C:/Users/Ariel/chess-trainer/src/pages/endgames/OppositionTrainer.tsx";

let text = fs.readFileSync(file, "utf8");

function replaceFunction(source, functionName, replacement) {
  const asyncMarker = `async function ${functionName}(`;
  const normalMarker = `function ${functionName}(`;

  let start = source.indexOf(asyncMarker);
  if (start === -1) start = source.indexOf(normalMarker);

  if (start === -1) {
    throw new Error(`Could not find ${functionName}()`);
  }

  const openBrace = source.indexOf("{", start);
  if (openBrace === -1) {
    throw new Error(`Could not find opening brace for ${functionName}()`);
  }

  let depth = 0;
  let end = -1;

  for (let i = openBrace; i < source.length; i++) {
    const ch = source[i];

    if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;

    if (depth === 0) {
      end = i + 1;
      break;
    }
  }

  if (end === -1) {
    throw new Error(`Could not find closing brace for ${functionName}()`);
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

  if (engineInfo?.bestMove && legalMoves.has(engineInfo.bestMove)) {
    return engineInfo.bestMove;
  }

  const legalAllowedMoves = currentPosition.allowedMoves.filter((uci) =>
    legalMoves.has(uci),
  );

  if (legalAllowedMoves.length > 0) {
    return legalAllowedMoves[0];
  }

  return null;
}`;

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

    const promotionText = parsed.promotion ? " (" + parsed.promotion + ")" : "";

    setStatus("Hint");
    setMessage(
      "Best engine move: " + parsed.from + " → " + parsed.to + promotionText,
    );

    setInputLocked(false);
  }`;

text = replaceFunction(text, "chooseHintMove", chooseHintMoveReplacement);
text = replaceFunction(text, "showHintAction", showHintActionReplacement);

fs.writeFileSync(file, text);

console.log("DONE - repaired hint: best engine move, show only, no autoplay");