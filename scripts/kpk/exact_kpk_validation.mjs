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

const backup = file.replace(/\.tsx$/, `.before_exact_kpk_${Date.now()}.tsx`);
fs.copyFileSync(file, backup);

let code = fs.readFileSync(file, "utf8");

const exactHelpers = `
function getWhitePawnSquareExact(gameToCheck: Chess) {
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

function hasWhiteQueenExact(gameToCheck: Chess) {
  return gameToCheck.board().some((rank) =>
    rank.some((piece) => piece?.type === "q" && piece.color === "w"),
  );
}

function kpkKey(gameToCheck: Chess) {
  const parts = gameToCheck.fen().split(" ");
  return \`\${parts[0]} \${parts[1]}\`;
}

function exactKpkOutcome(gameToCheck: Chess, depth = 28, memo = new Map<string, "win" | "draw">()): "win" | "draw" {
  const key = \`\${kpkKey(gameToCheck)}|\${depth}\`;
  const cached = memo.get(key);
  if (cached) return cached;

  if (hasWhiteQueenExact(gameToCheck)) return "win";

  const pawn = getWhitePawnSquareExact(gameToCheck);
  if (!pawn) return "draw";

  if (Number(pawn[1]) >= 8) return "win";
  if (gameToCheck.isCheckmate()) return "win";
  if (gameToCheck.isStalemate() || gameToCheck.isDraw()) return "draw";
  if (depth <= 0) return "draw";

  const legalMoves = gameToCheck.moves({ verbose: true }) as any[];

  if (legalMoves.length === 0) {
    return gameToCheck.isCheckmate() ? "win" : "draw";
  }

  if (gameToCheck.turn() === "w") {
    for (const move of legalMoves) {
      const next = new Chess(gameToCheck.fen());

      const made = next.move({
        from: move.from,
        to: move.to,
        promotion: move.promotion || "q",
      });

      if (!made) continue;

      if (made.promotion || hasWhiteQueenExact(next)) {
        memo.set(key, "win");
        return "win";
      }

      if (exactKpkOutcome(next, depth - 1, memo) === "win") {
        memo.set(key, "win");
        return "win";
      }
    }

    memo.set(key, "draw");
    return "draw";
  }

  // Black to move: White is winning only if every legal black move still loses.
  for (const move of legalMoves) {
    const next = new Chess(gameToCheck.fen());

    const made = next.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion || "q",
    });

    if (!made) continue;

    if (exactKpkOutcome(next, depth - 1, memo) === "draw") {
      memo.set(key, "draw");
      return "draw";
    }
  }

  memo.set(key, "win");
  return "win";
}

function chooseExactKpkBlackReply(gameToDefend: Chess, fallbackMove?: string | null) {
  const legalMoves = gameToDefend.moves({ verbose: true }) as any[];
  const blackMoves = legalMoves.filter((m) => m.color === "b");

  if (blackMoves.length === 0) return fallbackMove ?? null;

  // If black can hold the draw, always choose a drawing move.
  for (const move of blackMoves) {
    const next = new Chess(gameToDefend.fen());
    const made = next.move({
      from: move.from,
      to: move.to,
      promotion: move.promotion || "q",
    });

    if (!made) continue;

    if (exactKpkOutcome(next) === "draw") {
      return \`\${move.from}\${move.to}\${move.promotion ?? ""}\`;
    }
  }

  // Otherwise use engine best if legal.
  if (fallbackMove) {
    const legalUci = new Set(
      blackMoves.map((m) => \`\${m.from}\${m.to}\${m.promotion ?? ""}\`),
    );
    if (legalUci.has(fallbackMove)) return fallbackMove;
  }

  return \`\${blackMoves[0].from}\${blackMoves[0].to}\${blackMoves[0].promotion ?? ""}\`;
}
`;

if (!code.includes("function exactKpkOutcome")) {
  code = code.replace(/async function validateByEngine\(/, `${exactHelpers}\nasync function validateByEngine(`);
}

code = code.replace(
  /async function validateByEngine\([\s\S]*?\n  function onDrop/,
  `async function validateByEngine(
    beforeFen: string,
    afterFen: string,
    attemptedUci: string,
    nextGame: Chess,
  ) {
    const beforeGame = new Chess(beforeFen);
    const beforeOutcome = exactKpkOutcome(beforeGame);
    const afterOutcome = exactKpkOutcome(nextGame);

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

// Make black reply use exact KPK defense, not random engine eval.
code = code.replace(
  /const defensiveReply = replyInfo\?\.bestMove \?\? null;/,
  `const defensiveReply = chooseExactKpkBlackReply(
      afterUserGame,
      replyInfo?.bestMove ?? null,
    );`
);

// End immediately after promotion.
code = code.replace(
  /if \(nextGame\.isStalemate\(\)\) \{/,
  `if (move.promotion || moveObj.promotion || hasWhiteQueenExact(nextGame)) {
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