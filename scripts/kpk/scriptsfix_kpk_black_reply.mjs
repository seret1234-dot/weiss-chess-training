import fs from "fs";
import path from "path";

const root = process.cwd();

function findFile(dir) {
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);

    if (fs.statSync(full).isDirectory()) {
      const found = findFile(full);
      if (found) return found;
    } else if (item === "KPKTrainer.tsx") {
      return full;
    }
  }

  return null;
}

const file = findFile(path.join(root, "src"));
if (!file) throw new Error("Could not find KPKTrainer.tsx");

let s = fs.readFileSync(file, "utf8");

const start = s.indexOf("  async function validateByEngine(");
const end = s.indexOf("\nfunction onDrop(", start);

if (start === -1 || end === -1) {
  throw new Error("Could not find validateByEngine block.");
}

const replacement = `  function whitePawnStillExists(gameToCheck: Chess) {
    return gameToCheck
      .board()
      .some((rank) =>
        rank.some((piece) => piece?.type === "p" && piece.color === "w"),
      );
  }

  function hasWhitePromotion(gameToCheck: Chess) {
    return gameToCheck
      .board()
      .some((rank) =>
        rank.some((piece) => piece?.type === "q" && piece.color === "w"),
      );
  }

  function isSafeKpkPawnPush(beforeGame: Chess, nextGame: Chess, move: any) {
    if (!move || move.piece !== "p" || move.color !== "w") return false;

    const fromRank = Number(move.from[1]);
    const toRank = Number(move.to[1]);

    if (!Number.isFinite(fromRank) || !Number.isFinite(toRank)) return false;
    if (toRank <= fromRank) return false;

    const whiteKingSquare = getPieceSquare(nextGame, "k", "w");
    const blackKingSquare = getPieceSquare(nextGame, "k", "b");

    if (!whiteKingSquare || !blackKingSquare) return true;

    const pawnIsProtectedByKing = kingDistance(whiteKingSquare, move.to) <= 1;
    const blackKingCanReachPawn = kingDistance(blackKingSquare, move.to) <= 1;

    if (pawnIsProtectedByKing) return true;
    if (!blackKingCanReachPawn) return true;

    return false;
  }

  async function validateByEngine(
    beforeFen: string,
    afterFen: string,
    attemptedUci: string,
    nextGame: Chess,
  ) {
    const beforeGame = new Chess(beforeFen);

    const move = beforeGame.moves({ verbose: true }).find((m: any) => {
      return \`\${m.from}\${m.to}\${m.promotion ?? ""}\` === attemptedUci;
    }) as any;

    const beforeInfo = engineInfo ?? (await evaluatePosition(beforeFen));
    const afterInfo = await evaluatePosition(afterFen);

    if (lastHintMoveRef.current && attemptedUci === lastHintMoveRef.current) {
      lastHintMoveRef.current = null;
      return { ok: true, reason: "", afterUser: afterInfo };
    }

    if (nextGame.isCheckmate()) {
      return { ok: true, reason: "", afterUser: afterInfo };
    }

    if (isPromotionMoveObj(move, nextGame) || hasWhitePromotion(nextGame)) {
      return { ok: true, reason: "", afterUser: afterInfo };
    }

    if (isEngineBestMove(beforeInfo, attemptedUci)) {
      return { ok: true, reason: "", afterUser: afterInfo };
    }

    const target = getKpkTargetResult(beforeInfo);
    const afterScore = scoreForWhite(afterInfo);

    if (target === "win") {
      if (isSafeKpkPawnPush(beforeGame, nextGame, move)) {
        return { ok: true, reason: "", afterUser: afterInfo };
      }

      if (afterScore === null && whitePawnStillExists(nextGame)) {
        return { ok: true, reason: "", afterUser: afterInfo };
      }

      if (afterScore !== null && afterScore >= 0.5) {
        return { ok: true, reason: "", afterUser: afterInfo };
      }

      return {
        ok: false,
        reason:
          "Wrong: this move lets the win slip. Improve the king first, keep opposition, or push only when promotion is controlled.",
        afterUser: afterInfo,
      };
    }

    if (target === "draw") {
      if (afterScore === null || afterScore < 1.0) {
        return { ok: true, reason: "", afterUser: afterInfo };
      }

      return {
        ok: false,
        reason:
          "Wrong: this move loses the draw. Keep the king in the drawing zone.",
        afterUser: afterInfo,
      };
    }

    return { ok: true, reason: "", afterUser: afterInfo };
  }
`;

s = s.slice(0, start) + replacement + s.slice(end);

fs.writeFileSync(file, s);

console.log("Fixed KPK validation and black reply in:", file);