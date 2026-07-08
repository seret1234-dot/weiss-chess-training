import fs from "fs";

const file = "src/pages/endgames/LucenaTrainer.tsx";
let s = fs.readFileSync(file, "utf8");

const helper = `
  function whiteHasQueen(gameToCheck: Chess) {
    return gameToCheck
      .board()
      .some((rank) =>
        rank.some((piece) => piece?.type === "q" && piece.color === "w"),
      );
  }
`;

if (!s.includes("function whiteHasQueen")) {
  s = s.replace("  function whiteRookStillExists", helper + "\n  function whiteRookStillExists");
}

s = s.replace(
/function userMoveCompletesGoal\(nextGame: Chess\) \{[\s\S]*?^\s*\}/m,
`function userMoveCompletesGoal(nextGame: Chess) {
    if (nextGame.isCheckmate()) return true;
    if (whiteHasQueen(nextGame)) return true;
    return false;
  }`
);

s = s.replaceAll(
`"Convert the win. Capture the pawn or force mate."`,
`"Promote the pawn. Build the bridge against checks."`
);

s = s.replaceAll(
`"Try again. Convert the win."`,
`"Try again. The goal is to promote the pawn."`
);

s = s.replaceAll(
`"Correct — now convert the win."`,
`"Correct — now promote the pawn."`
);

fs.writeFileSync(file, s);
console.log("DONE: Lucena now finishes only on promotion or mate.");
