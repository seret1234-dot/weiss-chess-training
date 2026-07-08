const fs = require("fs");

const p = "src/pages/endgames/ShoulderingTrainer.tsx";
let s = fs.readFileSync(p, "utf8");

const start = s.indexOf("async function validateByEngine(");
if (start === -1) {
 console.log("validateByEngine not found");
 process.exit(1);
}

const nextFunc = s.indexOf("async function playEngineReplyIfNeeded(", start);
if (nextFunc === -1) {
 console.log("Could not locate end of validateByEngine");
 process.exit(1);
}

const replacement = `
async function validateByEngine(
 beforeFen: string,
 afterFen: string,
 attemptedUci: string,
 nextGame: Chess,
) {
 if (
 attemptedUci === lastHintMoveRef.current ||
 currentPosition?.allowedMoves?.includes(attemptedUci)
 ) {
 const afterUser = await evaluatePosition(afterFen);
 return { ok: true, reason: "", afterUser };
 }

 const afterUser = await evaluatePosition(afterFen);

 if (!afterUser) {
 return {
 ok: false,
 reason: "Engine is still checking. Try again.",
 afterUser: null,
 };
 }

 if (isClearlyWinningForWhite(afterUser)) {
 return { ok: true, reason: "", afterUser };
 }

 return {
 ok: false,
 reason: "This move does not keep the winning KPK position.",
 afterUser,
 };
}

`;

s = s.slice(0, start) + replacement + s.slice(nextFunc);

fs.writeFileSync(p, s);
console.log("DONE replaced validateByEngine");
