import fs from "fs";

const file = "src/pages/endgames/LucenaTrainer.tsx";
let s = fs.readFileSync(file, "utf8");

s = s.replace(
`const defensiveReply =
      replyInfo?.bestMove && legalReplies.includes(replyInfo.bestMove)
        ? replyInfo.bestMove
        : legalReplies[0] ?? null;`,
`const defensiveReply =
      replyInfo?.bestMove && legalReplies.includes(replyInfo.bestMove)
        ? replyInfo.bestMove
        : null;`
);

s = s.replace(
`    if (!defensiveReply) {
      setStatus(getInstructionText(currentPosition, currentThemeConfig));
      setMessage("No black reply available. Continue.");
      setInputLocked(false);
      moveStartedAtRef.current = Date.now();
      setCurrentMoveElapsedMs(0);
      await analyzeCurrentFen(afterUserGame.fen());
      return;
    }`,
`    if (!defensiveReply) {
      setStatus("Engine reply unavailable");
      setMessage("No valid engine defense found. Position unlocked.");
      setInputLocked(false);
      moveStartedAtRef.current = Date.now();
      setCurrentMoveElapsedMs(0);
      await analyzeCurrentFen(afterUserGame.fen());
      return;
    }`
);

fs.writeFileSync(file, s);
console.log("DONE: Lucena black now only plays engine-best legal replies.");
