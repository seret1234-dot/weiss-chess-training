import fs from "fs";
import path from "path";

const file = path.join(
  process.cwd(),
  "src",
  "pages",
  "endgames",
  "KPKTrainer.tsx"
);

if (!fs.existsSync(file)) throw new Error(`Missing file:\n${file}`);

const backup = file.replace(/\.tsx$/, `.before_reply_timeout_${Date.now()}.tsx`);
fs.copyFileSync(file, backup);

let code = fs.readFileSync(file, "utf8");

// Add timeout helper if missing
if (!code.includes("function withTimeout")) {
  code = code.replace(
    `function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}`,
    `function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => window.setTimeout(() => resolve(fallback), ms)),
  ]);
}`
  );
}

// Replace validation block inside onDrop
code = code.replace(
  `const validation = await validateByEngine(
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

      let replyInfo = null;

      try {
        replyInfo = await evaluatePosition(nextGame.fen());
      } catch {
        replyInfo = null;
      }

      await playEngineReplyIfNeeded(nextGame, move, replyInfo);`,
  `const validation = await withTimeout(
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

      await playEngineReplyIfNeeded(nextGame, move, replyInfo);`
);

fs.writeFileSync(file, code, "utf8");

console.log("DONE");
console.log("Backup:");
console.log(backup);
console.log("Updated:");
console.log(file);