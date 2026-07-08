import fs from "fs";
import path from "path";

const file = path.join(
  process.cwd(),
  "src",
  "pages",
  "endgames",
  "KPKTrainer.tsx"
);

if (!fs.existsSync(file)) throw new Error(`Missing file:\n${file}`);

const backup = file.replace(/\.tsx$/, `.before_fast_kpk_${Date.now()}.tsx`);
fs.copyFileSync(file, backup);

let code = fs.readFileSync(file, "utf8");

// Remove the heavy exact recursive helpers.
code = code.replace(
  /function getWhitePawnSquareExact[\s\S]*?function chooseExactKpkBlackReply[\s\S]*?\n\}/,
  `function getWhitePawnSquareExact(gameToCheck: Chess) {
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

function getWhiteKingSquareExact(gameToCheck: Chess) {
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

function getBlackKingSquareExact(gameToCheck: Chess) {
  const board = gameToCheck.board();

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const piece = board[r][f];
      if (piece?.type === "k" && piece.color === "b") {
        return \`\${"abcdefgh"[f]}\${8 - r}\`;
      }
    }
  }

  return null;
}

function hasWhiteQueenExact(gameToCheck: Chess) {
  return gameToCheck.board().some((rank) =>
    rank.some((piece) => piece?.type === "q" && piece.color === "w"),
  );
}

function sqFile(sq: string) {
  return "abcdefgh".indexOf(sq[0]);
}

function sqRank(sq: string) {
  return Number(sq[1]);
}

function fastKpkOutcome(gameToCheck: Chess): "win" | "draw" {
  if (hasWhiteQueenExact(gameToCheck)) return "win";
  if (gameToCheck.isCheckmate()) return "win";
  if (gameToCheck.isStalemate() || gameToCheck.isDraw()) return "draw";

  const wp = getWhitePawnSquareExact(gameToCheck);
  const wk = getWhiteKingSquareExact(gameToCheck);
  const bk = getBlackKingSquareExact(gameToCheck);

  if (!wp || !wk || !bk) return "draw";

  const pf = sqFile(wp);
  const pr = sqRank(wp);
  const wf = sqFile(wk);
  const wr = sqRank(wk);
  const bf = sqFile(bk);
  const br = sqRank(bk);

  if (pr >= 7) return "win";

  const rookPawn = pf === 0 || pf === 7;
  const promotionCornerFile = pf;
  const blackInPromotionCorner = bf === promotionCornerFile && br === 8;

  if (rookPawn && blackInPromotionCorner && Math.abs(wf - pf) > 1) {
    return "draw";
  }

  // White king in front of pawn and close to file = key-square style win.
  if (wr > pr && Math.abs(wf - pf) <= 1) {
    return "win";
  }

  // Pawn far advanced and black king is not directly in front.
  if (pr >= 5 && !(bf === pf && br > pr)) {
    return "win";
  }

  return "draw";
}

function chooseExactKpkBlackReply(gameToDefend: Chess, fallbackMove?: string | null) {
  const legalMoves = gameToDefend.moves({ verbose: true }) as any[];
  const blackMoves = legalMoves.filter((m) => m.color === "b");

  if (blackMoves.length === 0) return fallbackMove ?? null;

  // Prefer a black move that makes/keeps draw according to fast KPK rules.
  for (const move of blackMoves) {
    const next = new Chess(gameToDefend.fen());
    const made = next.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion || "q",
    });

    if (!made) continue;

    if (fastKpkOutcome(next) === "draw") {
      return \`\${move.from}\${move.to}\${move.promotion ?? ""}\`;
    }
  }

  if (fallbackMove) {
    const legalUci = new Set(
      blackMoves.map((m) => \`\${m.from}\${m.to}\${m.promotion ?? ""}\`),
    );
    if (legalUci.has(fallbackMove)) return fallbackMove;
  }

  return \`\${blackMoves[0].from}\${blackMoves[0].to}\${blackMoves[0].promotion ?? ""}\`;
}`
);

// Replace exactKpkOutcome calls with fastKpkOutcome.
code = code.replaceAll("exactKpkOutcome", "fastKpkOutcome");

// Remove engine “checking” deadlock risk by making validation fully sync/fast.
code = code.replace(
  /async function validateByEngine\([\s\S]*?\n  function onDrop/,
  `async function validateByEngine(
    beforeFen: string,
    afterFen: string,
    attemptedUci: string,
    nextGame: Chess,
  ) {
    const beforeGame = new Chess(beforeFen);
    const beforeOutcome = fastKpkOutcome(beforeGame);
    const afterOutcome = fastKpkOutcome(nextGame);

    const move = beforeGame.moves({ verbose: true }).find((m: any) => {
      return \`\${m.from}\${m.to}\${m.promotion ?? ""}\` === attemptedUci;
    }) as any;

    if (move?.promotion || hasWhiteQueenExact(nextGame)) {
      return { ok: true, reason: "", afterUser: null };
    }

    const target =
      currentPosition?.result === "mixed"
        ? beforeOutcome
        : currentPosition?.result || beforeOutcome;

    if (target === "win" && afterOutcome === "win") {
      return { ok: true, reason: "", afterUser: null };
    }

    if (target === "draw" && afterOutcome === "draw") {
      return { ok: true, reason: "", afterUser: null };
    }

    return {
      ok: false,
      reason:
        target === "win"
          ? "Wrong: this move changes the position from win to draw. Use the king first or push only when promotion is controlled."
          : "Wrong: this move changes the position from draw to win for White. Stay in the drawing zone.",
      afterUser: null,
    };
  }

  function onDrop`
);

fs.writeFileSync(file, code, "utf8");

console.log("DONE");
console.log("Backup:");
console.log(backup);
console.log("Updated:");
console.log(file);