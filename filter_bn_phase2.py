import json
import chess

INPUT_FILES = [
    ("bn_phase2_f7.json", "bn_phase2_f7_filtered.json", "f7"),
    ("bn_phase2_e7.json", "bn_phase2_e7_filtered.json", "e7"),
]

MAX_WK_DISTANCE = 3
MAX_N_DISTANCE = 4
MAX_B_DISTANCE = 5


def manhattan(sq1, sq2):
    f1, r1 = chess.square_file(sq1), chess.square_rank(sq1)
    f2, r2 = chess.square_file(sq2), chess.square_rank(sq2)
    return abs(f1 - f2) + abs(r1 - r2)


def find_piece(board, piece_type, color):
    for sq, piece in board.piece_map().items():
        if piece.piece_type == piece_type and piece.color == color:
            return sq
    return None


for input_file, output_file, target_bk in INPUT_FILES:
    with open(input_file, "r") as f:
        data = json.load(f)

    filtered = []
    seen = set()

    for item in data:
        fen = item["fen"]
        board = chess.Board(fen)

        wk = find_piece(board, chess.KING, chess.WHITE)
        bk = find_piece(board, chess.KING, chess.BLACK)
        wn = find_piece(board, chess.KNIGHT, chess.WHITE)
        wb = find_piece(board, chess.BISHOP, chess.WHITE)

        if None in (wk, bk, wn, wb):
            continue

        if chess.square_name(bk) != target_bk:
            continue

        if board.turn != chess.WHITE:
            continue

        if board.is_checkmate() or board.is_stalemate() or board.is_check():
            continue

        # Keep pieces near the action
        if manhattan(wk, bk) > MAX_WK_DISTANCE:
            continue
        if manhattan(wn, bk) > MAX_N_DISTANCE:
            continue
        if manhattan(wb, bk) > MAX_B_DISTANCE:
            continue

        # White king should usually be helping from nearby, not touching
        if manhattan(wk, bk) < 2:
            continue

        # Avoid duplicates
        key = board.board_fen()
        if key in seen:
            continue
        seen.add(key)

        filtered.append({
            "fen": fen,
            "bk": target_bk
        })

    with open(output_file, "w") as f:
        json.dump(filtered, f, indent=2)

    print(f"{target_bk}: kept {len(filtered)} / {len(data)}")