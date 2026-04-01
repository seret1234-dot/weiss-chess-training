# build_bn_final_sorted_chunks_v3.py

from __future__ import annotations

import json
from pathlib import Path
from collections import defaultdict
import re

INPUT_DIR = Path(r"C:\Users\Ariel\chess-trainer\bn_manual_sets\cleaned_a8_light_sorted\final_unique_sorted")
OUTPUT_DIR = INPUT_DIR / "bn_final_sorted_chunks_v3"

CHUNK_SIZE = 30
TRAINER_NAME = "BN Final Sorted v3"
BASE_PATH = "bn_final_sorted_chunks_v3"


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


def has_mate_distance(item):
    return get_mate_distance(item) is not None


def get_black_king(item):
    for key in ("blackKing", "bk"):
        value = item.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip().lower()
    return ""


def safe_name(name: str):
    return re.sub(r"[^a-zA-Z0-9_]+", "_", name).strip("_").lower()


def source_family(path_name: str):
    stem = Path(path_name).stem
    stem = re.sub(r"^\d+_", "", stem)   # remove prefix like 007_
    stem = re.sub(r"_md$", "", stem)    # remove _md suffix
    return safe_name(stem)


def dedupe_by_fen_prefer_mate(items):
    best = {}

    for item in items:
        fen = get_fen(item)
        if not fen:
            continue

        if fen not in best:
            best[fen] = item
            continue

        old_item = best[fen]

        old_has_md = has_mate_distance(old_item)
        new_has_md = has_mate_distance(item)

        # prefer record with mate distance
        if new_has_md and not old_has_md:
            best[fen] = item
            continue

        # if both have mate distance, keep the newer one
        if new_has_md and old_has_md:
            best[fen] = item
            continue

        # otherwise keep the first one

    return list(best.values())


def file_rank(square_name: str):
    if not square_name:
        return (99, 99)
    file_char = square_name[0].lower()
    rank_char = square_name[1] if len(square_name) > 1 else "9"
    file_order = {"d": 0, "e": 1, "f": 2, "g": 3, "h": 4}
    return (file_order.get(file_char, 99), int(rank_char) if rank_char.isdigit() else 99)


def sort_within_group(items):
    return sorted(
        items,
        key=lambda x: (
            get_black_king(x),
            get_fen(x) or ""
        )
    )


def chunk_list(lst, size):
    for i in range(0, len(lst), size):
        yield lst[i:i + size]


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
                new_item["_sourceFile"] = path.name
                new_item["_sourceFamily"] = source_family(path.name)
                all_items.append(new_item)
                count += 1

            print(f"[LOAD] {path.name}: {count}")
        except Exception as e:
            print(f"[ERROR] {path.name}: {e}")

    all_items = dedupe_by_fen_prefer_mate(all_items)
    print(f"[INFO] Deduped total: {len(all_items)}")

    # Grouping:
    # if mateDistance exists -> group by (mateDistance, sourceFamily)
    # else -> group by blackKing
    mate_groups = defaultdict(list)
    king_groups = defaultdict(list)

    for item in all_items:
        md = get_mate_distance(item)

        if md is not None:
            fam = item.get("_sourceFamily", "unknown")
            mate_groups[(md, fam)].append(item)
        else:
            bk = get_black_king(item)
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
    mate_keys = sorted(mate_groups.keys(), key=lambda x: (x[0], x[1]))

    for md, fam in mate_keys:
        items = sort_within_group(mate_groups[(md, fam)])
        theme = f"mate_{md}_{fam}"
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
            "label": f"Mate in {md} - {fam}"
        }

        last_chunk = len(items) % CHUNK_SIZE
        if last_chunk == 0:
            last_chunk = CHUNK_SIZE

        print(
            f"[WRITE] {theme}: {len(items)} positions -> "
            f"{len(chunk_files)} chunks | last={last_chunk}"
        )

    # 2) then king groups
    for bk in sorted(king_groups.keys(), key=file_rank):
        items = sort_within_group(king_groups[bk])
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

        print(
            f"[WRITE] {theme}: {len(items)} positions -> "
            f"{len(chunk_files)} chunks | last={last_chunk}"
        )

    save_json(OUTPUT_DIR / "progression.json", progression)

    print()
    print("=== FINISHED ===")
    print(f"Total positions written: {total_positions}")
    print(f"Total chunks written: {total_chunks}")
    print(f"Output folder: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()