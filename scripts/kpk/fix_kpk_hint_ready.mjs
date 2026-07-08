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

const backup = file.replace(/\.tsx$/, `.before_hint_ready_${Date.now()}.tsx`);
fs.copyFileSync(file, backup);

let code = fs.readFileSync(file, "utf8");

// Add state for last hinted move if missing
if (!code.includes("lastHintMoveRef")) {
  code = code.replace(
    `const analysisTokenRef = useRef(0);`,
    `const analysisTokenRef = useRef(0);
  const lastHintMoveRef = useRef<string | null>(null);`
  );
}

// Force hint to analyze current FEN fresh
code = code.replace(
  /async function showHintAction\(\) \{[\s\S]*?\n  async function validateByEngine/,
  `async function showHintAction() {
    if (loadingChunk || inputLocked || !currentPosition || phase === "classify")
      return;

    setStatus("Hint");
    setMessage("Engine is finding the best move...");

    const analysis = await evaluatePosition(game.fen());
    setEngineInfo(analysis);

    const hintMoveUci = chooseHintMove(
      game,
      currentPosition,
      currentChunkFile,
      analysis,
    );

    if (!hintMoveUci) {
      setStatus("Hint");
      setMessage("No legal hint available yet. Try again in a moment.");
      return;
    }

    lastHintMoveRef.current = hintMoveUci;

    const parsed = parseUciMove(hintMoveUci);
    if (!parsed) {
      setStatus("Hint");
      setMessage(\`Suggested move: \${hintMoveUci}\`);
      return;
    }

    setMarkedSquare(parsed.from);
    setHintSquares([parsed.to]);
    setEscapeSquares([]);
    setStatus("Hint");
    setMessage(
      \`Best move: \${parsed.from} → \${parsed.to}\${parsed.promotion ? \` (\${parsed.promotion})\` : ""}\`,
    );
  }

  async function validateByEngine`
);

// Accept last hinted move
code = code.replace(
  `const beforeInfo = engineInfo ?? (await evaluatePosition(beforeFen));
  const afterInfo = await evaluatePosition(afterFen);`,
  `const beforeInfo = engineInfo ?? (await evaluatePosition(beforeFen));
  const afterInfo = await evaluatePosition(afterFen);

  if (lastHintMoveRef.current && attemptedUci === lastHintMoveRef.current) {
    lastHintMoveRef.current = null;
    return { ok: true, reason: "", afterUser: afterInfo };
  }`
);

fs.writeFileSync(file, code, "utf8");

console.log("DONE");
console.log("Backup:");
console.log(backup);
console.log("Updated:");
console.log(file);