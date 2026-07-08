import fs from "fs";

const file = "src/pages/endgames/LucenaTrainer.tsx";
let s = fs.readFileSync(file, "utf8");

s = s.replace(
`    const defensiveReply = replyInfo?.bestMove ?? null;`,
`    const legalReplies = getLegalUciMoves(afterUserGame);
    const defensiveReply =
      replyInfo?.bestMove && legalReplies.includes(replyInfo.bestMove)
        ? replyInfo.bestMove
        : legalReplies[0] ?? null;`
);

s = s.replace(
`      setStatus("Engine reply error");
        setMessage("Black reply failed. Position unlocked.");
        setInputLocked(false);`,
`      console.error("Lucena black reply crashed:", err);
        setStatus("Black reply skipped");
        setMessage("Engine reply failed, but position is unlocked. Continue.");
        setGame(nextGame);
        setInputLocked(false);`
);

fs.writeFileSync(file, s);
console.log("DONE: Lucena black reply now only uses legal engine moves and falls back safely.");
