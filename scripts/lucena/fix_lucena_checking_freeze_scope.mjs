import fs from "fs";

const file = "src/pages/endgames/LucenaTrainer.tsx";
let s = fs.readFileSync(file, "utf8");

// fix bad references from previous patch
s = s.replaceAll(
  "userMoveCompletesGoal(afterUserGame, afterUserInfo ?? replyInfo ?? null)",
  "userMoveCompletesGoal(afterUserGame, afterUserInfo ?? null)"
);

s = s.replaceAll(
  "userMoveCompletesGoal(nextGame, afterUser)",
  "userMoveCompletesGoal(nextGame)"
);

// make validation never freeze
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
        console.error("Lucena validate error:", err);
        setStatus("Move check failed");
        setMessage("Position unlocked. Try again.");
        setInputLocked(false);
        return;
      }`
);

fs.writeFileSync(file, s);
console.log("DONE: fixed Lucena checking-move freeze.");
