import json
import glob
import os
import chess
import chess.engine
from collections import Counter

ENGINE_PATH = r"C:\Users\Ariel\chess-trainer\stockfish-windows-x86-64-avx2\stockfish\stockfish-windows-x86-64-avx2.exe"
FOLDER = r"C:\Users\Ariel\chess-trainer\public\data\lichess\bn_v3\chunks"
PATTERN = os.path.join(FOLDER, "*__bk_b8.json")
MAX_PLIES = 24
DEPTH = 18

def find_mate_square(fen, engine):
    board = chess.Board(fen)

    for _ in range(MAX_PLIES):
        if board.is_checkmate():
            return chess.square_name(board.king(chess.BLACK))
        result = engine.play(board, chess.engine.Limit(depth=DEPTH))
        if result.move is None:
            break
        board.push(result.move)

    if board.is_checkmate():
        return chess.square_name(board.king(chess.BLACK))

    return None

def main():
    files = sorted(glob.glob(PATTERN))
    print(f"Found files: {len(files)}")

    summary = []

    with chess.engine.SimpleEngine.popen_uci(ENGINE_PATH) as engine:
        for path in files:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)

            counts = Counter()
            for pos in data:
                sq = find_mate_square(pos["fen"], engine)
                counts[sq if sq is not None else "no_mate"] += 1

            summary.append({
                "file": os.path.basename(path),
                "a8": counts["a8"],
                "b8": counts["b8"],
                "other": sum(v for k, v in counts.items() if k not in ("a8", "b8", "no_mate")),
                "no_mate": counts["no_mate"],
                "total": len(data),
            })

            print(f"\n{os.path.basename(path)}")
            for k, v in sorted(counts.items(), key=lambda x: str(x[0])):
                print(f"  {k}: {v}")

    out_path = os.path.join(FOLDER, "mate_square_summary_bk_b8.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)

    print(f"\nSaved summary to:\n{out_path}")

if __name__ == "__main__":
    main()