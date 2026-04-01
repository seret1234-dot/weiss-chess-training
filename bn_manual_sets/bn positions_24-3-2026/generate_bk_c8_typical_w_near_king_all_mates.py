import json
import os
import chess
import chess.engine
from chess import Board, square_name, SQUARES, square_file, square_rank

# --------------------------------------------------
# ENGINE
# --------------------------------------------------
ENGINE_PATH = r"C:\Users\Ariel\chess-trainer\stockfish-windows-x86-64-avx2\stockfish\stockfish-windows-x86-64-avx2.exe"
ENGINE_DEPTH = 12
ENGINE_TIME_LIMIT = 0.15  # seconds per position

# --------------------------------------------------
# FIXED BLACK KING
# --------------------------------------------------
BLACK_KING = chess.C8

# --------------------------------------------------
# OUTPUT
# --------------------------------------------------
OUTPUT_DIR = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026"
OUTPUT_JSON = os.path.join(
    OUTPUT_DIR,
    "bk_c8_typical_w_near_king_all_mates.json"
)

# --------------------------------------------------
# HELPERS
# --------------------------------------------------
def is_light_square(sq: int) -> bool:
    return (square_file(sq) + square_rank(sq)) % 2 == 1

def chebyshev_distance(sq1: int, sq2: int) -> int:
    f1, r1 = square_file(sq1), square_rank(sq1)
    f2, r2 = square_file(sq2), square_rank(sq2)
    return max(abs(f1 - f2), abs(r1 - r2))

def knight_attacks_square(knight_sq: int, target_sq: int) -> bool:
    return target_sq in chess.SquareSet(chess.BB_KNIGHT_ATTACKS[knight_sq])

def king_attack_squares(king_sq: int):
    return sorted(chess.SquareSet(chess.BB_KING_ATTACKS[king_sq]))

def build_board(white_king: int, white_knight: int, white_bishop: int) -> Board:
    board = Board(None)
    board.clear()

    board.set_piece_at(BLACK_KING, chess.Piece(chess.KING, chess.BLACK))
    board.set_piece_at(white_king, chess.Piece(chess.KING, chess.WHITE))
    board.set_piece_at(white_knight, chess.Piece(chess.KNIGHT, chess.WHITE))
    board.set_piece_at(white_bishop, chess.Piece(chess.BISHOP, chess.WHITE))

    board.turn = chess.WHITE
    board.castling_rights = 0
    board.ep_square = None
    board.halfmove_clock = 0
    board.fullmove_number = 1
    return board

def legal_position(board: Board) -> bool:
    return board.is_valid()

def get_white_king_candidates_near_bk():
    candidates = []
    for sq in SQUARES:
        if sq == BLACK_KING:
            continue
        if chebyshev_distance(BLACK_KING, sq) <= 2:
            candidates.append(sq)
    return sorted(candidates)

def get_black_neighbor_squares():
    return sorted(king_attack_squares(BLACK_KING))

def get_knight_candidates_controlling_any_near_bk_square(white_king: int):
    near_bk = get_black_neighbor_squares()
    results = []
    occupied = {BLACK_KING, white_king}

    for knight_sq in SQUARES:
        if knight_sq in occupied:
            continue

        controlled_targets = [
            sq for sq in near_bk
            if knight_attacks_square(knight_sq, sq)
        ]

        if not controlled_targets:
            continue

        results.append((knight_sq, controlled_targets))

    return results

def analyze_mate(engine, board: Board):
    try:
        info = engine.analyse(
            board,
            chess.engine.Limit(depth=ENGINE_DEPTH, time=ENGINE_TIME_LIMIT)
        )
        score = info.get("score")
        pv = info.get("pv", [])

        if score is None:
            return None

        mate_score = score.white().mate()
        if mate_score is None:
            return None

        if mate_score <= 0:
            return None

        bestmove = pv[0].uci() if pv else None
        bestmove_san = None
        if pv:
            temp = board.copy()
            bestmove_san = temp.san(pv[0])

        return {
            "mate_distance": mate_score,
            "bestmove_uci": bestmove,
            "bestmove_san": bestmove_san,
        }

    except chess.engine.EngineTerminatedError:
        raise
    except chess.engine.EngineError:
        return None
    except Exception:
        return None

def save_results(path, results):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

# --------------------------------------------------
# MAIN
# --------------------------------------------------
def main():
    print("starting...")
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    all_results = []
    total_legal = 0
    engine_calls = 0
    mate_counts = {}

    white_king_candidates = get_white_king_candidates_near_bk()
    near_bk = get_black_neighbor_squares()

    print("WK candidates:", [square_name(sq) for sq in white_king_candidates])
    print("Squares near BK:", [square_name(sq) for sq in near_bk])

    engine = chess.engine.SimpleEngine.popen_uci(ENGINE_PATH)

    try:
        for white_king in white_king_candidates:
            knight_candidates = get_knight_candidates_controlling_any_near_bk_square(white_king)

            print(f"[WK {square_name(white_king)}] knight candidates: {len(knight_candidates)}")

            for white_knight, controlled_targets in knight_candidates:
                occupied = {BLACK_KING, white_king, white_knight}
                kept_here = 0

                for white_bishop in SQUARES:
                    if not is_light_square(white_bishop):
                        continue
                    if white_bishop in occupied:
                        continue

                    board = build_board(white_king, white_knight, white_bishop)

                    if not legal_position(board):
                        continue

                    total_legal += 1
                    engine_calls += 1

                    if engine_calls % 25 == 0:
                        print(
                            f"engine checked: {engine_calls} | "
                            f"legal: {total_legal} | "
                            f"kept: {len(all_results)} | "
                            f"current: WK {square_name(white_king)} "
                            f"WN {square_name(white_knight)} "
                            f"WB {square_name(white_bishop)}"
                        )
                        save_results(OUTPUT_JSON, all_results)

                    result = analyze_mate(engine, board)
                    if result is None:
                        continue

                    md = result["mate_distance"]
                    mate_counts[md] = mate_counts.get(md, 0) + 1

                    all_results.append({
                        "theme": "bn_typical_w_near_bk_c8",
                        "fen": board.fen(),
                        "black_king": square_name(BLACK_KING),
                        "white_king": square_name(white_king),
                        "white_knight": square_name(white_knight),
                        "white_bishop": square_name(white_bishop),
                        "knight_controls_near_bk_squares": [
                            square_name(sq) for sq in controlled_targets
                        ],
                        "mate_distance": md,
                        "bestmove_uci": result["bestmove_uci"],
                        "bestmove_san": result["bestmove_san"],
                    })
                    kept_here += 1

                print(
                    f"   knight {square_name(white_knight)} controls "
                    f"{[square_name(sq) for sq in controlled_targets]} -> "
                    f"{kept_here} mate positions kept"
                )

    finally:
        engine.quit()

    all_results.sort(
        key=lambda x: (
            x["mate_distance"],
            x["white_king"],
            x["white_knight"],
            x["white_bishop"]
        )
    )

    save_results(OUTPUT_JSON, all_results)

    print("=== FINISHED ===")
    print(f"Total legal candidates checked: {total_legal}")
    print(f"Engine calls: {engine_calls}")
    print(f"Total mate positions kept: {len(all_results)}")
    print("Mate-distance summary:")
    for md in sorted(mate_counts):
        print(f"  mate in {md}: {mate_counts[md]}")
    print(f"Saved to: {OUTPUT_JSON}")

if __name__ == "__main__":
    main()