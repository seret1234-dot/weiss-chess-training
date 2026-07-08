import json
from pathlib import Path

INPUT_FILE = "anastasia_m1_strict.json"
OUT_DIR = Path("public/data/lichess/mate_in_1/anastasia")

OUT_DIR.mkdir(parents=True, exist_ok=True)

with open(INPUT_FILE, "r", encoding="utf-8") as f:
    data = json.load(f)

chunks_map = {}
for puzzle in data:
    chunk_number = puzzle.get("chunkNumber", 1)
    chunks_map.setdefault(chunk_number, []).append(puzzle)

ordered_chunks = [chunks_map[k] for k in sorted(chunks_map.keys())]

manifest = {
    "category": "Mate in 1",
    "theme": "Anastasia",
    "totalChunks": len(ordered_chunks),
    "chunkSize": 30,
    "totalPuzzles": len(data),
    "files": [f"chunk_{i}.json" for i in range(len(ordered_chunks))]
}

with open(OUT_DIR / "manifest.json", "w", encoding="utf-8") as f:
    json.dump(manifest, f, indent=2)

for i, chunk in enumerate(ordered_chunks):
    with open(OUT_DIR / f"chunk_{i}.json", "w", encoding="utf-8") as f:
        json.dump({"puzzles": chunk}, f, indent=2)

print("DONE")
print("Total puzzles:", len(data))
print("Chunks:", len(ordered_chunks))
print("Saved in:", OUT_DIR)