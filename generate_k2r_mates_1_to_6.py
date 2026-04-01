import json
import random
import os
from pathlib import Path
import chess
import chess.engine

# =========================
# SETTINGS
# =========================

ENGINE_PATH = r"C:\Users\Ariel\chess-trainer\stockfish-windows-x86-64-avx2\stockfish\stockfish-windows-x86-64-avx2.exe"

OUT_DIR = Path(r"C:\Users\Ariel\chess-trainer\two_rooks_mate")
OUT_DIR.mkdir(parents=True, exist_ok=True)

POSITIONS_PER_MATE = 10
MAX_MATE = 6

ENGINE_DEPTH = 16
ENGINE_THREADS = 1
ENGINE_HASH = 128

RANDOM_SEED = 42
random.seed(RANDOM_SEED)

# how many random legal positions to test before stopping
MAX_TESTED = 300000

# avoid too many duplicates with similar piece layouts
MAX_PER_BK_SQUARE = 3


# =========================
# HELPERS
# =========================

def square_name(sq: chess.Square) -> str:
    return chess.square_name(sq)

def color_of_square(sq: chess.Square) -> str:
    file_idx = chess.square_file(sq)
    rank_idx = chess.square_rank(sq)
    return "light" if (file_idx + rank_idx) % 2 == 0 else "dark"

def fen_key4(fen: str) -> str:
    return " ".join(fen.split()[:4])

def manhattan(a: chess.Square, b: chess.Square) -> int:
    return abs(chess.square_file(a) - chess.square_file(b)) + abs(chess.square_rank(a) - chess.square_rank(b))

def kings_not_touching(wk: chess.Square, bk: chess.Square) -> bool:
    return max(
        abs(chess.square_file(wk) - chess.square_file(bk)),
        abs(chess.square_rank(wk) - chess.square_rank(bk)),
    ) > 1

def board_from_squares(wk: chess.Square, wr1: chess.Square, wr2: chess.Square, bk: chess.Square) -> chess.Board | None:
    squares = {wk, wr1, wr2, bk}
    if len(squares) != 4:
        return None

    if not kings_not_touching(wk, bk):
        return None

    board = chess.Board(None)
    board.turn = chess.WHITE
    board.set_piece_at(wk, chess.Piece(chess.KING, chess.WHITE))
    board.set_piece_at(wr1, chess.Piece(chess.ROOK, chess.WHITE))
    board.set_piece_at(wr2, chess.Piece(chess.ROOK, chess.WHITE))
    board.set_piece_at(bk, chess.Piece(chess.KING, chess.BLACK))
    board.castling_rights = 0
    board.ep_square = None
    board.halfmove_clock = 0
    board.fullmove_number = 1

    # must be a legal position
    if not board.is_valid():
        return None

    # black should not already be in mate/stalemate before white move
    if board.is_checkmate() or board.is_stalemate():
        return None

    # ensure black king is not illegally in check by white king adjacency
    if board.is_into_check(chess.Move.null()):
        return None

    return board

def get_engine_best(engine: chess.engine.SimpleEngine, board: chess.Board):
    info = engine.analyse(board, chess.engine.Limit(depth=ENGINE_DEPTH))
    score = info["score"].pov(chess.WHITE)

    mate = score.mate()
    cp = score.score()

    pv = info.get("pv", [])
    best_move = pv[0] if pv else None

    return {
        "mate": mate,
        "cp": cp,
        "best_move": best_move,
    }

def has_exact_mate(board: chess.Board, engine: chess.engine.SimpleEngine, mate_n: int) -> bool:
    result = get_engine_best(engine, board)
    return result["mate"] == mate_n

def board_signature(board: chess.Board) -> tuple:
    wk = board.king(chess.WHITE)
    bk = board.king(chess.BLACK)
    rooks = sorted(board.pieces(chess.ROOK, chess.WHITE))
    return (
        square_name(bk),
        square_name(wk),
        square_name(rooks[0]),
        square_name(rooks[1]),
    )

def piece_layout_signature(board: chess.Board) -> tuple:
    wk = board.king(chess.WHITE)
    bk = board.king(chess.BLACK)
    rooks = sorted(board.pieces(chess.ROOK, chess.WHITE))
    return (
        square_name(bk),
        color_of_square(wk),
        color_of_square(rooks[0]),
        color_of_square(rooks[1]),
        manhattan(wk, bk),
    )

def good_training_shape(board: chess.Board) -> bool:
    wk = board.king(chess.WHITE)
    bk = board.king(chess.BLACK)
    rooks = sorted(board.pieces(chess.ROOK, chess.WHITE))

    if wk is None or bk is None or len(rooks) != 2:
        return False

    # white king should not be too far from black king
    if manhattan(wk, bk) > 6:
        return False

    # at least one rook should be reasonably active
    rook_distances = [manhattan(r, bk) for r in rooks]
    if min(rook_distances) > 5:
        return False

    # avoid extremely trivial same-file / same-rank stacked junk too often
    if chess.square_file(rooks[0]) == chess.square_file(rooks[1]) and chess.square_rank(rooks[0]) == chess.square_rank(rooks[1]):
        return False

    return True

def random_candidate():
    squares = random.sample(list(chess.SQUARES), 4)
    wk, wr1, wr2, bk = squares
    return board_from_squares(wk, wr1, wr2, bk)

def move_to_uci(move: chess.Move | None) -> str:
    return move.uci() if move else ""

def move_to_san(board: chess.Board, move: chess.Move | None) -> str:
    if move is None:
        return ""
    temp = board.copy()
    return temp.san(move)


# =========================
# MAIN
# =========================

def main():
    print("Starting K+2R vs K generator...")
    print(f"Engine: {ENGINE_PATH}")
    print(f"Output: {OUT_DIR}")

    buckets: dict[int, list[dict]] = {i: [] for i in range(1, MAX_MATE + 1)}
    seen_fens = {i: set() for i in range(1, MAX_MATE + 1)}
    seen_layouts = {i: set() for i in range(1, MAX_MATE + 1)}
    bk_square_counts = {i: {} for i in range(1, MAX_MATE + 1)}

    tested = 0
    legal = 0
    shape_ok = 0
    exact_mate_found = 0

    transport = chess.engine.SimpleEngine.popen_uci(ENGINE_PATH)
    transport.configure({
        "Threads": ENGINE_THREADS,
        "Hash": ENGINE_HASH,
    })

    try:
        while tested < MAX_TESTED:
            if all(len(buckets[i]) >= POSITIONS_PER_MATE for i in range(1, MAX_MATE + 1)):
                break

            tested += 1
            if tested % 1000 == 0:
                current = " | ".join(f"M{i}:{len(buckets[i])}/{POSITIONS_PER_MATE}" for i in range(1, MAX_MATE + 1))
                print(f"tested={tested} | {current}")

            board = random_candidate()
            if board is None:
                continue

            legal += 1

            if not good_training_shape(board):
                continue

            shape_ok += 1

            result = get_engine_best(transport, board)
            mate = result["mate"]

            if mate is None or mate < 1 or mate > MAX_MATE:
                continue

            exact_mate_found += 1

            if len(buckets[mate]) >= POSITIONS_PER_MATE:
                continue

            fen4 = fen_key4(board.fen())
            if fen4 in seen_fens[mate]:
                continue

            layout_sig = piece_layout_signature(board)
            if layout_sig in seen_layouts[mate]:
                continue

            bk_sq = square_name(board.king(chess.BLACK))
            current_bk_count = bk_square_counts[mate].get(bk_sq, 0)
            if current_bk_count >= MAX_PER_BK_SQUARE:
                continue

            best_move = result["best_move"]
            if best_move is None:
                continue

            entry = {
                "id": f"k2r_mate_{mate}_{len(buckets[mate]) + 1:03d}",
                "mate_distance": mate,
                "fen": board.fen(),
                "fen_key4": fen4,
                "best_move_uci": move_to_uci(best_move),
                "best_move_san": move_to_san(board, best_move),
                "black_king_square": bk_sq,
                "white_king_square": square_name(board.king(chess.WHITE)),
                "white_rook_squares": sorted(square_name(sq) for sq in board.pieces(chess.ROOK, chess.WHITE)),
            }

            buckets[mate].append(entry)
            seen_fens[mate].add(fen4)
            seen_layouts[mate].add(layout_sig)
            bk_square_counts[mate][bk_sq] = current_bk_count + 1

    finally:
        transport.quit()

    print("\n=== RESULTS ===")
    print(f"tested: {tested}")
    print(f"legal: {legal}")
    print(f"shape_ok: {shape_ok}")
    print(f"exact_mate_found: {exact_mate_found}")

    all_chunks = []
    total_saved = 0

    for mate in range(1, MAX_MATE + 1):
        positions = buckets[mate]
        total_saved += len(positions)

        chunk = {
            "chunk_id": f"k2r_m{mate}",
            "label": f"Mate in {mate}",
            "mate_distance": mate,
            "positions": positions,
        }

        all_chunks.append(chunk)

        out_file = OUT_DIR / f"k2r_mate_{mate}.json"
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(chunk, f, indent=2, ensure_ascii=False)

        print(f"saved {out_file} -> {len(positions)} positions")

    combined = {
        "piece_set": "K+2R vs K",
        "max_mate": MAX_MATE,
        "positions_per_mate_target": POSITIONS_PER_MATE,
        "total_positions": total_saved,
        "chunks": all_chunks,
    }

    combined_file = OUT_DIR / "k2r_mates_1_to_6_chunks.json"
    with open(combined_file, "w", encoding="utf-8") as f:
        json.dump(combined, f, indent=2, ensure_ascii=False)

    print(f"\ncombined file: {combined_file}")
    print(f"total saved: {total_saved}")
    print("done.")


if __name__ == "__main__":
    main()