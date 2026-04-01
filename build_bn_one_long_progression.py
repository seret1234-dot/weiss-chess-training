# build_bn_one_long_progression.py

from __future__ import annotations

import json
from pathlib import Path
import re

BASE_DIR = Path(r"C:\Users\Ariel\chess-trainer\bn_manual_sets\cleaned_a8_light_sorted\final_unique_sorted")
OUTPUT_DIR = BASE_DIR / "bn_one_long_progression"

CHUNK_SIZE = 30
TRAINER_NAME = "BN One Long Progression"
BASE_PATH = "bn_one_long_progression"

# Order you want:
# first mate themes, then phase2 king-position themes
ORDER = [
    "mate_1",
    "mate_2",
    "mate_3",
    "mate_4",
    "mate_5",
    "mate_6",
    "mate_7",
    "mate_8",
    "mate_9",
    "mate_10",
    "mate_11",
    "mate_12",
    "mate_13",
    "mate_14",
    "mate_15",
    "mate_16",
    "mate_17",
    "mate_18",
    "mate_19",
    "mate_20",
    "phase2_e8",
    "phase2_e7",
    "phase2_f8",
    "phase2_f7",
    "phase2_g8",
    "phase2_h8",
]

# Map your existing files into themes
# Remove entries for files you don't have
FILE_THEME_MAP = {
    "006_bn_typical_bk_e8_light_typical_strict.json": "phase2_e8",
    "005_bn_typical_bk_e7_light_typical_strict.json": "phase2_e7",
    "bn_phase2_typical_f8.json": "phase2_f8",
    "bn_phase2_typical_f7.json": "phase2_f7",
    "bn_phase2_typical_g8.json": "phase2_g8",
    "bn_phase2_typical_h8.json": "phase2_h8",

    # Add mate files here if they exist in the folder
    # Example:
    # "mate_1_light.json": "mate_1",
    # "mate_2_light.json": "mate_2",
}


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


def sort_items(items):
    def key_fn(item):
        md = get_mate_distance(item)
        fen = get_fen(item) or ""
        return (md is None, md if md is not None else 999999, fen)
    return sorted(items, key=key_fn)


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


def chunk_list(lst, size):
    for i in range(0, len(lst), size):
        yield lst[i:i + size]


def theme_label(theme_name: str):
    return theme_name.replace("_", " ").title()


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    theme_to_items = {}

    # Load files that exist
    for filename, theme in FILE_THEME_MAP.items():
        path = BASE_DIR / filename
        if not path.exists():
            print(f"[MISSING] {filename}")
            continue

        try:
            data = load_json(path)
            items = extract_items(data)
            items = dedupe_by_fen(items)
            items = sort_items(items)

            # give each record a clean theme tag
            normalized = []
            for i, item in enumerate(items, start=1):
                new_item = dict(item)
                new_item["theme"] = theme
                new_item["id"] = f"{theme}_{i:05d}"
                normalized.append(new_item)

            theme_to_items[theme] = normalized
            print(f"[LOAD] {filename} -> {theme}: {len(normalized)}")
        except Exception as e:
            print(f"[ERROR] {filename}: {e}")

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

    for theme in ORDER:
        items = theme_to_items.get(theme, [])
        if not items:
            continue

        chunk_files = []
        for idx, chunk in enumerate(chunk_list(items, CHUNK_SIZE), start=1):
            filename = f"{theme}_chunk_{idx:03d}.json"
            out_path = OUTPUT_DIR / filename

            payload = {
                "theme": theme,
                "count": len(chunk),
                "positions": chunk
            }

            save_json(out_path, payload)
            chunk_files.append(filename)
            total_positions += len(chunk)
            total_chunks += 1

        progression["order"].append(theme)
        progression["themes"][theme] = {
            "chunkFiles": chunk_files,
            "label": theme_label(theme)
        }

        last_chunk_size = len(items) % CHUNK_SIZE
        if last_chunk_size == 0:
            last_chunk_size = CHUNK_SIZE

        print(
            f"[WRITE] {theme}: {len(items)} positions -> "
            f"{len(chunk_files)} chunks | last chunk = {last_chunk_size}"
        )

    save_json(OUTPUT_DIR / "progression.json", progression)

    print()
    print("=== FINISHED ===")
    print(f"Total positions: {total_positions}")
    print(f"Total chunks: {total_chunks}")
    print(f"Output folder: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()