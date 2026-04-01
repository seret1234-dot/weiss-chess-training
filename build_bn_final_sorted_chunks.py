# build_bn_final_sorted_chunks.py

from __future__ import annotations

import json
from pathlib import Path
from collections import defaultdict
import re

INPUT_DIR = Path(r"C:\Users\Ariel\chess-trainer\bn_manual_sets\cleaned_a8_light_sorted\final_unique_sorted")
OUTPUT_DIR = INPUT_DIR / "bn_final_sorted_chunks"

CHUNK_SIZE = 30
TRAINER_NAME = "BN Final Sorted"
BASE_PATH = "bn_final_sorted_chunks"


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def extract_items(data):
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        for key in ("positions", "items", "puzzles"):
            if isinstance(data.get(key), list):
                return data[key]
    return []


def get_fen(item):
    return item.get("startFen") or item.get("fen")


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
        if isinstance(value, str):
            value = value.strip()
            if re.fullmatch(r"-?\d+", value):
                return int(value)
    return None


def get_black_king(item):
    for key in ("blackKing", "bk"):
        value = item.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip().lower()
    return ""


def dedupe_by_fen(items):
    seen = set()
    out = []
    for item in items:
        fen = get_fen(item)
        if not fen:
            continue
        if fen in seen:
            continue
        seen.add(fen)
        out.append(item)
    return out


def file_rank(square_name: str):
    # d-file to h-file requested
    if not square_name:
        return (99, 99)
    file_char = square_name[0].lower()
    rank_char = square_name[1] if len(square_name) > 1 else "9"
    file_order = {"d": 0, "e": 1, "f": 2, "g": 3, "h": 4}
    return (file_order.get(file_char, 99), int(rank_char) if rank_char.isdigit() else 99)


def sort_within_mate_group(items):
    return sorted(
        items,
        key=lambda x: (
            get_black_king(x),
            get_fen(x) or ""
        )
    )


def sort_within_king_group(items):
    return sorted(
        items,
        key=lambda x: (
            get_fen(x) or ""
        )
    )


def chunk_list(lst, size):
    for i in range(0, len(lst), size):
        yield lst[i:i + size]


def safe_name(name: str):
    return re.sub(r"[^a-zA-Z0-9_]+", "_", name).strip("_").lower()


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    files = sorted(INPUT_DIR.glob("*.json"))
    if not files:
        print(f"[STOP] No JSON files found in {INPUT_DIR}")
        return

    all_items = []
    for path in files:
        try:
            data = load_json(path)
            items = extract_items(data)
            count = 0
            for item in items:
                if not isinstance(item, dict):
                    continue
                fen = get_fen(item)
                if not fen:
                    continue
                new_item = dict(item)
                new_item["sourceFile"] = path.name
                all_items.append(new_item)
                count += 1
            print(f"[LOAD] {path.name}: {count}")
        except Exception as e:
            print(f"[ERROR] {path.name}: {e}")

    all_items = dedupe_by_fen(all_items)
    print(f"[INFO] Deduped total: {len(all_items)}")

    mate_groups = defaultdict(list)
    king_groups = defaultdict(list)

    for item in all_items:
        md = get_mate_distance(item)
        if md is not None:
            mate_groups[md].append(item)
        else:
            bk = get_black_king(item)
            # only d to h requested
            if bk and bk[0] in "defgh":
                king_groups[bk].append(item)

    progression = {
        "name": TRAINER_NAME,
        "chunkSize": CHUNK_SIZE,
        "basePath": BASE_PATH,
        "masteryFastSolves": 30,
        "maxSecondsPerMove": 3,
        "order": [],
        "themes": {}
    }

    total_positions = 0
    total_chunks = 0

    # 1) mate groups first
    for md in sorted(mate_groups.keys()):
        items = sort_within_mate_group(mate_groups[md])
        theme = f"mate_{md}"
        chunk_files = []

        # re-id within theme
        normalized = []
        for i, item in enumerate(items, start=1):
            x = dict(item)
            x["theme"] = theme
            x["id"] = f"{theme}_{i:05d}"
            normalized.append(x)

        for idx, chunk in enumerate(chunk_list(normalized, CHUNK_SIZE), start=1):
            filename = f"{theme}_chunk_{idx:03d}.json"
            payload = {
                "theme": theme,
                "count": len(chunk),
                "positions": chunk
            }
            save_json(OUTPUT_DIR / filename, payload)
            chunk_files.append(filename)
            total_positions += len(chunk)
            total_chunks += 1

        progression["order"].append(theme)
        progression["themes"][theme] = {
            "chunkFiles": chunk_files,
            "label": f"Mate in {md}"
        }

        last_chunk = len(items) % CHUNK_SIZE
        if last_chunk == 0:
            last_chunk = CHUNK_SIZE
        print(f"[WRITE] {theme}: {len(items)} positions -> {len(chunk_files)} chunks | last={last_chunk}")

    # 2) then king-position groups d to h
    for bk in sorted(king_groups.keys(), key=file_rank):
        items = sort_within_king_group(king_groups[bk])
        theme = f"bk_{bk}"
        chunk_files = []

        normalized = []
        for i, item in enumerate(items, start=1):
            x = dict(item)
            x["theme"] = theme
            x["id"] = f"{theme}_{i:05d}"
            normalized.append(x)

        for idx, chunk in enumerate(chunk_list(normalized, CHUNK_SIZE), start=1):
            filename = f"{theme}_chunk_{idx:03d}.json"
            payload = {
                "theme": theme,
                "count": len(chunk),
                "positions": chunk
            }
            save_json(OUTPUT_DIR / filename, payload)
            chunk_files.append(filename)
            total_positions += len(chunk)
            total_chunks += 1

        progression["order"].append(theme)
        progression["themes"][theme] = {
            "chunkFiles": chunk_files,
            "label": f"Black king {bk}"
        }

        last_chunk = len(items) % CHUNK_SIZE
        if last_chunk == 0:
            last_chunk = CHUNK_SIZE
        print(f"[WRITE] {theme}: {len(items)} positions -> {len(chunk_files)} chunks | last={last_chunk}")

    save_json(OUTPUT_DIR / "progression.json", progression)

    print()
    print("=== FINISHED ===")
    print(f"Total positions written: {total_positions}")
    print(f"Total chunks written: {total_chunks}")
    print(f"Output folder: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()