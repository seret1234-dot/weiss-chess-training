import os
import json
from collections import defaultdict

# -------- PATH --------
INPUT_FOLDER = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4"
OUTPUT_FOLDER = os.path.join(INPUT_FOLDER, "5")

os.makedirs(OUTPUT_FOLDER, exist_ok=True)

# -------- STORAGE --------
groups = defaultdict(list)

scanned = 0

# -------- HELPERS --------
def get_black_king_square(fen):
    # fen example: "8/8/8/8/8/8/8/k7 w - - 0 1"
    board = fen.split(" ")[0]
    ranks = board.split("/")
    for r_index, rank in enumerate(ranks):
        file_index = 0
        for char in rank:
            if char.isdigit():
                file_index += int(char)
            else:
                if char == "k":
                    file_letter = "abcdefgh"[file_index]
                    rank_number = 8 - r_index
                    return f"{file_letter}{rank_number}"
                file_index += 1
    return "unknown"

# -------- SCAN --------
for file in os.listdir(INPUT_FOLDER):
    if not file.endswith(".json"):
        continue

    path = os.path.join(INPUT_FOLDER, file)

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    for pos in data:
        scanned += 1

        fen = pos["fen"]
        bk = get_black_king_square(fen)

        mate = pos.get("mate")

        if mate is None:
            key = f"no_mate__bk_{bk}"
        else:
            key = f"mate_{mate}__bk_{bk}"

        groups[key].append(pos)

# -------- WRITE --------
written = 0

for key, positions in groups.items():
    out_path = os.path.join(OUTPUT_FOLDER, f"{key}.json")

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(positions, f)

    written += 1
    print(f"[WRITE] {key}: {len(positions)}")

print("\n=== FINISHED ===")
print("scanned:", scanned)
print("files written:", written)
print("output folder:", OUTPUT_FOLDER)