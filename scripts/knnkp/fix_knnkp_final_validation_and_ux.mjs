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

// 1) Remove direct checkmate auto-accept from onDrop.
// This was bypassing validateByEngine.
code = code.replace(
  /\n\s*if \(nextGame\.isCheckmate\(\)\) \{\s*handleSolved\(nextGame, move\);\s*return true;\s*\}\n/g,
  `\n    // Checkmate is validated by validateByEngine below.\n`
)

// 2) Replace validateByEngine with strict KNNKP logic.
const start = code.indexOf("async function validateByEngine(")
const end = code.indexOf("function onDrop", start)

if (start === -1 || end === -1) {
  console.error("Could not find validateByEngine or onDrop.")
  process.exit(1)
}

const validateReplacement = `async function validateByEngine(
    beforeFen: string,
    afterFen: string,
    attemptedUci: string,
    nextGame: Chess,
  ) {
    if (!blackPawnStillExists(nextGame)) {
      return {
        ok: false,
        reason:
          "Wrong: do not capture the pawn. Two knights alone cannot force mate against a bare king.",
        afterUser: null,
      };
    }

    const before = engineInfo ?? (await evaluatePosition(beforeFen));
    const afterUser = await evaluatePosition(afterFen);

    if (!before || !afterUser) {
      return {
        ok: false,
        reason: "Engine error. Could not evaluate this move.",
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

    if (before.bestMove && attemptedUci === before.bestMove) {
      return { ok: true, reason: "", afterUser };
    }

    return {
      ok: false,
      reason: before.bestMove
        ? \`Wrong move. Best move is \${before.bestMove}.\`
        : "Wrong move. Use a move that keeps the forced mate.",
      afterUser,
    };
  }

  `

code = code.slice(0, start) + validateReplacement + code.slice(end)

// 3) Improve wrong-move retry message.
code = code.replace(
  /setMessage\("Try again\. Keep the pawn alive and reduce the mate distance\."\);/g,
  `setMessage("Try again. Keep the pawn alive and do not increase the mate distance.");`
)

// 4) Clear stale mate countdown when loading a new position.
code = code.replace(
  /setJustMated\(false\);\s*moveStartedAtRef\.current = Date\.now\(\);/g,
  `setJustMated(false);
    setMateCountdown(null);
    moveStartedAtRef.current = Date.now();`
)

// 5) Make hint message clearer.
code = code.replace(
  /setStatus\("Hint"\);\s*setMessage\(\s*`Best move: \$\{parsed\.from\} → \$\{parsed\.to\}\$\{parsed\.promotion \? ` \(\$\{parsed\.promotion\}\)` : ""\}`,\s*\);/g,
  `setStatus("Hint");
    setMessage(
      \`Engine hint: \${parsed.from} → \${parsed.to}\${parsed.promotion ? \` (\${parsed.promotion})\` : ""}\`,
    );`
)

fs.writeFileSync(filePath, code)

console.log("DONE")
console.log(filePath)