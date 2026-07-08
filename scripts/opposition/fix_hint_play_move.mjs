import fs from "fs";

const file =
  "C:/Users/Ariel/chess-trainer/src/pages/endgames/OppositionTrainer.tsx";

let text = fs.readFileSync(file, "utf8");

const marker = "async function showHintAction()";
const start = text.indexOf(marker);

if (start === -1) {
  throw new Error("Could not find showHintAction()");
}

const openBrace = text.indexOf("{", start);

if (openBrace === -1) {
  throw new Error("Could not find opening brace for showHintAction()");
}

let depth = 0;
let end = -1;

for (let i = openBrace; i < text.length; i++) {
  const ch = text[i];

  if (ch === "{") depth++;
  if (ch === "}") depth--;

  if (depth === 0) {
    end = i + 1;
    break;
  }
}

if (end === -1) {
  throw new Error("Could not find closing brace for showHintAction()");
}

const replacement = `async function showHintAction() {
    if (
      loadingChunk ||
      inputLocked ||
      !currentPosition ||
      phase === "classify" ||
      allComplete
    ) {
      return;
    }

    clearPendingFeedbackTimeout();

    setInputLocked(true);
    setStatus("Hint");
    setMessage("Playing the best move...");

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
      setMessage("No legal hint move available.");
      setInputLocked(false);
      return;
    }

    lastHintMoveRef.current = hintMoveUci;

    const applied = applyUciMoveToGame(game.fen(), hintMoveUci);

    if (!applied) {
      const parsed = parseUciMove(hintMoveUci);

      if (parsed) {
        setMarkedSquare(parsed.from);
        setHintSquares([parsed.to]);
      }

      setStatus("Hint");
      setMessage(\`Suggested move: \${hintMoveUci}\`);
      setInputLocked(false);
      return;
    }

    setGame(applied.game);

    setLastMove({
      from: applied.move.from,
      to: applied.move.to,
    });

    setMarkedSquare(null);
    setEscapeSquares([]);
    setHintSquares([applied.move.to]);

    addCorrectSquare(applied.move.to);

    setCurrentMoveElapsedMs(
      Date.now() - moveStartedAtRef.current,
    );

    await sleep(250);

    await playEngineReplyIfNeeded(
      applied.game,
      applied.move,
      analysis,
    );
  }`;

text = text.slice(0, start) + replacement + text.slice(end);

fs.writeFileSync(file, text);

console.log("DONE - fixed hint to actually play the move");