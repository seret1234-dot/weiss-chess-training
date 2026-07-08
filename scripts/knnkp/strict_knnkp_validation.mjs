import fs from "fs"
import path from "path"

const ROOT = "C:\\Users\\Ariel\\chess-trainer"

const filePath = path.join(
  ROOT,
  "src",
  "pages",
  "endgames",
  "KNNKPForcedMateTrainer.tsx"
)

let code = fs.readFileSync(filePath, "utf8")

const start = code.indexOf("async function validateByEngine(")
const end = code.indexOf("function onDrop", start)

if (start === -1 || end === -1) {
  console.error("Could not find validateByEngine or onDrop.")
  process.exit(1)
}

const replacement = `async function validateByEngine(
    beforeFen: string,
    afterFen: string,
    attemptedUci: string,
    nextGame: Chess,
  ) {
    // KNNKP forced mate: never allow pawn capture.
    if (!blackPawnStillExists(nextGame)) {
      return {
        ok: false,
        reason:
          "Wrong: do not capture the pawn. Two knights alone cannot force mate against a bare king.",
        afterUser: null,
      };
    }

    if (nextGame.isCheckmate()) {
      return { ok: true, reason: "", afterUser: null };
    }

    const before = engineInfo ?? (await evaluatePosition(beforeFen));
    const afterUser = await evaluatePosition(afterFen);

    if (!before || !afterUser) {
      return {
        ok: false,
        reason: "Could not evaluate this move.",
        afterUser,
      };
    }

    // Strict training: require the engine best move.
    // This prevents random winning moves from being accepted.
    if (before.bestMove && attemptedUci !== before.bestMove) {
      return {
        ok: false,
        reason: \`Wrong move. Best move is \${before.bestMove}.\`,
        afterUser,
      };
    }

    if (typeof before.mate === "number" && typeof afterUser.mate === "number") {
      const beforeMate = Math.abs(before.mate);
      const afterMate = Math.abs(afterUser.mate);

      setMateCountdown({ before: beforeMate, after: afterMate });

      if (afterMate <= beforeMate) {
        return { ok: true, reason: "", afterUser };
      }

      return {
        ok: false,
        reason: \`Wrong: mate increased (\${beforeMate} → \${afterMate}).\`,
        afterUser,
      };
    }

    return {
      ok: false,
      reason: "Wrong move. Use the engine-best move to keep the forced mate.",
      afterUser,
    };
  }

  `

code = code.slice(0, start) + replacement + code.slice(end)

fs.writeFileSync(filePath, code)

console.log("DONE")
console.log(filePath)