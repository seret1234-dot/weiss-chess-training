import fs from "fs";
import path from "path";

const root = process.cwd();
const file = path.join(root, "src", "pages", "endgames", "OppositionTrainer.tsx");

if (!fs.existsSync(file)) {
  throw new Error("Could not find src/pages/endgames/OppositionTrainer.tsx");
}

let s = fs.readFileSync(file, "utf8");

const start = s.indexOf("  async function validateByEngine(");
const end = s.indexOf("\nfunction onDrop(", start);

if (start === -1 || end === -1) {
  throw new Error("Could not find validateByEngine block.");
}

const replacement = `  async function validateByEngine(
    beforeFen: string,
    afterFen: string,
    attemptedUci: string,
    nextGame: Chess,
  ) {
    const allowedMoves = currentPosition?.allowedMoves ?? [];

    if (allowedMoves.includes(attemptedUci)) {
      return {
        ok: true,
        reason: "",
        afterUser: null,
      };
    }

    return {
      ok: false,
      reason:
        currentPosition?.explanation ||
        "Wrong opposition move. Take the opposition: same file, rank, or diagonal with the correct distance.",
      afterUser: null,
    };
  }
`;

s = s.slice(0, start) + replacement + s.slice(end);

fs.writeFileSync(file, s);

console.log("Opposition now validates by allowedMoves only:");
console.log(file);