import json
from pathlib import Path
import chess

OUTPUT_FILE = Path("bn_wk_a6_knight_controls_a7.json")


def square_name(sq: int) -> str:
    return chess.square_name(sq)


def knight_controls(square_from: int, target: int) -> bool:
    return bool(chess.BB_KNIGHT_ATTACKS[square_from] & chess.BB_SQUARES[target])


def bishop_is_light_square(square: int) -> bool:
    return chess.square_color(square) == chess.WHITE


def build_board(wk_sq: int, wn_sq: int, wb_sq: int, bk_sq: int) -> chess.Board:
    board = chess.Board(None)
    board.clear()

    board.set_piece_at(wk_sq, chess.Piece(chess.KING, chess.WHITE))
    board.set_piece_at(wn_sq, chess.Piece(chess.KNIGHT, chess.WHITE))
    board.set_piece_at(wb_sq, chess.Piece(chess.BISHOP, chess.WHITE))
    board.set_piece_at(bk_sq, chess.Piece(chess.KING, chess.BLACK))

    board.turn = chess.WHITE
    board.castling_rights = 0
    board.ep_square = None
    board.halfmove_clock = 0
    board.fullmove_number = 1

    return board


def kings_not_touching(wk_sq: int, bk_sq: int) -> bool:
    wk_file = chess.square_file(wk_sq)
    wk_rank = chess.square_rank(wk_sq)
    bk_file = chess.square_file(bk_sq)
    bk_rank = chess.square_rank(bk_sq)
    return max(abs(wk_file - bk_file), abs(wk_rank - bk_rank)) > 1


def main():
    bk_sq = chess.A8
    wk_sq = chess.A6
    target_sq = chess.A7

    results = []
    seen_fens = set()

    all_squares = list(chess.SQUARES)

    knight_squares = [
        sq for sq in all_squares
        if sq not in (bk_sq, wk_sq) and knight_controls(sq, target_sq)
    ]

    print("Knight squares controlling a7:")
    print([square_name(sq) for sq in knight_squares])

    for wn_sq in knight_squares:
        for wb_sq in all_squares:
            if wb_sq in (bk_sq, wk_sq, wn_sq):
                continue

            board = build_board(wk_sq, wn_sq, wb_sq, bk_sq)

            if not kings_not_touching(wk_sq, bk_sq):
                continue

            if not board.is_valid():
                continue

            fen4 = " ".join(board.fen().split()[:4])
            if fen4 in seen_fens:
                continue
            seen_fens.add(fen4)

            results.append({
                "fen": fen4,
                "whiteKing": square_name(wk_sq),
                "blackKing": square_name(bk_sq),
                "whiteKnight": square_name(wn_sq),
                "whiteBishop": square_name(wb_sq),
                "controlledSquare": "a7",
                "corner": "a8",
                "bishopColor": "light" if bishop_is_light_square(wb_sq) else "dark",
                "phase": "phase3",
            })

    results.sort(key=lambda x: (x["whiteKnight"], x["whiteBishop"], x["fen"]))

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print(f"Total positions: {len(results)}")
    print(f"Saved to: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()