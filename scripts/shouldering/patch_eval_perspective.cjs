const fs = require("fs");

const p = "scripts/shouldering/generate_shouldering_engine.mjs";
let s = fs.readFileSync(p, "utf8");

s = s.replace(
`function whiteWinning(info) {
 if (!info) return false;
 if (typeof info.mate === "number") return info.mate > 0;
 if (typeof info.cp === "number") return info.cp >= 120;
 return false;
}`,
`function whiteWinning(info, fen) {
 if (!info) return false;

 const turn = fen.split(" ")[1];

 if (typeof info.mate === "number") {
 if (turn === "w") return info.mate > 0;
 return info.mate < 0;
 }

 if (typeof info.cp === "number") {
 if (turn === "w") return info.cp >= 80;
 return info.cp <= -80;
 }

 return false;
}`
);

s = s.replaceAll(`whiteWinning(info)`, `whiteWinning(info, c.fen)`);
s = s.replaceAll(`whiteWinning(afterInfo)`, `whiteWinning(afterInfo, afterFen)`);

fs.writeFileSync(p, s);
console.log("DONE patched eval perspective");
