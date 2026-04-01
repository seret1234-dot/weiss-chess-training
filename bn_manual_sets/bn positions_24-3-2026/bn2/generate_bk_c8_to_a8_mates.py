import json
from pathlib import Path

import chess

OUTPUT_DIR = Path(r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

BK = chess.C8

WK_ALLOWED = {
    chess.B6,
    chess.C6,
    chess.D6,
}

WN_ALLOWED = {
    chess.A5, chess.B5, chess.C5, chess.D5, chess.E5,
    chess.A6, chess.B6, chess.C6, chess.D6, chess.E6,
    chess.A7, chess.B7, chess.C7, chess.D7, chess.E7,
    chess.A8, chess.B8,         chess.D8, chess.E8,
}

PRINT_EVERY = 200


def is_light_square(square: int) -> bool:
    return (chess.square_file(square) + chess.square_rank(square)) % 2 == 0


def sq(square: int) -> str:
    return chess.square_name(square)


def build_board(wk: int, wn: int, wb: int):
    if len({BK, wk, wn, wb}) != 4:
        return None

    board = chess.Board(None)
    board.turn = chess.WHITE
    board.set_piece_at(BK, chess.Piece(chess.KING, chess.BLACK))
    board.set_piece_at(wk, chess.Piece(chess.KING, chess.WHITE))
    board.set_piece_at(wn, chess.Piece(chess.KNIGHT, chess.WHITE))
    board.set_piece_at(wb, chess.Piece(chess.BISHOP, chess.WHITE))
    board.castling_rights = 0
    board.ep_square = None
    board.halfmove_clock = 0
    board.fullmove_number = 1

    if not board.is_valid():
        return None
    if board.is_checkmate() or board.is_stalemate():
        return None

    return board


def knight_controls(square_from: int, target: int) -> bool:
    return target in chess.SquareSet(chess.BB_KNIGHT_ATTACKS[square_from])


def bishop_controls(board: chess.Board, bishop_square: int, target: int) -> bool:
    piece = board.piece_at(bishop_square)
    if piece is None or piece.piece_type != chess.BISHOP:
        return False
    return target in board.attacks(bishop_square)


def white_king_not_too_far(wk: int) -> bool:
    return chess.square_distance(wk, BK) <= 2


def record(board: chess.Board, wk: int, wn: int, wb: int, controls):
    return {
        "theme": "bn_bk_c8_typical_drive_to_b8",
        "fen": board.fen(),
        "black_king": "c8",
        "white_king": sq(wk),
        "white_knight": sq(wn),
        "white_bishop": sq(wb),
        "targets_controlled": controls,
    }


def main():
    print("starting c8 typical generator...")

    light_bishop_squares = [s for s in chess.SQUARES if is_light_square(s) and s != BK]

    out = []
    seen = set()
    tested = 0
    legal = 0

    for wk in sorted(WK_ALLOWED):
        for wn in sorted(WN_ALLOWED):
            if wn in {BK, wk}:
                continue

            for wb in light_bishop_squares:
                if wb in {BK, wk, wn}:
                    continue

                tested += 1
                if tested % PRINT_EVERY == 0:
                    print(f"[UPDATE] tested={tested} legal={legal} kept={len(out)}")

                board = build_board(wk, wn, wb)
                if board is None:
                    continue
                legal += 1

                if not white_king_not_too_far(wk):
                    continue

                controls = []

                # Main driving targets from c8 toward b8/a8 structure
                if knight_controls(wn, chess.B8):
                    controls.append("b8")
                if knight_controls(wn, chess.A7):
                    controls.append("a7")

                # Helpful bishop coverage for the corner box
                if bishop_controls(board, wb, chess.B7):
                    controls.append("b7")
                if bishop_controls(board, wb, chess.A6):
                    controls.append("a6")

                # Keep only typical driving positions
                if not ("b8" in controls or "a7" in controls):
                    continue

                fen_key = board.board_fen()
                if fen_key in seen:
                    continue
                seen.add(fen_key)

                out.append(record(board, wk, wn, wb, controls))

    out_path = OUTPUT_DIR / "bk_c8_typical_drive_pool.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print("=== FINISHED ===")
    print(f"tested: {tested}")
    print(f"legal: {legal}")
    print(f"kept: {len(out)}")
    print(f"output: {out_path}")


if __name__ == "__main__":
    main()