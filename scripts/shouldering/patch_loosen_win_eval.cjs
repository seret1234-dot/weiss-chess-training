const fs = require("fs");

const p = "src/pages/endgames/ShoulderingTrainer.tsx";
let s = fs.readFileSync(p, "utf8");

s = s.replace(
/function isClearlyWinningForWhite\(info: EngineResult \| null\) \{[\s\S]*?return false;\s*\}/,
`function isClearlyWinningForWhite(info: EngineResult | null) {
 if (!info) return false;

 if (typeof info.mate === "number") {
 return info.mate !== 0;
 }

 if (typeof info.eval === "number") {
 return Math.abs(info.eval) >= 1.0;
 }

 return false;
 }`
);

fs.writeFileSync(p, s);
console.log("DONE loosened Shouldering win validation");
