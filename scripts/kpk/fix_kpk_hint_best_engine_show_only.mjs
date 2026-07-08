import fs from "fs";

const file = "C:/Users/Ariel/chess-trainer/src/trainers/KPKTrainer.tsx";
const backup =
  "C:/Users/Ariel/chess-trainer/src/trainers/KPKTrainer.before_hint_fix.tsx";

let text = fs.readFileSync(file, "utf8");
fs.writeFileSync(backup, text);

const marker = "async function showHint()";
const start = text.indexOf(marker);

if (start === -1) {
  throw new Error("Could not find showHint()");
}

const openBrace = text.indexOf("{", start);

if (openBrace === -1) {
  throw new Error("Could not find opening brace for showHint()");
}

let depth = 0;
let end = -1;

for (let i = openBrace; i < text.length; i++) {
  const ch = text[i];

  if (ch === "{") depth++;
  if (ch === "}") depth--;

  if (depth === 0) {
    end = i + 1;
    break;
  }
}

if (end === -1) {
  throw new Error("Could not find closing brace for showHint()");
}

const replacement = `async function showHint() {
    const info = engineInfo ?? (await analyzeFen(game.fen()));
    const bestMove = info?.bestMove;
    const parsed = parseUciMove(bestMove);

    if (!parsed) {
      setMessage("No engine hint available.");
      setHintSquares([]);
      return;
    }

    setHintSquares([parsed.from, parsed.to]);

    const promotionText = parsed.promotion
      ? " (" + parsed.promotion + ")"
      : "";

    setMessage(
      "Best engine move: " +
        parsed.from +
        " → " +
        parsed.to +
        promotionText,
    );
  }`;

text = text.slice(0, start) + replacement + text.slice(end);

fs.writeFileSync(file, text);

console.log("DONE - KPK hint shows best engine move only");
console.log("Backup saved:", backup);