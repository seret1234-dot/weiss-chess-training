import os
import json
import re
import random

INPUT_FOLDER = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4\5"
OUTPUT_FOLDER = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4\6"

MAX_KEEP_PER_FILE = 120   # keep moderate amount

random.seed(42)


def is_e7_e8(filename):
    return (
        "__bk_e7.json" in filename
        or "__bk_e8.json" in filename
    )


def normalize_fen(fen):
    parts = fen.split()
    return f"{parts[0]} {parts[1]}"


def reduce(data):
    seen = set()
    unique = []

    for pos in data:
        key = normalize_fen(pos["fen"])
        if key in seen:
            continue
        seen.add(key)
        unique.append(pos)

    random.shuffle(unique)
    return unique[:MAX_KEEP_PER_FILE]


def main():
    restored = 0

    for filename in os.listdir(INPUT_FOLDER):
        if not filename.endswith(".json"):
            continue
        if not is_e7_e8(filename):
            continue

        src = os.path.join(INPUT_FOLDER, filename)
        dst = os.path.join(OUTPUT_FOLDER, filename)

        with open(src, "r", encoding="utf-8") as f:
            data = json.load(f)

        reduced = reduce(data)

        with open(dst, "w", encoding="utf-8") as f:
            json.dump(reduced, f, indent=2)

        restored += len(reduced)
        print(f"[RESTORE] {filename}: {len(reduced)}")

    print("\nDONE")
    print("restored positions:", restored)


if __name__ == "__main__":
    main()