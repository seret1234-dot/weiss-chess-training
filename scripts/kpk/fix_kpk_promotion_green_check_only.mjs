import fs from "fs";

const file = "src/pages/endgames/KPKTrainer.tsx";
let s = fs.readFileSync(file, "utf8");

s = s.replaceAll(
  "setJustMated(nextGame.isCheckmate() || hasWhiteQueenExact(nextGame));",
  "setJustMated(nextGame.isCheckmate());"
);

s = s.replaceAll(
  'setStatus(nextGame.isCheckmate() ? "CHECKMATE!" : "PROMOTION!");',
  'setStatus(nextGame.isCheckmate() ? "CHECKMATE!" : "PROMOTION!");'
);

fs.writeFileSync(file, s, "utf8");
console.log("Fixed: promotion no longer shows CHECKMATE overlay");
