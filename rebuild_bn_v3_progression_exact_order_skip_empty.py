import os
import json
import re

CHUNKS_DIR = r"C:\Users\Ariel\chess-trainer\public\data\lichess\bn_v3\chunks"
OUTPUT_FILE = r"C:\Users\Ariel\chess-trainer\public\data\lichess\bn_v3\bn_v3_progression.json"


def file_number(name: str) -> int:
    m = re.match(r"^(\d{3})_", name)
    if not m:
        return 999999
    return int(m.group(1))


def theme_key_from_filename(name: str) -> str:
    return name[:-5] if name.lower().endswith(".json") else name


def label_from_filename(name: str) -> str:
    base = theme_key_from_filename(name)
    return base.replace("__", " | ").replace("_", " ")


def is_non_empty_json(path: str) -> bool:
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return isinstance(data, list) and len(data) > 0
    except Exception:
        return False


def main():
    files = [f for f in os.listdir(CHUNKS_DIR) if f.lower().endswith(".json")]
    files.sort(key=lambda x: (file_number(x), x.lower()))

    kept_files = []
    skipped_files = []

    for f in files:
        full_path = os.path.join(CHUNKS_DIR, f)
        if is_non_empty_json(full_path):
            kept_files.append(f)
        else:
            skipped_files.append(f)

    order = []
    themes = {}

    for f in kept_files:
        key = theme_key_from_filename(f)
        order.append(key)
        themes[key] = {
            "label": label_from_filename(f),
            "goal": "checkmate",
            "chunkFiles": [f]
        }

    progression = {
        "name": "Bishop + Knight Mate Trainer v3",
        "basePath": "chunks",
        "masteryFastSolves": 30,
        "maxSecondsPerMove": 3,
        "order": order,
        "themes": themes
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(progression, f, indent=2, ensure_ascii=False)

    print("DONE")
    print("kept themes:", len(order))
    print("kept files:", len(kept_files))
    print("skipped empty/bad files:", len(skipped_files))
    for f in skipped_files:
        print("SKIPPED:", f)


if __name__ == "__main__":
    main()