const fs = require("fs");

const p = "src/pages/endgames/ShoulderingTrainer.tsx";
let s = fs.readFileSync(p, "utf8");

const backup = p + ".bak_accept_any_winning_move";
fs.writeFileSync(backup, s);

// Make isClearlyWinningForWhite actually use positive eval, not abs()
s = s.replace(
`function isClearlyWinningForWhite(info: EngineResult | null) {
 if (!info) return false;

 if (typeof info.mate === "number") {
 return true;
 }

 if (typeof info.eval === "number") {
 return Math.abs(info.eval) >= 3;
 }

 return false;
 }`,
`function isClearlyWinningForWhite(info: EngineResult | null) {
 if (!info) return false;

 if (typeof info.mate === "number") {
 return info.mate > 0;
 }

 if (typeof info.eval === "number") {
 return info.eval >= 1.2;
 }

 return false;
 }`
);

// Accept any move that keeps winning before old strict queen/promotion checks
s = s.replace(
` if (!hasWhiteQueenExact(nextGame)) {`,
` const afterUserAny = await evaluatePosition(afterFen);
 if (isClearlyWinningForWhite(afterUserAny)) {
 return { ok: true, reason: "", afterUser: afterUserAny };
 }

 if (!hasWhiteQueenExact(nextGame)) {`
);

fs.writeFileSync(p, s);
console.log("DONE patched Shouldering to accept any engine-winning continuation");
console.log("Backup:", backup);
