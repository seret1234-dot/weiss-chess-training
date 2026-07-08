import fs from "fs";

const file = "src/pages/endgames/KPKTrainer.tsx";
let s = fs.readFileSync(file, "utf8");

// 1) Add/replace helper after getLegalUciMoves
if (!s.includes("function isKpkStalemate(")) {
  s = s.replace(
`function chooseHintMove(game: Chess, engineInfo: EngineResult | null) {`,
`function isKpkStalemate(gameToCheck: Chess) {
  return gameToCheck.moves().length === 0 && !gameToCheck.isCheckmate();
}

function chooseHintMove(game: Chess, engineInfo: EngineResult | null) {`
  );
}

// 2) Replace undefined/bad helper name
s = s.replaceAll("isRealStalemate(afterUserGame)", "isKpkStalemate(afterUserGame)");
s = s.replaceAll("afterUserGame.isStalemate()", "isKpkStalemate(afterUserGame)");

// 3) Promotion ends puzzle, but only real checkmate shows mate overlay
s = s.replace(
/function userMoveCompletesGoal\(nextGame: Chess\) \{[\s\S]*?return nextGame\.isCheckmate\(\);[\s\S]*?\}/,
`function userMoveCompletesGoal(nextGame: Chess) {
    return nextGame.isCheckmate() || hasWhiteQueenExact(nextGame);
  }`
);

s = s.replaceAll(
  "setJustMated(nextGame.isCheckmate() || hasWhiteQueenExact(nextGame));",
  "setJustMated(nextGame.isCheckmate());"
);

s = s.replaceAll(
  'setStatus(nextGame.isCheckmate() ? "CHECKMATE!" : "Correct — result preserved.");',
  'setStatus(nextGame.isCheckmate() ? "CHECKMATE!" : "PROMOTION!");'
);

// 4) Replace the whole playEngineReplyIfNeeded with a clean version
s = s.replace(
/async function playEngineReplyIfNeeded\([\s\S]*?\n  async function showHintAction\(\)/,
`async function playEngineReplyIfNeeded(
    afterUserGame: Chess,
    userMove: { from: string; to: string; promotion?: string },
    afterUserInfo?: EngineResult | null,
  ) {
    if (userMoveCompletesGoal(afterUserGame)) {
      handleSolved(afterUserGame, userMove);
      return;
    }

    if (isKpkStalemate(afterUserGame)) {
      clearPendingFeedbackTimeout();

      setGame(afterUserGame);
      setLastMove({ from: userMove.from, to: userMove.to });
      setMarkedSquare(getBlackKingSquare(afterUserGame));
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

      return;
    }

    if (afterUserGame.isGameOver()) {
      setGame(afterUserGame);
      setLastMove({ from: userMove.from, to: userMove.to });
      setStatus("Game over");
      setMessage("Position ended.");
      setInputLocked(false);
      return;
    }

    const defensiveReply = chooseLegalReplyFallback(
      afterUserGame,
      afterUserInfo?.bestMove ?? null,
    );

    if (!defensiveReply) {
      setGame(afterUserGame);
      setLastMove({ from: userMove.from, to: userMove.to });
      clearHighlights();
      setStatus(getInstructionText(currentPosition, currentThemeConfig));
      setMessage("Accepted move. No black reply available.");
      setInputLocked(false);
      moveStartedAtRef.current = Date.now();
      setCurrentMoveElapsedMs(0);
      void analyzeCurrentFen(afterUserGame.fen());
      return;
    }

    setGame(afterUserGame);
    setLastMove({ from: userMove.from, to: userMove.to });
    clearHighlights();
    setStatus("Good move.");
    setMessage(\`Black is replying: \${defensiveReply}\`);
    setInputLocked(true);

    await sleep(ENGINE_REPLY_DELAY_MS);

    const replyResult = applyUciMoveToGame(afterUserGame.fen(), defensiveReply);

    if (!replyResult) {
      setStatus(getInstructionText(currentPosition, currentThemeConfig));
      setMessage("Accepted move, but black reply could not be played.");
      setInputLocked(false);
      moveStartedAtRef.current = Date.now();
      setCurrentMoveElapsedMs(0);
      void analyzeCurrentFen(afterUserGame.fen());
      return;
    }

    setGame(replyResult.game);
    setLastMove({ from: replyResult.move.from, to: replyResult.move.to });
    clearHighlights();
    setStatus(getInstructionText(currentPosition, currentThemeConfig));
    setMessage(\`Black played \${defensiveReply}. Your move.\`);
    setInputLocked(false);
    setJustMated(false);
    setJustStalemated(false);
    setMateCountdown(null);
    moveStartedAtRef.current = Date.now();
    setCurrentMoveElapsedMs(0);
    void analyzeCurrentFen(replyResult.game.fen());
  }

  async function showHintAction()`
);

fs.writeFileSync(file, s, "utf8");
console.log("DONE: cleaned KPK stalemate/promotion logic");
