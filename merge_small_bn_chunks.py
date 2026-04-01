# merge_small_bn_chunks.py

from __future__ import annotations

import json
from pathlib import Path

INPUT_DIR = Path(r"C:\Users\Ariel\chess-trainer\bn_manual_sets\cleaned_a8_light_sorted\final_unique_sorted\bn_final_sorted_chunks_v3")
OUTPUT_DIR = INPUT_DIR.parent / "bn_final_sorted_chunks_v4"

MAX_CHUNK_SIZE = 30
MERGE_SMALLER_THAN = 12


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def main():
    progression_path = INPUT_DIR / "progression.json"
    if not progression_path.exists():
        print(f"[STOP] Missing progression.json in {INPUT_DIR}")
        return

    progression = load_json(progression_path)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    new_progression = {
        "name": progression.get("name", "BN Final Sorted v4"),
        "chunkSize": progression.get("chunkSize", MAX_CHUNK_SIZE),
        "basePath": "bn_final_sorted_chunks_v4",
        "masteryFastSolves": progression.get("masteryFastSolves", 30),
        "maxSecondsPerMove": progression.get("maxSecondsPerMove", 3),
        "order": list(progression.get("order", [])),
        "themes": {}
    }

    total_old_chunks = 0
    total_new_chunks = 0
    total_positions = 0

    for theme in progression.get("order", []):
        theme_info = progression["themes"].get(theme)
        if not theme_info:
            continue

        chunk_files = theme_info.get("chunkFiles", [])
        old_chunks = []

        for filename in chunk_files:
            path = INPUT_DIR / filename
            if not path.exists():
                print(f"[MISSING] {filename}")
                continue

            data = load_json(path)
            positions = data.get("positions", [])
            old_chunks.append({
                "theme": data.get("theme", theme),
                "positions": positions,
            })

        total_old_chunks += len(old_chunks)

        merged_chunks = []
        i = 0
        while i < len(old_chunks):
            current = list(old_chunks[i]["positions"])

            # merge forward while current is small
            j = i + 1
            while (
                len(current) < MERGE_SMALLER_THAN
                and j < len(old_chunks)
                and len(current) + len(old_chunks[j]["positions"]) <= MAX_CHUNK_SIZE
            ):
                current.extend(old_chunks[j]["positions"])
                j += 1

            merged_chunks.append(current)
            i = j

        new_chunk_files = []
        for idx, positions in enumerate(merged_chunks, start=1):
            filename = f"{theme}_chunk_{idx:03d}.json"
            payload = {
                "theme": theme,
                "count": len(positions),
                "positions": positions,
            }
            save_json(OUTPUT_DIR / filename, payload)
            new_chunk_files.append(filename)
            total_positions += len(positions)

        new_progression["themes"][theme] = {
            "chunkFiles": new_chunk_files,
            "label": theme_info.get("label", theme),
        }

        total_new_chunks += len(new_chunk_files)

        sizes_old = [len(c["positions"]) for c in old_chunks]
        sizes_new = [len(c) for c in merged_chunks]

        print(
            f"[THEME] {theme} | old_chunks={len(old_chunks)} new_chunks={len(new_chunk_files)} "
            f"| old_sizes={sizes_old} | new_sizes={sizes_new}"
        )

    save_json(OUTPUT_DIR / "progression.json", new_progression)

    print()
    print("=== FINISHED ===")
    print(f"Old chunks: {total_old_chunks}")
    print(f"New chunks: {total_new_chunks}")
    print(f"Total positions: {total_positions}")
    print(f"Output folder: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()