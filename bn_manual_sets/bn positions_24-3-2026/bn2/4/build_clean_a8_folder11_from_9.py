import glob
import json
import os
from collections import Counter

import chess
import chess.engine

ENGINE_PATH = r"C:\Users\Ariel\chess-trainer\stockfish-windows-x86-64-avx2\stockfish\stockfish-windows-x86-64-avx2.exe"

INPUT_FOLDER = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4\9"
OUTPUT_FOLDER = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4\11"

MAX_PLIES = 24
TIME_PER_MOVE = 0.05  # seconds per move

os.makedirs(OUTPUT_FOLDER, exist_ok=True)


def should_scan_file(path: str) -> bool:
    name = os.path.basename(path)
    prefix = name[:3]

    if not prefix.isdigit():
        return False

    num = int(prefix)
    return 1 <= num <= 87


def find_mate_square(fen: str, engine: chess.engine.SimpleEngine):
    board = chess.Board(fen)

    for _ in range(MAX_PLIES):
        if board.is_checkmate():
            return chess.square_name(board.king(chess.BLACK))

        try:
            result = engine.play(board, chess.engine.Limit(time=TIME_PER_MOVE))
        except chess.engine.EngineTerminatedError:
            raise
        except Exception:
            return None

        if result.move is None:
            return None

        board.push(result.move)

    if board.is_checkmate():
        return chess.square_name(board.king(chess.BLACK))

    return None


def main():
    all_files = sorted(glob.glob(os.path.join(INPUT_FOLDER, "*.json")))
    files = [f for f in all_files if should_scan_file(f)]

    print(f"Found JSON files: {len(all_files)}")
    print(f"Will scan files 001-087 only: {len(files)}")

    grand = Counter()

    with chess.engine.SimpleEngine.popen_uci(ENGINE_PATH) as engine:
        for file_index, path in enumerate(files, start=1):
            name = os.path.basename(path)
            print(f"\n=== FILE {file_index}/{len(files)}: {name} ===")

            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)

            kept = []
            removed = 0
            stats = Counter()

            for i, pos in enumerate(data, start=1):
                if i % 10 == 0 or i == len(data):
                    print(f"  progress: {i}/{len(data)}")

                fen = pos.get("fen")
                if not fen:
                    # preserve original no-fen records unchanged
                    kept.append(pos)
                    stats["kept_missing_fen"] += 1
                    continue

                mate_square = find_mate_square(fen, engine)

                if mate_square is None:
                    kept.append(pos)
                    stats["kept_no_mate"] += 1
                elif mate_square == "a8":
                    kept.append(pos)
                    stats["kept_a8"] += 1
                else:
                    removed += 1
                    stats[f"removed_{mate_square}"] += 1

            out_path = os.path.join(OUTPUT_FOLDER, name)
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(kept, f, indent=2, ensure_ascii=False)

            print(f"  input:   {len(data)}")
            print(f"  kept:    {len(kept)}")
            print(f"  removed: {removed}")
            for k, v in sorted(stats.items()):
                print(f"  {k}: {v}")
            print(f"  wrote:   {out_path}")

            grand["files"] += 1
            grand["input_positions"] += len(data)
            grand["kept_positions"] += len(kept)
            grand["removed_positions"] += removed
            for k, v in stats.items():
                grand[k] += v

    print("\n=== GRAND TOTAL ===")
    for k, v in sorted(grand.items()):
        print(f"{k}: {v}")


if __name__ == "__main__":
    main()