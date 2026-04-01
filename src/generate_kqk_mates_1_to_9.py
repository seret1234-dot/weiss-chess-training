import json
import random
from pathlib import Path
from typing import Dict, List, Set

import chess
import chess.engine

# =========================
# CONFIG
# =========================

STOCKFISH_PATH = r"C:\Users\Ariel\chess-trainer\stockfish-windows-x86-64-avx2\stockfish\stockfish-windows-x86-64-avx2.exe"

OUTPUT_FILE = "kqk_mates_1_to_9.json"

POSITIONS_PER_MATE = 10
TARGET_MATES = list(range(9, 0, -1))

SEARCH_DEPTH = 18
MAX_RANDOM_ATTEMPTS = 500000


# =========================
# HELPERS
# =========================

def kings_not_adjacent(wk, bk):
    return chess.square_distance(wk, bk) > 1


def random_kqk():
    wk = random.choice(list(chess.SQUARES))
    wq = random.choice(list(chess.SQUARES))
    bk = random.choice(list(chess.SQUARES))

    if len({wk, wq, bk}) < 3:
        return None
    if not kings_not_adjacent(wk, bk):
        return None

    board = chess.Board(None)
    board.set_piece_at(wk, chess.Piece(chess.KING, chess.WHITE))
    board.set_piece_at(wq, chess.Piece(chess.QUEEN, chess.WHITE))
    board.set_piece_at(bk, chess.Piece(chess.KING, chess.BLACK))
    board.turn = chess.WHITE

    if not board.is_valid():
        return None

    if board.is_check() or board.is_checkmate() or board.is_stalemate():
        return None

    return board


def get_mate(engine, board):
    try:
        info = engine.analyse(board, chess.engine.Limit(depth=SEARCH_DEPTH))
    except Exception:
        return None

    score = info.get("score")
    if score is None:
        return None

    mate = score.pov(board.turn).mate()
    if mate and mate > 0:
        return int(mate)

    return None


def main():
    if not Path(STOCKFISH_PATH).exists():
        raise FileNotFoundError(
            f"Stockfish not found:\n{STOCKFISH_PATH}"
        )

    results: Dict[int, List[Dict]] = {n: [] for n in TARGET_MATES}
    seen: Set[str] = set()

    print("Starting engine...")
    print("Using:", STOCKFISH_PATH)

    with chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH) as engine:

        attempts = 0

        while attempts < MAX_RANDOM_ATTEMPTS:
            attempts += 1

            if all(len(results[n]) >= POSITIONS_PER_MATE for n in TARGET_MATES):
                break

            board = random_kqk()
            if board is None:
                continue

            sig = board.board_fen()
            if sig in seen:
                continue

            mate = get_mate(engine, board)
            if mate not in results:
                continue

            if len(results[mate]) >= POSITIONS_PER_MATE:
                continue

            results[mate].append({
                "fen": board.fen(),
                "mateIn": mate
            })

            seen.add(sig)

            print(
                f"[KEEP] mate {mate} "
                f"{len(results[mate])}/{POSITIONS_PER_MATE}"
            )

    data = {
        "groups": [
            {
                "mateIn": n,
                "positions": results[n]
            }
            for n in TARGET_MATES
        ]
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    print("\nSaved:", OUTPUT_FILE)


if __name__ == "__main__":
    main()