import json
from pathlib import Path

PROGRESSION_PATH = Path(r"C:\Users\Ariel\chess-trainer\public\data\lichess\bn_v3\bn_v3_progression.json")
CHUNKS_DIR = Path(r"C:\Users\Ariel\chess-trainer\public\data\lichess\bn_v3\chunks")

if not PROGRESSION_PATH.exists():
    raise FileNotFoundError(f"Progression file not found: {PROGRESSION_PATH}")

if not CHUNKS_DIR.exists():
    raise FileNotFoundError(f"Chunks dir not found: {CHUNKS_DIR}")

with open(PROGRESSION_PATH, "r", encoding="utf-8") as f:
    progression = json.load(f)

all_chunk_files = sorted(p.name for p in CHUNKS_DIR.glob("*.json"))

def files_for_prefix(prefix: str):
    return [name for name in all_chunk_files if name.startswith(prefix + "_chunk_")]

themes = progression.get("themes", {})

for theme_id, theme_data in themes.items():
    matched = files_for_prefix(theme_id)
    if matched:
        theme_data["chunkFiles"] = matched
        if "chunks" in theme_data:
            del theme_data["chunks"]
        print(f"[UPDATED] {theme_id}: {len(matched)} chunk files")
    else:
        print(f"[NO FILES FOUND] {theme_id}")

with open(PROGRESSION_PATH, "w", encoding="utf-8") as f:
    json.dump(progression, f, indent=2, ensure_ascii=False)

print()
print("Done. Progression file updated.")