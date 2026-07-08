import fs from "fs";

const paths = [
  "src/pages/endgames/KPKTrainer.tsx",
  "src/trainers/KPKTrainer.tsx",
];

function patchFile(file) {
  if (!fs.existsSync(file)) {
    console.log(`Skip missing: ${file}`);
    return;
  }

  let s = fs.readFileSync(file, "utf8");
  const original = s;

  // 1) make sure justStalemated state exists
  s = s.replace(
    `const [justMated, setJustMated] = useState(false);`,
    `const [justMated, setJustMated] = useState(false);
  const [justStalemated, setJustStalemated] = useState(false);`
  );

  // 2) reset stalemate flag everywhere mate flag resets
  s = s.replaceAll(
    `setJustMated(false);
    setMateCountdown(null);`,
    `setJustMated(false);
    setJustStalemated(false);
    setMateCountdown(null);`
  );

  s = s.replaceAll(
    `setJustMated(false);
        setMateCountdown(null);`,
    `setJustMated(false);
        setJustStalemated(false);
        setMateCountdown(null);`
  );

  // 3) hint only engine best move
  s = s.replace(
    /function chooseHintMove\([\s\S]*?\n}\n\nasync function findFirstIncompleteChunk/,
    `function chooseHintMove(game: Chess, engineInfo: EngineResult | null) {
  const legalMoves = new Set(getLegalUciMoves(game));
  const engineBestMove = engineInfo?.bestMove ?? null;

  if (engineBestMove && legalMoves.has(engineBestMove)) return engineBestMove;
  return null;
}

async function findFirstIncompleteChunk`
  );

  s = s.replace(
    /let hintMoveUci = chooseHintMove\([\s\S]*?\);\s*\/\/ Fallback:[\s\S]*?}\s*if \(!hintMoveUci\)/,
    `const hintMoveUci = chooseHintMove(game, analysis);

    if (!hintMoveUci)`
  );

  s = s.replace(
    `setMessage("No legal hint available.");`,
    `setMessage("Engine did not return a legal best move yet. Try hint again after the engine finishes analyzing.");`
  );

  // 4) hard stalemate fail before generic game over
  s = s.replace(
    /if \(afterUserGame\.isGameOver\(\)\) \{[\s\S]*?setInputLocked\(false\);\s*return;\s*\}/,
    `if (afterUserGame.isStalemate()) {
      clearPendingFeedbackTimeout();

      setGame(afterUserGame);
      setLastMove({ from: userMove.from, to: userMove.to });
      setMarkedSquare(getBlackKingSquare(afterUserGame));
      setCorrectSquares([]);
      setHintSquares([]);
      setEscapeSquares([]);
      setJustMated(false);
      setJustStalemated(true);

      setStatus("STALEMATE — FAIL");
      setMessage("Stalemate is a failed conversion. Restarting position.");
      setInputLocked(true);

      feedbackTimeoutRef.current = window.setTimeout(() => {
        loadPosition(currentIndex);
      }, WRONG_DELAY_MS);

      return;
    }

    if (afterUserGame.isGameOver()) {
      setGame(afterUserGame);
      setLastMove({ from: userMove.from, to: userMove.to });
      setStatus("Game over");
      setMessage("Position ended.");
      setInputLocked(false);
      return;
    }`
  );

  // 5) replace checkmate overlay with checkmate/stalemate overlay
  s = s.replace(
    /\{justMated && \([\s\S]*?\)\}/,
    `{(justMated || justStalemated) && (
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(0,0,0,0.72)",
                      zIndex: 30,
                      pointerEvents: "none",
                    }}
                  >
                    <div
                      style={{
                        padding: "20px 34px",
                        borderRadius: 18,
                        background: justMated
                          ? "linear-gradient(180deg,#1f7a1f,#145214)"
                          : "linear-gradient(180deg,#8b1e1e,#5e1111)",
                        color: "white",
                        fontSize: 42,
                        fontWeight: 900,
                        letterSpacing: 2,
                        boxShadow: "0 0 30px rgba(0,0,0,0.55)",
                      }}
                    >
                      {justMated ? "CHECKMATE" : "STALEMATE"}
                    </div>
                  </div>
                )}`
  );

  if (s === original) {
    console.log(`No changes made: ${file}`);
    return;
  }

  fs.writeFileSync(file, s, "utf8");
  console.log(`Patched: ${file}`);
}

for (const file of paths) patchFile(file);
console.log("DONE");