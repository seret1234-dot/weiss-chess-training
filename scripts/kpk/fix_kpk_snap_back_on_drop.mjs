import fs from "fs";
import path from "path";

const file = path.join(
  process.cwd(),
  "src",
  "pages",
  "endgames",
  "KPKTrainer.tsx"
);

if (!fs.existsSync(file)) {
  throw new Error(`Missing file:\n${file}`);
}

const backup = file.replace(
  /\.tsx$/,
  `.before_force_reply_onDrop_${Date.now()}.tsx`
);

fs.copyFileSync(file, backup);

let code = fs.readFileSync(file, "utf8");

code = code.replace(
  /function onDrop\(sourceSquare: string, targetSquare: string\) \{[\s\S]*?\n  useRegisterPlayableBoard/,
  `function onDrop(sourceSquare: string, targetSquare: string) {
    if (!currentPosition) return false;
    if (loadingChunk || loadError || allComplete) return false;

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

    // Show move immediately
    setGame(nextGame);
    setLastMove({ from: move.from, to: move.to });
    clearHighlights();
    setJustMated(false);
    setInputLocked(false);

    // Promotion instantly succeeds
    if (move.promotion || moveObj.promotion || hasWhiteQueenExact(nextGame)) {
      handleSolved(nextGame, move);
      return true;
    }

    if (nextGame.isGameOver()) {
      setStatus("Position ended.");
      setMessage("");
      setInputLocked(false);
      return true;
    }

    setStatus("Checking move...");
    setMessage("Evaluating...");

    void (async () => {
      const validation = await validateByEngine(
        beforeFen,
        nextGame.fen(),
        attemptedUci,
        nextGame,
      );

      if (!validation.ok) {
        showWrongAndReset(
          nextGame,
          move,
          "Wrong move — try again.",
          validation.reason,
        );
        return;
      }

      // If Black to move, get engine reply first.
      if (nextGame.turn() === "b") {
        let replyInfo = null;

        try {
          replyInfo = await evaluatePosition(nextGame.fen());
        } catch {
          replyInfo = null;
        }

        await playEngineReplyIfNeeded(nextGame, move, replyInfo);
        return;
      }

      // Otherwise continue normally.
      setStatus(getInstructionText(currentPosition, currentThemeConfig));
      setMessage("Your move.");
      setInputLocked(false);
      moveStartedAtRef.current = Date.now();
      setCurrentMoveElapsedMs(0);

      void analyzeCurrentFen(nextGame.fen());
    })();

    return true;
  }

  useRegisterPlayableBoard`
);

fs.writeFileSync(file, code, "utf8");

console.log("DONE");
console.log("Backup:");
console.log(backup);
console.log("Updated:");
console.log(file);