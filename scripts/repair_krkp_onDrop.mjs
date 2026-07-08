import fs from "fs";

const files = [
  "src/pages/endgames/KRKPTrainer.tsx",
  "src/pages/endgames/LucenaTrainer.tsx",
];

function replaceBlock(text, startText, endText, replacement) {
  const start = text.indexOf(startText);
  if (start === -1) throw new Error(`Missing start: ${startText}`);

  const end = text.indexOf(endText, start);
  if (end === -1) throw new Error(`Missing end: ${endText}`);

  return text.slice(0, start) + replacement + text.slice(end);
}

const cleanOnDrop = `function onDrop(sourceSquare: string, targetSquare: string) {
    if (!currentPosition || !progress || !currentThemeConfig) return false;
    if (
      loadingChunk ||
      loadError ||
      inputLocked ||
      allComplete ||
      phase === "classify"
    ) {
      return false;
    }

    if (game.turn() !== "w") return false;

    const beforeFen = game.fen();
    const nextGame = new Chess(beforeFen);
    const moveObj = nextGame.move({
      from: sourceSquare,
      to: targetSquare,
      promotion: "q",
    });

    if (!moveObj) return false;

    const move = {
      from: moveObj.from,
      to: moveObj.to,
      promotion: moveObj.promotion,
    };

    const attemptedUci = moveToUci(move);

    if (!whiteRookStillExists(nextGame)) {
      showWrongAndReset(nextGame, move, "Wrong move.", "You lost the rook.");
      return true;
    }

    if (blackCanCaptureWhiteRook(nextGame)) {
      showWrongAndReset(
        nextGame,
        move,
        "Wrong move.",
        "Black can capture your rook."
      );
      return true;
    }

    if (nextGame.isStalemate()) {
      showWrongAndReset(nextGame, move, "Wrong move.", "Stalemate — avoid this.");
      return true;
    }

    if (nextGame.isCheckmate()) {
      handleSolved(nextGame, move);
      return true;
    }

    setGame(nextGame);
    setLastMove({ from: move.from, to: move.to });
    clearHighlights();
    setJustMated(false);
    setInputLocked(true);
    setStatus("Checking move...");
    setMessage(engineReady ? "Engine is evaluating..." : "Engine not ready.");

    void (async () => {
      const validation = await validateByEngine(
        beforeFen,
        nextGame.fen(),
        attemptedUci,
        nextGame,
      );

      if (!validation.ok) {
        showWrongAndReset(nextGame, move, "Wrong move.", validation.reason);
        return;
      }

      await playEngineReplyIfNeeded(nextGame, move, validation.afterUser);
    })();

    return true;
  }

  `;

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.log("SKIP missing " + file);
    continue;
  }

  let text = fs.readFileSync(file, "utf8");
  text = replaceBlock(text, "function onDrop(", "useRegisterPlayableBoard({", cleanOnDrop + "useRegisterPlayableBoard({");
  fs.writeFileSync(file, text);
  console.log("FIXED " + file);
}
