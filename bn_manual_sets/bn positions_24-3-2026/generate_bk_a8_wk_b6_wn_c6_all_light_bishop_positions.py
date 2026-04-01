import json
import os
import chess
from chess import Board, square_name, SQUARES, square_file, square_rank

# --------------------------------------------------
# FIXED PIECES
# --------------------------------------------------
BLACK_KING = chess.A8
WHITE_KING = chess.B6
WHITE_KNIGHT = chess.C6

# --------------------------------------------------
# OUTPUT
# --------------------------------------------------
OUTPUT_DIR = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026"
OUTPUT_JSON = os.path.join(
    OUTPUT_DIR,
    "bk_a8_wk_b6_wn_c6_all_light_bishop_positions.json"
)

# --------------------------------------------------
# HELPERS
# --------------------------------------------------
def is_light_square(sq: int) -> bool:
    return (square_file(sq) + square_rank(sq)) % 2 == 1

def build_board(bishop_sq: int) -> Board:
    board = Board(None)
    board.clear()

    board.set_piece_at(BLACK_KING, chess.Piece(chess.KING, chess.BLACK))
    board.set_piece_at(WHITE_KING, chess.Piece(chess.KING, chess.WHITE))
    board.set_piece_at(WHITE_KNIGHT, chess.Piece(chess.KNIGHT, chess.WHITE))
    board.set_piece_at(bishop_sq, chess.Piece(chess.BISHOP, chess.WHITE))

    board.turn = chess.WHITE
    board.castling_rights = 0
    board.ep_square = None
    board.halfmove_clock = 0
    board.fullmove_number = 1
    return board

def legal_position(board: Board) -> bool:
    return board.is_valid()

# --------------------------------------------------
# MAIN
# --------------------------------------------------
def main():
    print("starting...")

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    results = []
    occupied = {BLACK_KING, WHITE_KING, WHITE_KNIGHT}

    for bishop_sq in SQUARES:
        if not is_light_square(bishop_sq):
            continue

        if bishop_sq in occupied:
            continue

        board = build_board(bishop_sq)

        if not legal_position(board):
            continue

        results.append({
            "theme": "bn_all_light_bishop_positions",
            "fen": board.fen(),
            "black_king": square_name(BLACK_KING),
            "white_king": square_name(WHITE_KING),
            "white_knight": square_name(WHITE_KNIGHT),
            "white_bishop": square_name(bishop_sq)
        })

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print("=== FINISHED ===")
    print(f"Found legal bishop positions: {len(results)}")
    print(f"Saved to: {OUTPUT_JSON}")

if __name__ == "__main__":
    main()