import fs from "fs";

const files = [
  "src/pages/endgames/KRKPTrainer.tsx",
  "src/pages/endgames/LucenaTrainer.tsx",
];

for (const file of files) {
  let text = fs.readFileSync(file, "utf8");

  text = text.replace(
`    // Fast endgame rules first — no engine needed.
    if (!blackPawnStillExists(nextGame)) {
      return { ok: true, reason: "", afterUser: null };
    }

    if (whiteCanCaptureBlackPawn(nextGame)) {
      return { ok: true, reason: "", afterUser: null };
    }`,
`    // Fast endgame rules first — no engine needed.
    // Never accept a move if Black can immediately win the rook.
    if (blackCanCaptureWhiteRook(nextGame)) {
      return {
        ok: false,
        reason: "Black can capture your rook.",
        afterUser: null,
      };
    }

    if (!blackPawnStillExists(nextGame)) {
      return { ok: true, reason: "", afterUser: null };
    }

    if (whiteCanCaptureBlackPawn(nextGame)) {
      return { ok: true, reason: "", afterUser: null };
    }`
  );

  fs.writeFileSync(file, text);
}

console.log("DONE: KRKP/Lucena reject moves where Black can capture the rook.");
