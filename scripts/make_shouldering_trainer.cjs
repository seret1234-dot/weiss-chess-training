const fs = require("fs");
const path = require("path");

const src = "src/pages/endgames/ZugzwangTrainer.tsx";
const dst = "src/pages/endgames/ShoulderingTrainer.tsx";

if (!fs.existsSync(src)) throw new Error("Missing " + src);

let s = fs.readFileSync(src, "utf8");

s = s
 .replaceAll("ZugzwangTrainer", "ShoulderingTrainer")
 .replaceAll("zugzwang", "shouldering")
 .replaceAll("Zugzwang", "Shouldering")
 .replaceAll("Pawn Race", "Shouldering")
 .replaceAll("Pawn race", "Shouldering")
 .replaceAll("pawn race", "shouldering");

fs.writeFileSync(dst, s);
console.log("DONE copied trainer:", dst);
