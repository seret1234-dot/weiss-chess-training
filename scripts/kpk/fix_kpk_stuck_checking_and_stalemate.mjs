import fs from "fs";

const file = "src/pages/endgames/KPKTrainer.tsx";
let s = fs.readFileSync(file, "utf8");

// Fix bad undefined userMove in direct stalemate branch
s = s.replace(
`    if (nextGame.isStalemate()) {
      showWrongAndReset(
        nextGame,
        userMove,
        "Stalemate — fail.",
        "You let the defender escape.",
      );
      return true;
    }`,
`    if (nextGame.moves().length === 0 && !nextGame.isCheckmate()) {
      clearPendingFeedbackTimeout();
      setGame(nextGame);
      setLastMove({ from: move.from, to: move.to });
      setMarkedSquare(getBlackKingSquare(nextGame));
      setCorrectSquares([]);
      setHintSquares([]);
      setEscapeSquares([]);
      setJustMated(false);
      setJustStalemated(true);
      setStatus("STALEMATE — FAIL");
      setMessage("Stalemate is a failed conversion. Try again from the beginning.");
      setInputLocked(true);

      feedbackTimeoutRef.current = window.setTimeout(() => {
        loadPosition(currentIndex);
      }, WRONG_DELAY_MS);

      return true;
    }`
);

// Add safe catch to Checking move async block
s = s.replace(
`    void (async () => {
      const validation = await withTimeout(
        validateByEngine(beforeFen, nextGame.fen(), attemptedUci, nextGame),
        900,
        { ok: true, reason: "", afterUser: null },
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

      const replyInfo = await withTimeout(
        evaluatePosition(nextGame.fen()),
        900,
        null,
      );

      await playEngineReplyIfNeeded(nextGame, move, replyInfo);
    })();`,
`    void (async () => {
      try {
        const validation = await withTimeout(
          validateByEngine(beforeFen, nextGame.fen(), attemptedUci, nextGame),
          900,
          { ok: true, reason: "", afterUser: null },
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

        const replyInfo = await withTimeout(
          evaluatePosition(nextGame.fen()),
          900,
          null,
        );

        await playEngineReplyIfNeeded(nextGame, move, replyInfo);
      } catch (err) {
        console.error("KPK move check failed:", err);
        showWrongAndReset(
          nextGame,
          move,
          "Wrong move — try again.",
          "Move checking failed, so the position is restarting.",
        );
      }
    })();`
);

fs.writeFileSync(file, s, "utf8");
console.log("DONE: fixed stalemate fail + checking move lock");
