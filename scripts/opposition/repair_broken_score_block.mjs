import fs from "fs";

const file =
  "C:/Users/Ariel/chess-trainer/src/pages/endgames/OppositionTrainer.tsx";

let text = fs.readFileSync(file, "utf8");

const startMarker = "function withTimeout";
const endMarker = "function getKpkTargetResult";

const start = text.indexOf(startMarker);
const end = text.indexOf(endMarker, start);

if (start === -1) {
  throw new Error("Could not find function withTimeout");
}

if (end === -1) {
  throw new Error("Could not find function getKpkTargetResult");
}

const replacement = `function withTimeout<T>(
    promise: Promise<T>,
    ms: number,
    fallback: T,
  ): Promise<T> {
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => resolve(fallback), ms);

      promise
        .then((value) => {
          window.clearTimeout(timer);
          resolve(value);
        })
        .catch(() => {
          window.clearTimeout(timer);
          resolve(fallback);
        });
    });
  }

  function hasWhiteQueenExact(gameToCheck: Chess) {
    return gameToCheck
      .board()
      .some((rank) =>
        rank.some((piece) => piece?.type === "q" && piece.color === "w"),
      );
  }

  function isPromotionMoveObj(
    move: { promotion?: string } | null,
    gameAfterMove: Chess,
  ) {
    if (!move) return false;
    return Boolean(move.promotion) || hasWhiteQueenExact(gameAfterMove);
  }

  function isEngineBestMove(
    info: EngineResult | null,
    attemptedUci: string,
  ) {
    return Boolean(info?.bestMove && info.bestMove === attemptedUci);
  }

  function scoreForWhite(info: EngineResult | null) {
    if (!info) return null;

    if (typeof info.mate === "number") {
      return info.mate > 0 ? 100 : -100;
    }

    if (typeof info.eval === "number") {
      return info.eval;
    }

    return null;
  }

  `;

text = text.slice(0, start) + replacement + text.slice(end);

fs.writeFileSync(file, text);

console.log("DONE - repaired broken score/timeout block");