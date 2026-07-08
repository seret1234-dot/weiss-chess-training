import fs from "fs";

const file = "src/pages/endgames/KRKPTrainer.tsx";
let s = fs.readFileSync(file, "utf8");

s = s.replace(
`    const defensiveReply = chooseBestBlackDefense(
      afterUserGame,
      replyInfo?.bestMove ?? null,
    );`,
`    const defensiveReply =
      replyInfo?.bestMove && getLegalUciMoves(afterUserGame).includes(replyInfo.bestMove)
        ? replyInfo.bestMove
        : chooseBestBlackDefense(afterUserGame, replyInfo?.bestMove ?? null);`
);

fs.writeFileSync(file, s);
console.log("DONE: KRKP black now prefers engine best reply.");
