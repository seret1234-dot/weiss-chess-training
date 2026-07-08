import fs from "fs";
import path from "path";

const file = path.join(
  process.cwd(),
  "src",
  "pages",
  "endgames",
  "KPKTrainer.tsx"
);

if (!fs.existsSync(file)) {
  throw new Error(`Missing file:\n${file}`);
}

const backup = file.replace(/\.tsx$/, `.before_kpk_acceptance_fix_${Date.now()}.tsx`);
fs.copyFileSync(file, backup);

let code = fs.readFileSync(file, "utf8");

// Add helper before validateByEngine
if (!code.includes("function isWhitePawnPush")) {
  code = code.replace(
    /async function validateByEngine\(/,
    `function isWhitePawnPush(gameBefore: Chess, attemptedUci: string) {
  const move = gameBefore.moves({ verbose: true }).find((m: any) => {
    const uci = \`\${m.from}\${m.to}\${m.promotion ?? ""}\`;
    return uci === attemptedUci;
  });

  return !!move && move.color === "w" && move.piece === "p";
}

function getWhiteKingSquare(gameToCheck: Chess) {
  const board = gameToCheck.board();

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const piece = board[r][f];
      if (piece?.type === "k" && piece.color === "w") {
        return \`\${"abcdefgh"[f]}\${8 - r}\`;
      }
    }
  }

  return null;
}

function getWhitePawnSquare(gameToCheck: Chess) {
  const board = gameToCheck.board();

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const piece = board[r][f];
      if (piece?.type === "p" && piece.color === "w") {
        return \`\${"abcdefgh"[f]}\${8 - r}\`;
      }
    }
  }

  return null;
}

function whiteKingControlsPromotionPath(gameToCheck: Chess) {
  const wk = getWhiteKingSquare(gameToCheck);
  const wp = getWhitePawnSquare(gameToCheck);
  if (!wk || !wp) return false;

  const file = wp[0];
  const pawnRank = Number(wp[1]);
  const wkFile = "abcdefgh".indexOf(wk[0]);
  const pawnFile = "abcdefgh".indexOf(file);
  const wkRank = Number(wk[1]);

  // White king is in front/near the pawn and controls key squares.
  return (
    wkRank > pawnRank &&
    Math.abs(wkFile - pawnFile) <= 1
  );
}

async function validateByEngine(`
  );
}

// Loosen threshold
code = code.replace(
  /return info\.eval >= [0-9.]+;/g,
  `return info.eval >= 0.8;`
);

// Accept engine best move and natural winning pawn push
code = code.replace(
  /const before = engineInfo \?\? \(await evaluatePosition\(beforeFen\)\);/,
  `const before = engineInfo ?? (await evaluatePosition(beforeFen));

  if (before?.bestMove && attemptedUci === before.bestMove) {
    const afterUser = await evaluatePosition(afterFen);
    return { ok: true, reason: "", afterUser };
  }

  if (
    currentPosition?.result === "win" &&
    isWhitePawnPush(new Chess(beforeFen), attemptedUci) &&
    whiteKingControlsPromotionPath(nextGame)
  ) {
    const afterUser = await evaluatePosition(afterFen);
    return { ok: true, reason: "", afterUser };
  }`
);

// End puzzle immediately on promotion
code = code.replace(
  /if \(nextGame\.isStalemate\(\)\) \{/,
  `if (move.promotion || moveObj.promotion) {
      handleSolved(nextGame, move);
      return true;
    }

    if (nextGame.isStalemate()) {`
);

fs.writeFileSync(file, code, "utf8");

console.log("DONE");
console.log("Backup:");
console.log(backup);
console.log("Updated:");
console.log(file);