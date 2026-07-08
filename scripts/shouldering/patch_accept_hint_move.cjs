const fs = require("fs");

const p = "src/pages/endgames/ShoulderingTrainer.tsx";
let s = fs.readFileSync(p, "utf8");

const backup = p + ".bak_accept_hint_move";
fs.writeFileSync(backup, s);

// Store the hint move when shown
s = s.replace(
` setHintSquares([parsed.from, parsed.to]);
 setMessage("Best engine move: " + parsed.from + " ? " + parsed.to);`,
` lastHintMoveRef.current = hintMoveUci;
 setHintSquares([parsed.from, parsed.to]);
 setMessage("Best engine move: " + parsed.from + " ? " + parsed.to);`
);

// Accept stored generated engine move and shown hint move before strict checks
s = s.replace(
` ) {
 if (!hasWhiteQueenExact(nextGame)) {`,
` ) {
 if (
 attemptedUci === lastHintMoveRef.current ||
 currentPosition?.allowedMoves?.includes(attemptedUci)
 ) {
 const afterUser = await evaluatePosition(afterFen);
 return { ok: true, reason: "", afterUser };
 }

 if (!hasWhiteQueenExact(nextGame)) {`
);

fs.writeFileSync(p, s);
console.log("DONE patched Shouldering to accept hint/stored engine move");
console.log("Backup:", backup);
