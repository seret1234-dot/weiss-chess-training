import fs from "fs";

const files = [
  "src/pages/endgames/KRKPTrainer.tsx",
  "src/pages/endgames/LucenaTrainer.tsx",
];

function replaceFunction(text, name, replacement) {
  let start = text.indexOf(`async function ${name}`);
  let prefix = "async function";

  if (start === -1) {
    start = text.indexOf(`function ${name}`);
    prefix = "function";
  }

  if (start === -1) {
    console.log(`SKIP: missing ${name}`);
    return text;
  }

  const braceStart = text.indexOf("{", start);
  let depth = 0;

  for (let i = braceStart; i < text.length; i++) {
    if (text[i] === "{") depth++;
    if (text[i] === "}") depth--;

    if (depth === 0) {
      return text.slice(0, start) + replacement + text.slice(i + 1);
    }
  }

  throw new Error(`Could not replace ${name}`);
}

const validateByEngine = `async function validateByEngine(
    beforeFen: string,
    afterFen: string,
    attemptedUci: string,
    nextGame: Chess,
  ) {
    if (!whiteRookStillExists(nextGame)) {
      return { ok: false, reason: "You lost the rook.", afterUser: null };
    }

    if (blackCanCaptureWhiteRook(nextGame)) {
      return { ok: false, reason: "Black can capture your rook.", afterUser: null };
    }

    if (nextGame.isCheckmate()) {
      return { ok: true, reason: "", afterUser: null };
    }

    if (!blackPawnStillExists(nextGame)) {
      return { ok: true, reason: "", afterUser: null };
    }

    if (whiteCanCaptureBlackPawn(nextGame)) {
      return { ok: true, reason: "", afterUser: null };
    }

    const before = engineInfo ?? (await evaluatePosition(beforeFen));
    const afterUser = await evaluatePosition(afterFen);

    if (!before || !afterUser) {
      return { ok: false, reason: "Could not evaluate this move.", afterUser };
    }

    if (before.bestMove === attemptedUci) {
      return { ok: true, reason: "", afterUser };
    }

    if (isClearlyWinningForWhite(afterUser)) {
      return { ok: true, reason: "", afterUser };
    }

    return {
      ok: false,
      reason: "This move may let the position become drawn.",
      afterUser,
    };
  }`;

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.log(`SKIP missing file: ${file}`);
    continue;
  }

  let text = fs.readFileSync(file, "utf8");
  text = replaceFunction(text, "validateByEngine", validateByEngine);
  fs.writeFileSync(file, text);
  console.log(`DONE: ${file}`);
}
