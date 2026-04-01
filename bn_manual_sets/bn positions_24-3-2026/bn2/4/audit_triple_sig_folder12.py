import glob
import json
import os

INPUT_FOLDER = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4\12"


def piece_signature(pos):
    return (
        pos.get("white_king"),
        pos.get("white_knight"),
        pos.get("white_bishop"),
    )


def change_signature(a, b):
    changed = []
    if a.get("white_king") != b.get("white_king"):
        changed.append("K")
    if a.get("white_knight") != b.get("white_knight"):
        changed.append("N")
    if a.get("white_bishop") != b.get("white_bishop"):
        changed.append("B")
    return tuple(changed)


def main():
    files = sorted(glob.glob(os.path.join(INPUT_FOLDER, "*.json")))

    total_triples = 0
    bad_files = 0

    for path in files:
        name = os.path.basename(path)

        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        sigs = []
        for i in range(1, len(data)):
            sigs.append(change_signature(data[i - 1], data[i]))

        triples = []
        for i in range(2, len(sigs)):
            if sigs[i] == sigs[i - 1] == sigs[i - 2]:
                triples.append((i - 1, i, i + 1, sigs[i]))

        if triples:
            bad_files += 1
            total_triples += len(triples)
            print(f"\n{name} | triple_sig_count={len(triples)}")
            for a, b, c, sig in triples:
                label = "+".join(sig) if sig else "NONE"
                print(f"  positions {a}, {b}, {c} -> {label}")

    print("\n=== TOTAL ===")
    print(f"files_checked: {len(files)}")
    print(f"bad_files: {bad_files}")
    print(f"total_triples: {total_triples}")


if __name__ == "__main__":
    main()