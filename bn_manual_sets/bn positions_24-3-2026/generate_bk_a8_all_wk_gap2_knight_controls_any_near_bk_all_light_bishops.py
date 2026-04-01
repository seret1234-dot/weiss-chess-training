import json
import os
import chess
from chess import Board, square_name, SQUARES, square_file, square_rank

# --------------------------------------------------
# FIXED BLACK KING
# --------------------------------------------------
BLACK_KING = chess.A8

# --------------------------------------------------
# OUTPUT
# --------------------------------------------------
OUTPUT_DIR = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026"
OUTPUT_JSON = os.path.join(
    OUTPUT_DIR,
    "bk_a8_all_wk_gap2_knight_controls_any_near_bk_all_light_bishops.json"
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
    return set(chess.SquareSet(chess.BB_KING_ATTACKS[king_sq]))

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

def get_white_king_candidates_gap2():
    """
    '2 squares gap between the kings'
    -> interpret as king-distance exactly 3 from a8
    """
    candidates = []
    for sq in SQUARES:
        if sq == BLACK_KING:
            continue
        if chebyshev_distance(BLACK_KING, sq) == 3:
            candidates.append(sq)
    return sorted(candidates)

def get_black_neighbor_squares():
    """
    Squares next to black king a8.
    For a8 these are usually: a7, b7, b8
    """
    return sorted(king_attack_squares(BLACK_KING))

def get_knight_candidates_controlling_any_near_bk_square(white_king: int):
    """
    Keep any knight square that controls AT LEAST ONE square next to black king.
    """
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

        if len(controlled_targets) == 0:
            continue

        results.append((knight_sq, controlled_targets))

    return results

# --------------------------------------------------
# MAIN
# --------------------------------------------------
def main():
    print("starting...")
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    all_results = []

    white_king_candidates = get_white_king_candidates_gap2()
    near_bk = get_black_neighbor_squares()

    print("WK candidates:", [square_name(sq) for sq in white_king_candidates])
    print("Squares near BK:", [square_name(sq) for sq in near_bk])

    for white_king in white_king_candidates:
        knight_candidates = get_knight_candidates_controlling_any_near_bk_square(white_king)

        print(
            f"[WK {square_name(white_king)}] "
            f"knight candidates: {len(knight_candidates)}"
        )

        for white_knight, controlled_targets in knight_candidates:
            occupied = {BLACK_KING, white_king, white_knight}
            bishop_count = 0

            for white_bishop in SQUARES:
                if not is_light_square(white_bishop):
                    continue

                if white_bishop in occupied:
                    continue

                board = build_board(white_king, white_knight, white_bishop)

                if not legal_position(board):
                    continue

                all_results.append({
                    "theme": "bn_gap2_knight_controls_any_near_bk_square_all_light_bishops",
                    "fen": board.fen(),
                    "black_king": square_name(BLACK_KING),
                    "white_king": square_name(white_king),
                    "white_knight": square_name(white_knight),
                    "white_bishop": square_name(white_bishop),
                    "knight_controls_near_bk_squares": [
                        square_name(sq) for sq in controlled_targets
                    ]
                })
                bishop_count += 1

            print(
                f"   knight {square_name(white_knight)} controls "
                f"{[square_name(sq) for sq in controlled_targets]} -> "
                f"{bishop_count} legal light-square bishop positions"
            )

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(all_results, f, indent=2, ensure_ascii=False)

    print("=== FINISHED ===")
    print(f"Total generated positions: {len(all_results)}")
    print(f"Saved to: {OUTPUT_JSON}")

if __name__ == "__main__":
    main()