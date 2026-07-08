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

// 1) Shorter wrong delay
code = code.replace(
  "const WRONG_DELAY_MS = 2600;",
  "const WRONG_DELAY_MS = 1200;"
)

// 2) Cleaner retry message
code = code.replace(
  /setMessage\("Try again\. Keep the pawn alive and do not increase the mate distance\."\);/g,
  `setMessage("Try again from the same position.");`
)

// 3) Better wrong-move message when mate increases
code = code.replace(
  /reason: `Wrong: mate increased \(\$\{beforeMate\} → \$\{afterMate\}\)\.`/g,
  `reason: \`Wrong: mate got longer (\${beforeMate} → \${afterMate}). Keep tightening the net.\``
)

// 4) Highlight best move on wrong move if engine has one
code = code.replace(
  /showWrongAndReset\(nextGame, move, "Wrong move\.", validation\.reason\);/g,
  `{
          const best = validation.afterUser?.bestMove ?? engineInfo?.bestMove ?? null;
          const parsedBest = parseUciMove(best);
          if (parsedBest) {
            setMarkedSquare(parsedBest.from);
            setHintSquares([parsedBest.to]);
          }
          showWrongAndReset(nextGame, move, "Wrong move.", validation.reason);
        }`
)

// 5) Remove dead strict route shortcut safely
code = code.replace(
  /\n\s*const strictChunk = false;\n\s*const hasPreparedRoute = false;\n/g,
  `\n`
)

code = code.replace(
  /\n\s*if \(\s*\(strictChunk \|\| hasPreparedRoute\) &&\s*legalAllowedMoves\.includes\(attemptedUci\)\s*\) \{\s*await playEngineReplyIfNeeded\(nextGame, move\);\s*return;\s*\}\n/g,
  `\n`
)

code = code.replace(
  /\n\s*if \(strictChunk \|\| hasPreparedRoute\) \{\s*showWrongAndReset\([\s\S]*?return;\s*\}\n\s*showWrongAndReset\(nextGame, move, "Wrong move\.", validation\.reason\);/g,
  `\n        {
          const best = validation.afterUser?.bestMove ?? engineInfo?.bestMove ?? null;
          const parsedBest = parseUciMove(best);
          if (parsedBest) {
            setMarkedSquare(parsedBest.from);
            setHintSquares([parsedBest.to]);
          }
          showWrongAndReset(nextGame, move, "Wrong move.", validation.reason);
        }`
)

// 6) Improve hint wording
code = code.replace(
  /`Engine hint: \$\{parsed\.from\} → \$\{parsed\.to\}\$\{parsed\.promotion \? ` \(\$\{parsed\.promotion\}\)` : ""\}`/g,
  "`Best move: ${parsed.from} → ${parsed.to}${parsed.promotion ? ` (${parsed.promotion})` : \"\"}`"
)

fs.writeFileSync(filePath, code)

console.log("DONE")
console.log(filePath)