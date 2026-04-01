# sort_bn_ab_unique.py

from __future__ import annotations

import json
import re
from pathlib import Path
import chess

INPUT_DIR = Path(r"C:\Users\Ariel\chess-trainer\bn_manual_sets\ab")
OUTPUT_DIR = INPUT_DIR / "final_unique_sorted"


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def extract_items(data):
    if isinstance(data, list):
        return data, "list"

    if isinstance(data, dict):
        for key in ("positions", "items", "puzzles"):
            if isinstance(data.get(key), list):
                return data[key], key

    return [], None


def rebuild_same_shape(original_data, new_items, shape_kind):
    if shape_kind == "list":
        return new_items

    if isinstance(original_data, dict):
        out = dict(original_data)
        out[shape_kind] = new_items
        return out

    return new_items


def get_fen(item):
    return item.get("startFen") or item.get("fen")


def parse_board(item):
    fen = get_fen(item)
    if not fen:
        return None
    try:
        return chess.Board(fen)
    except Exception:
        return None


def find_white_bishop_square(board: chess.Board):
    for sq, piece in board.piece_map().items():
        if piece.color == chess.WHITE and piece.piece_type == chess.BISHOP:
            return sq
    return None


def find_black_king_square(board: chess.Board):
    sq = board.king(chess.BLACK)
    return chess.square_name(sq) if sq is not None else ""


def is_light_square(square: int) -> bool:
    return (chess.square_file(square) + chess.square_rank(square)) % 2 == 1


def get_black_king_field(item):
    value = item.get("blackKing")
    return value.strip().lower() if isinstance(value, str) else ""


def get_mate_distance(item):
    for key in (
        "mateDistance",
        "mate_distance",
        "dtm",
        "distanceToMate",
        "distance_to_mate",
        "mateIn",
        "mate_in",
    ):
        value = item.get(key)
        if isinstance(value, int):
            return value
        if isinstance(value, str) and value.strip().isdigit():
            return int(value)

    return None


def square_sort_key(square_name: str):
    if not square_name:
        return (99, 99)
    sq = chess.parse_square(square_name)
    return (chess.square_rank(sq), chess.square_file(sq))


def make_record_sort_key(item):
    board = parse_board(item)
    mate_distance = get_mate_distance(item)

    bk = get_black_king_field(item)
    if not bk and board:
        bk = find_black_king_square(board)

    fen = get_fen(item) or ""

    if mate_distance is not None:
        return (0, mate_distance, square_sort_key(bk), fen)

    return (1, square_sort_key(bk), 999999, fen)


def sanitize_name(name: str):
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def add_unique_ids(items, tag):
    out = []
    for i, item in enumerate(items, 1):
        new_item = dict(item)
        new_item["id"] = f"{tag}_{i:05d}"
        out.append(new_item)
    return out


def filter_light(items):
    kept = []
    removed = 0

    for item in items:
        board = parse_board(item)
        if not board:
            continue

        bishop = find_white_bishop_square(board)
        if bishop is None:
            continue

        if is_light_square(bishop):
            kept.append(item)
        else:
            removed += 1

    return kept, removed


def process_file(path: Path, idx: int):
    data = load_json(path)
    items, shape = extract_items(data)
    if shape is None:
        return

    kept, removed = filter_light(items)
    sorted_items = sorted(kept, key=make_record_sort_key)

    tag = sanitize_name(path.stem)
    unique_items = add_unique_ids(sorted_items, tag)

    out = rebuild_same_shape(data, unique_items, shape)
    out_name = f"{idx:03d}_{tag}.json"
    save_json(OUTPUT_DIR / out_name, out)

    print(
        f"[DONE] {path.name} -> {out_name} | "
        f"total={len(items)} kept={len(unique_items)} removed_dark={removed}"
    )


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    files = sorted(INPUT_DIR.glob("*.json"))
    print(f"[START] {len(files)} files\n")

    for i, f in enumerate(files, 1):
        process_file(f, i)

    print("\n[FINISHED]")


if __name__ == "__main__":
    main()