import fs from "fs";
import path from "path";

const file = path.join(
  process.cwd(),
  "src",
  "pages",
  "endgames",
  "OppositionTrainer.tsx"
);

if (!fs.existsSync(file)) {
  throw new Error("Could not find OppositionTrainer.tsx");
}

let s = fs.readFileSync(file, "utf8");

const marker = `  async function validateByEngine(
    beforeFen: string,
    afterFen: string,
    attemptedUci: string,
    nextGame: Chess,
  ) {`;

if (!s.includes(marker)) {
  throw new Error("Could not find validateByEngine start.");
}

if (!s.includes("OPPOSITION_HINT_ALWAYS_ACCEPT")) {
  s = s.replace(
    marker,
    `${marker}
    // OPPOSITION_HINT_ALWAYS_ACCEPT
    if (lastHintMoveRef.current && attemptedUci === lastHintMoveRef.current) {
      lastHintMoveRef.current = null;

      const afterInfo = await evaluatePosition(afterFen);

      return {
        ok: true,
        reason: "",
        afterUser: afterInfo,
      };
    }
`
  );
}

fs.writeFileSync(file, s);

console.log("Fixed Opposition: hinted move is always accepted.");