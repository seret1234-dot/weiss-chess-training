import fs from "fs";

const file = "src/pages/endgames/LucenaTrainer.tsx";
let s = fs.readFileSync(file, "utf8");

s = s.replace(
`  async function evaluatePosition(fen: string) {
    if (!engineRef.current) return null;
    try {
      return await engineRef.current.analyze(fen, ENGINE_DEPTH);
    } catch {
      return null;
    }
  }`,
`  async function evaluatePosition(fen: string) {
    if (!engineRef.current) return null;
    try {
      return await engineRef.current.analyze(fen, ENGINE_DEPTH);
    } catch (err) {
      console.error("Lucena engine error:", err);
      return null;
    }
  }`
);

s = s.replace(
`    const analysis = engineInfo ?? (await evaluatePosition(game.fen()));`,
`    const analysis = await evaluatePosition(game.fen());

    if (!analysis) {
      setStatus("Hint unavailable");
      setMessage("Engine did not answer. Try Restart position.");
      setInputLocked(false);
      return;
    }`
);

s = s.replace(
`      const validation = await validateByEngine(
        beforeFen,
        nextGame.fen(),
        attemptedUci,
        nextGame,
      );`,
`      let validation;
      try {
        validation = await validateByEngine(
          beforeFen,
          nextGame.fen(),
          attemptedUci,
          nextGame,
        );
      } catch (err) {
        console.error("Lucena validation crashed:", err);
        setStatus("Engine error");
        setMessage("Move check failed. Position unlocked.");
        setInputLocked(false);
        return;
      }`
);

s = s.replace(
`      await playEngineReplyIfNeeded(nextGame, move, validation.afterUser);`,
`      try {
        await playEngineReplyIfNeeded(nextGame, move, validation.afterUser);
      } catch (err) {
        console.error("Lucena black reply crashed:", err);
        setStatus("Engine reply error");
        setMessage("Black reply failed. Position unlocked.");
        setInputLocked(false);
      }`
);

fs.writeFileSync(file, s);
console.log("DONE: Lucena no longer freezes on engine/hint errors.");
