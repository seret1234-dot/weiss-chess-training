import json
import glob
import os
from collections import Counter

INPUT_FOLDER = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4\10"
OUTPUT_FOLDER = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4\11"

os.makedirs(OUTPUT_FOLDER, exist_ok=True)


def piece_signature(pos):
    return (
        pos["white_king"],
        pos["white_knight"],
        pos["white_bishop"],
    )


def changed_pieces(prev, cur):
    changes = []

    if prev["white_king"] != cur["white_king"]:
        changes.append("K")

    if prev["white_knight"] != cur["white_knight"]:
        changes.append("N")

    if prev["white_bishop"] != cur["white_bishop"]:
        changes.append("B")

    return tuple(sorted(changes))


def process_file(path):
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    if not data:
        return []

    kept = [data[0]]
    change_history = []

    for pos in data[1:]:
        prev = kept[-1]
        change = changed_pieces(prev, pos)

        # rule 1: at least 2 pieces change
        if len(change) < 2:
            continue

        # rule 2: avoid same pair 3 times in a row
        if len(change_history) >= 2:
            if change == change_history[-1] == change_history[-2]:
                continue

        kept.append(pos)
        change_history.append(change)

    return kept


def main():
    files = sorted(glob.glob(os.path.join(INPUT_FOLDER, "*.json")))

    grand = Counter()

    for path in files:
        name = os.path.basename(path)

        with open(path, "r", encoding="utf-8") as f:
            original = json.load(f)

        filtered = process_file(path)

        out_path = os.path.join(OUTPUT_FOLDER, name)

        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(filtered, f, indent=2, ensure_ascii=False)

        print(f"{name}")
        print(f"  input: {len(original)}")
        print(f"  kept:  {len(filtered)}")
        print(f"  removed: {len(original) - len(filtered)}")

        grand["files"] += 1
        grand["input"] += len(original)
        grand["kept"] += len(filtered)
        grand["removed"] += len(original) - len(filtered)

    print("\n=== GRAND TOTAL ===")
    for k, v in grand.items():
        print(f"{k}: {v}")


if __name__ == "__main__":
    main()