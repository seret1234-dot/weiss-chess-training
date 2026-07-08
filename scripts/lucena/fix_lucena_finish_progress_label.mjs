import fs from "fs";

const file = "src/pages/endgames/LucenaTrainer.tsx";
let s = fs.readFileSync(file, "utf8");

s = s.replace(
`    return nextGame.isCheckmate() || whiteHasQueen(nextGame) || lucenaBridgeAchieved(nextGame);`,
`    // Only finish on White's move. If it is Black to move, White just made the bridge/promotion.
    if (nextGame.turn() !== "b") return false;
    return nextGame.isCheckmate() || whiteHasQueen(nextGame) || lucenaBridgeAchieved(nextGame);`
);

s = s.replace(
`    setStatus(nextGame.isCheckmate() ? "CHECKMATE!" : "Correct.");`,
`    setStatus(
      nextGame.isCheckmate()
        ? "CHECKMATE!"
        : whiteHasQueen(nextGame)
          ? "Promoted!"
          : lucenaBridgeAchieved(nextGame)
            ? "Bridge achieved!"
            : "Correct."
    );`
);

fs.writeFileSync(file, s);
console.log("DONE: Lucena finish only triggers after White move and labels bridge/promotion.");
