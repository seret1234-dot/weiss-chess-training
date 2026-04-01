import json
import os
from pathlib import Path

BASE_DIR = Path(r"C:\Users\Ariel\chess-trainer\bn_manual_sets")
SOURCE_DIR = BASE_DIR / "cleaned_a8_light_sorted" / "final_unique_sorted" / "bn_final_sorted_chunks_v4"
OUTPUT_DIR = BASE_DIR / "pooled_mate_themesource"

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

pooled = {}

for file in SOURCE_DIR.glob("*.json"):
    data = load_json(file)

    for pos in data:
        mate = pos.get("mate_distance")
        if mate is None:
            continue

        key = f"mate_{mate}"

        if key not in pooled:
            pooled[key] = []

        pooled[key].append(pos)

for mate_key, positions in pooled.items():
    print(f"{mate_key}: {len(positions)} positions")

    out_file = OUTPUT_DIR / f"{mate_key}.json"
    save_json(out_file, positions)

print("DONE")