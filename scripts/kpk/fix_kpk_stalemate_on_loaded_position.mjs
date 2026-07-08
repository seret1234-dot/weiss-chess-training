import fs from "fs";

const files = [
  "C:/Users/Ariel/chess-trainer/src/pages/endgames/KPKTrainer.tsx",
  "C:/Users/Ariel/chess-trainer/src/trainers/KPKTrainer.tsx",
];

for (const file of files) {
  if (!fs.existsSync(file)) continue;

  let text = fs.readFileSync(file, "utf8");
  fs.writeFileSync(
    file.replace(".tsx", ".before_loaded_stalemate_fix.tsx"),
    text,
  );

  if (text.includes("Loaded position is stalemate")) {
    console.log("Already patched:", file);
    continue;
  }

  const target = `setStatus(\`\${side} to move\`);
    setMessage(currentPosition.explanation || "Find a move that keeps the correct KPK result.");`;

  const replacement = `if (nextGame.isStalemate()) {
      setStatus("Stalemate — fail.");
      setMessage("Loaded position is stalemate. Restarting position.");
      setInputLocked(true);

      window.setTimeout(() => {
        setHintSquares([]);
        setInputLocked(false);
      }, WRONG_DELAY_MS);

      return;
    }

    setStatus(\`\${side} to move\`);
    setMessage(currentPosition.explanation || "Find a move that keeps the correct KPK result.");`;

  if (!text.includes(target)) {
    console.log("Could not find load-position status block in:", file);
    continue;
  }

  text = text.replace(target, replacement);

  fs.writeFileSync(file, text);
  console.log("DONE patched:", file);
}