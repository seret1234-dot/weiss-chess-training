import fs from "fs";

const file = "src/pages/endgames/LucenaTrainer.tsx";
let s = fs.readFileSync(file, "utf8");

if (!s.includes("function whiteHasQueen")) {
  s = s.replace(
    "  function blackPawnStillExists",
`  function whiteHasQueen(gameToCheck: Chess) {
    return gameToCheck
      .board()
      .some((rank) =>
        rank.some((piece) => piece?.type === "q" && piece.color === "w"),
      );
  }

  function blackPawnStillExists`
  );
}

s = s.replace(
/function userMoveCompletesGoal\(nextGame: Chess\) \{[\s\S]*?^\s*\}/m,
`function userMoveCompletesGoal(nextGame: Chess) {
    return nextGame.isCheckmate() || whiteHasQueen(nextGame);
  }`
);

s = s.replace(
/async function validateByEngine\([\s\S]*?\n  function onDrop/m,
`async function validateByEngine(
    beforeFen: string,
    afterFen: string,
    attemptedUci: string,
    nextGame: Chess,
  ) {
    if (userMoveCompletesGoal(nextGame)) {
      return { ok: true, reason: "", afterUser: null };
    }

    const before = engineInfo ?? (await evaluatePosition(beforeFen));
    const afterUser = await evaluatePosition(afterFen);

    if (!before || !afterUser) {
      return { ok: false, reason: "Engine did not answer.", afterUser };
    }

    if (before.bestMove === attemptedUci) {
      return { ok: true, reason: "", afterUser };
    }

    return {
      ok: false,
      reason: before.bestMove
        ? \`Use the engine-best Lucena move: \${before.bestMove}\`
        : "This is not the engine-best Lucena move.",
      afterUser,
    };
  }

  function onDrop`
);

s = s.replace(
/const defensiveReply = chooseBestBlackDefense\([\s\S]*?\);/,
`const legalReplies = getLegalUciMoves(afterUserGame);
    const defensiveReply =
      replyInfo?.bestMove && legalReplies.includes(replyInfo.bestMove)
        ? replyInfo.bestMove
        : legalReplies[0] ?? null;`
);

fs.writeFileSync(file, s);
console.log("DONE: Lucena validation cleaned: solve only by promotion/mate, no KRKP pawn shortcuts.");
