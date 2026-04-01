# build_bn_typical_e8_e7_generate.py
# Generate BN typical maneuver positions from scratch
# - black king on e8 or e7
# - bishop on light square only
# - white king in typical maneuver squares
# - legal KBNvK positions
# - white to move
# - black king not already in check

from __future__ import annotations

import json
from pathlib import Path
import chess

OUTPUT_DIR = Path(r"C:\Users\Ariel\chess-trainer")

OUTPUT_E8 = OUTPUT_DIR / "bn_typical_bk_e8_light.json"
OUTPUT_E7 = OUTPUT_DIR / "bn_typical_bk_e7_light.json"

# Typical white-king maneuver zone for driving toward a8
TYPICAL_WK_SQUARES = {
    "b6", "c6", "d6", "e6",
    "b7", "c7", "d7", "e7",
    "b8", "c8", "d8",
}

BLACK_KING_TARGETS = ["e8", "e7"]

REQUIRE_BLACK_NOT_IN_CHECK = True
REQUIRE_WHITE_TO_MOVE = True


def is_light_square(square: int) -> bool:
    return (chess.square_file(square) + chess.square_rank(square)) % 2 == 1


def build_board(wk_sq: int, wb_sq: int, wn_sq: int, bk_sq: int) -> chess.Board | None:
    squares = [wk_sq, wb_sq, wn_sq, bk_sq]
    if len(set(squares)) != 4:
        return None

    board = chess.Board(None)
    board.set_piece_at(wk_sq, chess.Piece(chess.KING, chess.WHITE))
    board.set_piece_at(wb_sq, chess.Piece(chess.BISHOP, chess.WHITE))
    board.set_piece_at(wn_sq, chess.Piece(chess.KNIGHT, chess.WHITE))
    board.set_piece_at(bk_sq, chess.Piece(chess.KING, chess.BLACK))
    board.turn = chess.WHITE if REQUIRE_WHITE_TO_MOVE else chess.BLACK
    board.castling_rights = 0
    board.ep_square = None
    board.halfmove_clock = 0
    board.fullmove_number = 1

    # Kings cannot touch
    if chess.square_distance(wk_sq, bk_sq) <= 1:
        return None

    # White king cannot be attacked by black king
    if board.is_attacked_by(chess.BLACK, wk_sq):
        return None

    # Black king not already in check
    if REQUIRE_BLACK_NOT_IN_CHECK and board.is_attacked_by(chess.WHITE, bk_sq):
        return None

    return board


def square_names_to_indices(names: set[str]) -> list[int]:
    return [chess.parse_square(s) for s in sorted(names)]


def generate_for_black_king(bk_name: str):
    bk_sq = chess.parse_square(bk_name)
    wk_candidates = square_names_to_indices(TYPICAL_WK_SQUARES)

    results = []
    seen = set()
    idx = 1

    for wk_sq in wk_candidates:
        # no overlap / kings not touching handled in build_board
        for wb_sq in chess.SQUARES:
            if not is_light_square(wb_sq):
                continue

            for wn_sq in chess.SQUARES:
                board = build_board(wk_sq, wb_sq, wn_sq, bk_sq)
                if board is None:
                    continue

                fen = board.fen()
                if fen in seen:
                    continue
                seen.add(fen)

                results.append({
                    "id": f"{bk_name}_{idx}",
                    "label": "bn_typical_maneuver",
                    "blackKing": bk_name,
                    "whiteKing": chess.square_name(wk_sq),
                    "whiteKnight": chess.square_name(wn_sq),
                    "whiteBishop": chess.square_name(wb_sq),
                    "bishopColor": "light",
                    "corner": "a8",
                    "startFen": fen,
                })
                idx += 1

    return results


def write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def main():
    print("[START] Generating typical BN maneuver positions")

    e8_positions = generate_for_black_king("e8")
    print(f"[DONE] e8: {len(e8_positions)}")

    e7_positions = generate_for_black_king("e7")
    print(f"[DONE] e7: {len(e7_positions)}")

    write_json(OUTPUT_E8, e8_positions)
    write_json(OUTPUT_E7, e7_positions)

    print()
    print("=== FINISHED ===")
    print(f"Wrote: {OUTPUT_E8}")
    print(f"Wrote: {OUTPUT_E7}")


if __name__ == "__main__":
    main()