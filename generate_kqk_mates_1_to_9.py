import json
import random
from pathlib import Path
from typing import Dict, List, Set, Tuple

import chess
import chess.engine

# =========================
# CONFIG
# =========================

STOCKFISH_PATH = r"C:\Users\Ariel\chess-trainer\stockfish-windows-x86-64-avx2\stockfish\stockfish-windows-x86-64-avx2.exe"

OUTPUT_FILE = "kqk_mates_1_to_9.json"

POSITIONS_PER_MATE = 10
TARGET_MATES = list(range(9, 0, -1))  # 9,8,7,...,1

ENGINE_HASH_MB = 128
ENGINE_THREADS = 1

SEARCH_DEPTH = 18
MAX_RANDOM_ATTEMPTS = 500000
WHITE_TO_MOVE_ONLY = True


def kings_not_adjacent(wk: chess.Square, bk: chess.Square) -> bool:
    return chess.square_distance(wk, bk) > 1


def is_valid_kqk_board(wk, wq, bk, white_to_move=True):
    if len({wk, wq, bk}) < 3:
        return None
    if not kings_not_adjacent(wk, bk):
        return None

    board = chess.Board(None)
    board.set_piece_at(wk, chess.Piece(chess.KING, chess.WHITE))
    board.set_piece_at(wq, chess.Piece(chess.QUEEN, chess.WHITE))
    board.set_piece_at(bk, chess.Piece(chess.KING, chess.BLACK))
    board.turn = chess.WHITE if white_to_move else chess.BLACK

    if not board.is_valid():
        return None
    if board.is_checkmate() or board.is_stalemate():
        return None
    if board.is_check():
        return None

    return board


def normalize_signature(board):
    return board.board_fen() + (" w" if board.turn else " b")


def get_mate_distance(engine, board, depth):
    try:
        info = engine.analyse(board, chess.engine.Limit(depth=depth))
    except Exception:
        return None

    score = info.get("score")
    if score is None:
        return None

    mate = score.pov(board.turn).mate()
    if mate and mate > 0:
        return int(mate)

    return None


def random_kqk_position():
    wk = random.choice(list(chess.SQUARES))
    wq = random.choice(list(chess.SQUARES))
    bk = random.choice(list(chess.SQUARES))

    return is_valid_kqk_board(wk, wq, bk, WHITE_TO_MOVE_ONLY)


def main():
    stockfish_file = Path(STOCKFISH_PATH)
    if not stockfish_file.exists():
        raise FileNotFoundError(f"Stockfish not found at:\n{STOCKFISH_PATH}")

    results: Dict[int, List[Dict]] = {n: [] for n in TARGET_MATES}
    seen: Set[str] = set()

    print("Starting engine...")
    print("Using:", STOCKFISH_PATH)

    with chess.engine.SimpleEngine.popen_uci(str(stockfish_file)) as engine:
        engine.configure({"Hash": ENGINE_HASH_MB, "Threads": ENGINE_THREADS})

        attempts = 0

        while attempts < MAX_RANDOM_ATTEMPTS:
            attempts += 1

            if all(len(results[n]) >= POSITIONS_PER_MATE for n in TARGET_MATES):
                break

            board = random_kqk_position()
            if board is None:
                continue

            sig = normalize_signature(board)
            if sig in seen:
                continue

            mate_n = get_mate_distance(engine, board, SEARCH_DEPTH)
            if mate_n not in results:
                continue

            if len(results[mate_n]) >= POSITIONS_PER_MATE:
                continue

            results[mate_n].append({
                "fen": board.fen(),
                "mateIn": mate_n
            })

            seen.add(sig)

            print(f"[KEEP] mate {mate_n} {len(results[mate_n])}/10")

    data = {
        "groups": [
            {"mateIn": n, "positions": results[n]}
            for n in TARGET_MATES
        ]
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    print("\nSaved:", OUTPUT_FILE)


if __name__ == "__main__":
    main()