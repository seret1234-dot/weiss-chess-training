# clean_sort_bn_a8_light.py
# Cleans BN files:
# - keeps only mate/corner a8
# - removes dark-squared bishops
# - sorts by mate distance if present
# - writes cleaned copies to output folder

from __future__ import annotations

import json
from pathlib import Path
import chess

INPUT_DIR = Path(r"C:\Users\Ariel\chess-trainer\bn_manual_sets")
OUTPUT_DIR = INPUT_DIR / "cleaned_a8_light_sorted"

SKIP_EMPTY_FILES = False


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
        if isinstance(data.get("positions"), list):
            return data["positions"], "positions"
        if isinstance(data.get("items"), list):
            return data["items"], "items"
        if isinstance(data.get("puzzles"), list):
            return data["puzzles"], "puzzles"

    return [], None


def rebuild_same_shape(original_data, kept_items, shape_kind):
    if shape_kind == "list":
        return kept_items

    if isinstance(original_data, dict):
        new_data = dict(original_data)
        if shape_kind == "positions":
            new_data["positions"] = kept_items
        elif shape_kind == "items":
            new_data["items"] = kept_items
        elif shape_kind == "puzzles":
            new_data["puzzles"] = kept_items
        return new_data

    return kept_items


def get_fen(item):
    return item.get("startFen") or item.get("fen")


def parse_board_from_item(item):
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


def is_light_square(square: int) -> bool:
    return (chess.square_file(square) + chess.square_rank(square)) % 2 == 1


def mate_corner_is_a8(item):
    # Accept several possible field names
    candidates = [
        item.get("corner"),
        item.get("mateCorner"),
        item.get("mate_corner"),
        item.get("targetCorner"),
        item.get("target_corner"),
    ]

    for value in candidates:
        if isinstance(value, str) and value.strip().lower() == "a8":
            return True

    return False


def get_mate_distance(item):
    # Try common field names
    keys = [
        "mateDistance",
        "mate_distance",
        "dtm",
        "distanceToMate",
        "distance_to_mate",
        "mateIn",
        "mate_in",
    ]

    for key in keys:
        value = item.get(key)
        if isinstance(value, int):
            return value
        if isinstance(value, str):
            try:
                return int(value.strip())
            except Exception:
                pass

    return None


def sort_items(items):
    def key_fn(item):
        md = get_mate_distance(item)
        fen = get_fen(item) or ""
        return (md is None, md if md is not None else 999999, fen)

    return sorted(items, key=key_fn)


def process_file(path: Path):
    try:
        data = load_json(path)
    except Exception as e:
        print(f"[ERROR] Could not read {path.name}: {e}")
        return

    items, shape_kind = extract_items(data)
    if shape_kind is None:
        print(f"[SKIP] {path.name}: no list/positions/items/puzzles found")
        return

    total = len(items)
    kept = []
    skipped_no_a8 = 0
    skipped_bad_fen = 0
    skipped_no_bishop = 0
    skipped_dark_bishop = 0

    for item in items:
        if not isinstance(item, dict):
            continue

        if not mate_corner_is_a8(item):
            skipped_no_a8 += 1
            continue

        board = parse_board_from_item(item)
        if board is None:
            skipped_bad_fen += 1
            continue

        bishop_sq = find_white_bishop_square(board)
        if bishop_sq is None:
            skipped_no_bishop += 1
            continue

        if not is_light_square(bishop_sq):
            skipped_dark_bishop += 1
            continue

        kept.append(item)

    kept = sort_items(kept)

    if SKIP_EMPTY_FILES and not kept:
        print(f"[EMPTY-SKIP] {path.name}")
        return

    out_data = rebuild_same_shape(data, kept, shape_kind)
    out_path = OUTPUT_DIR / path.name
    save_json(out_path, out_data)

    print(
        f"[DONE] {path.name} | total={total} kept={len(kept)} "
        f"no_a8={skipped_no_a8} bad_fen={skipped_bad_fen} "
        f"no_bishop={skipped_no_bishop} dark_bishop={skipped_dark_bishop}"
    )


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    json_files = sorted(INPUT_DIR.glob("*.json"))
    if not json_files:
        print(f"[STOP] No JSON files found in {INPUT_DIR}")
        return

    print(f"[START] Found {len(json_files)} JSON files")
    print(f"[OUT] {OUTPUT_DIR}")
    print()

    for path in json_files:
        process_file(path)

    print()
    print("[FINISHED]")


if __name__ == "__main__":
    main()