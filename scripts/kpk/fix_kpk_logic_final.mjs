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

const backup = file.replace(/\.tsx$/, `.before_kpk_logic_final_${Date.now()}.tsx`);
fs.copyFileSync(file, backup);

let code = fs.readFileSync(file, "utf8");

const finalLogic = `
function scoreForWhite(info: EngineResult | null) {
  if (!info) return null;

  if (typeof info.mate === "number") {
    return info.mate > 0 ? 1000 : -1000;
  }

  if (typeof info.eval === "number") {
    return info.eval;
  }

  return null;
}

function getKpkTargetResult(beforeInfo: EngineResult | null) {
  if (currentPosition?.result === "win") return "win";
  if (currentPosition?.result === "draw") return "draw";

  const score = scoreForWhite(beforeInfo);
  if (score === null) return "win";

  return score >= 1.0 ? "win" : "draw";
}

function isPromotionMoveObj(move: any, nextGame: Chess) {
  if (move?.promotion) return true;
  return hasWhiteQueenExact(nextGame);
}

function isEngineBestMove(beforeInfo: EngineResult | null, attemptedUci: string) {
  return !!beforeInfo?.bestMove && beforeInfo.bestMove === attemptedUci;
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

  if (isPromotionMoveObj(move, nextGame)) {
    return { ok: true, reason: "", afterUser: afterInfo };
  }

  if (isEngineBestMove(beforeInfo, attemptedUci)) {
    return { ok: true, reason: "", afterUser: afterInfo };
  }

  const target = getKpkTargetResult(beforeInfo);
  const beforeScore = scoreForWhite(beforeInfo);
  const afterScore = scoreForWhite(afterInfo);

  // If engine failed, use the lightweight KPK rule fallback.
  if (afterScore === null) {
    const afterOutcome = fastKpkOutcome(nextGame);

    if (target === "win" && afterOutcome === "win") {
      return { ok: true, reason: "", afterUser: afterInfo };
    }

    if (target === "draw" && afterOutcome === "draw") {
      return { ok: true, reason: "", afterUser: afterInfo };
    }

    return {
      ok: false,
      reason:
        target === "win"
          ? "Wrong: this move appears to lose the win."
          : "Wrong: this move appears to lose the draw.",
      afterUser: afterInfo,
    };
  }

  if (target === "win") {
    const stillClearlyWinning = afterScore >= 1.0;
    const didNotCollapse =
      beforeScore === null ? stillClearlyWinning : afterScore >= beforeScore - 1.5;

    if (stillClearlyWinning && didNotCollapse) {
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
    const stillDrawing = afterScore < 1.0;

    if (stillDrawing) {
      return { ok: true, reason: "", afterUser: afterInfo };
    }

    return {
      ok: false,
      reason:
        "Wrong: this move loses the draw. Keep the king in the drawing zone or reach the rook-pawn corner/stalemate setup.",
      afterUser: afterInfo,
    };
  }

  return { ok: true, reason: "", afterUser: afterInfo };
}

function onDrop`;

// Replace current validateByEngine block.
code = code.replace(
  /async function validateByEngine\([\s\S]*?\n\s*function onDrop/,
  finalLogic
);

// Make black reply use engine best again.
code = code.replace(
  /const defensiveReply = chooseExactKpkBlackReply\([\s\S]*?\);/,
  `const defensiveReply = replyInfo?.bestMove ?? null;`
);

// Promotion must end immediately.
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