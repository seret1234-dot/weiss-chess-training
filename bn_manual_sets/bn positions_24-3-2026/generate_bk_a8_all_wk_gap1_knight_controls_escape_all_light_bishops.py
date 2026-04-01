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
    "bk_a8_all_wk_gap1_knight_controls_escape_all_light_bishops.json"
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

def get_white_king_candidates():
    """
    All WK squares with king-distance exactly 2 from BK a8.
    This matches the idea of '1 square between the kings',
    including diagonal-type cases.
    """
    candidates = []
    for sq in SQUARES:
        if sq == BLACK_KING:
            continue
        if chebyshev_distance(BLACK_KING, sq) == 2:
            # kings may not be adjacent, so distance 2 is okay
            candidates.append(sq)
    return candidates

def get_black_escape_squares_vs_white_king(white_king: int):
    """
    Black king legal destination squares from a8,
    considering only the white king's control.
    We ignore bishop/knight for this step because we want
    the knight to be chosen to control the remaining escape squares.
    """
    bk_moves = king_attack_squares(BLACK_KING)
    wk_attacks = king_attack_squares(white_king)

    escape = []
    for sq in bk_moves:
        # black king cannot move onto the white king square
        if sq == white_king:
            continue
        # black king cannot move into a square controlled by white king
        if sq in wk_attacks:
            continue
        escape.append(sq)

    return sorted(escape)

def get_knight_candidates_that_control_all_escape_squares(white_king: int, escape_squares):
    """
    Find all knight squares such that the knight attacks ALL
    black escape squares that remain after WK control.
    """
    results = []

    occupied = {BLACK_KING, white_king}

    for knight_sq in SQUARES:
        if knight_sq in occupied:
            continue

        ok = True
        for target_sq in escape_squares:
            if not knight_attacks_square(knight_sq, target_sq):
                ok = False
                break

        if not ok:
            continue

        # Also ensure basic legality with some placeholder bishop later?
        # We validate full board only after bishop is added.
        results.append(knight_sq)

    return results

# --------------------------------------------------
# MAIN
# --------------------------------------------------
def main():
    print("starting...")
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    white_king_candidates = get_white_king_candidates()
    all_results = []

    print("WK candidates:", [square_name(sq) for sq in white_king_candidates])

    for white_king in white_king_candidates:
        escape_squares = get_black_escape_squares_vs_white_king(white_king)

        print(
            f"[WK {square_name(white_king)}] "
            f"escape squares: {[square_name(sq) for sq in escape_squares]}"
        )

        knight_candidates = get_knight_candidates_that_control_all_escape_squares(
            white_king,
            escape_squares
        )

        print(
            f"[WK {square_name(white_king)}] "
            f"knight candidates: {len(knight_candidates)}"
        )

        for white_knight in knight_candidates:
            occupied = {BLACK_KING, white_king, white_knight}

            bishop_count = 0

            for white_bishop in SQUARES:
                # bishop only on light squares
                if not is_light_square(white_bishop):
                    continue

                if white_bishop in occupied:
                    continue

                board = build_board(white_king, white_knight, white_bishop)

                if not legal_position(board):
                    continue

                all_results.append({
                    "theme": "bn_king_gap1_knight_controls_escape_all_light_bishops",
                    "fen": board.fen(),
                    "black_king": square_name(BLACK_KING),
                    "white_king": square_name(white_king),
                    "white_knight": square_name(white_knight),
                    "white_bishop": square_name(white_bishop),
                    "escape_squares_not_controlled_by_wk": [
                        square_name(sq) for sq in escape_squares
                    ]
                })
                bishop_count += 1

            print(
                f"   knight {square_name(white_knight)} -> "
                f"{bishop_count} legal light-square bishop positions"
            )

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(all_results, f, indent=2, ensure_ascii=False)

    print("=== FINISHED ===")
    print(f"Total generated positions: {len(all_results)}")
    print(f"Saved to: {OUTPUT_JSON}")

if __name__ == "__main__":
    main()