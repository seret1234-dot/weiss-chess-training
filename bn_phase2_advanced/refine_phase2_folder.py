import json
import chess
from pathlib import Path

BASE_DIR = Path(r"C:\Users\Ariel\chess-trainer\bn_phase2_advanced")

MAX_WK_DISTANCE = 3
MAX_N_DISTANCE = 3
MAX_B_DISTANCE = 4

MIN_FILE = 4   # e-file or right
MIN_RANK = 4   # 5th rank or higher


def manhattan(sq1, sq2):
    f1, r1 = chess.square_file(sq1), chess.square_rank(sq1)
    f2, r2 = chess.square_file(sq2), chess.square_rank(sq2)
    return abs(f1 - f2) + abs(r1 - r2)


def find_piece(board, piece_type, color):
    for sq, piece in board.piece_map().items():
        if piece.piece_type == piece_type and piece.color == color:
            return sq
    return None


def in_training_zone(square):
    file_i = chess.square_file(square)
    rank_i = chess.square_rank(square)
    return file_i >= MIN_FILE and rank_i >= MIN_RANK


def target_square_from_name(filename_stem):
    parts = filename_stem.split("_")
    for p in parts:
        if len(p) == 2 and p[0] in "abcdefgh" and p[1] in "12345678":
            return p
    return None


def should_process(path: Path):
    name = path.name.lower()
    if not name.endswith(".json"):
        return False
    if name.endswith("_refined.json"):
        return False
    return name.startswith("phase2_")


def refine_file(input_path: Path):
    stem = input_path.stem
    target_bk = target_square_from_name(stem)

    with open(input_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    refined = []
    seen = set()

    for item in data:
        fen = item.get("fen")
        if not fen:
            continue

        try:
            board = chess.Board(fen)
        except Exception:
            continue

        wk = find_piece(board, chess.KING, chess.WHITE)
        bk = find_piece(board, chess.KING, chess.BLACK)
        wn = find_piece(board, chess.KNIGHT, chess.WHITE)
        wb = find_piece(board, chess.BISHOP, chess.WHITE)

        if None in (wk, bk, wn, wb):
            continue

        if board.turn != chess.WHITE:
            continue

        if board.is_check() or board.is_checkmate() or board.is_stalemate():
            continue

        if target_bk and chess.square_name(bk) != target_bk:
            continue

        if manhattan(wk, bk) > MAX_WK_DISTANCE:
            continue
        if manhattan(wn, bk) > MAX_N_DISTANCE:
            continue
        if manhattan(wb, bk) > MAX_B_DISTANCE:
            continue

        if manhattan(wk, bk) < 2:
            continue

        if not in_training_zone(wk):
            continue
        if not in_training_zone(wn):
            continue
        if not in_training_zone(wb):
            continue

        key = board.board_fen()
        if key in seen:
            continue
        seen.add(key)

        new_item = dict(item)
        new_item["bk"] = chess.square_name(bk)
        refined.append(new_item)

    output_path = input_path.with_name(f"{stem}_refined.json")
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(refined, f, indent=2)

    print(f"{input_path.name}: kept {len(refined)} / {len(data)} -> {output_path.name}")


def main():
    files = sorted([p for p in BASE_DIR.iterdir() if should_process(p)])
    print(f"Found {len(files)} phase2 json files")

    for path in files:
        refine_file(path)


if __name__ == "__main__":
    main()