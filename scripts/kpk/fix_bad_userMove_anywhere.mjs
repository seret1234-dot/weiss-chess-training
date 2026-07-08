import fs from "fs";

const file = "src/pages/endgames/KPKTrainer.tsx";
let s = fs.readFileSync(file, "utf8");

s = s.replaceAll("nextGame,\n        userMove,", "nextGame,\n        move,");

fs.writeFileSync(file, s, "utf8");
console.log("DONE: replaced bad userMove with move");
