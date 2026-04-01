import glob
import json
import os

INPUT_FOLDER = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4\10"

def main():
    files = sorted(glob.glob(os.path.join(INPUT_FOLDER, "*.json")))
    total_positions = 0
    total_missing_fen = 0

    for path in files:
        name = os.path.basename(path)

        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        missing = 0
        for pos in data:
            if not pos.get("fen"):
                missing += 1

        total_positions += len(data)
        total_missing_fen += missing

        if missing > 0:
            print(f"{name}: positions={len(data)} missing_fen={missing}")

    print("\n=== TOTAL ===")
    print(f"files: {len(files)}")
    print(f"positions: {total_positions}")
    print(f"missing_fen: {total_missing_fen}")

if __name__ == "__main__":
    main()