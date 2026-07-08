import json
from pathlib import Path

INPUT_JSON = Path("anastasia_m2_all.json")
OUTPUT_JSON = Path("anastasia_m2_chunked.json")

CHUNK_SIZE = 30
MAX_CHUNKS = 50

with INPUT_JSON.open("r", encoding="utf-8") as f:
    data = json.load(f)

# sort easy → hard
data.sort(key=lambda x: x.get("rating", 0))

# keep max 50 chunks
data = data[: CHUNK_SIZE * MAX_CHUNKS]

chunked = []

for i, item in enumerate(data):
    chunked.append({
        "id": item["id"],
        "fen": item["fen"],
        "rating": item.get("rating", 0),
        "label": f"Anastasia Pattern {i+1}",
        "theme": "Anastasia Mate",
        "chunkNumber": (i // CHUNK_SIZE) + 1,
        "chunkIndex": i % CHUNK_SIZE,
        "solutionLine": item["solutionLine"],
        "userMoveIndexes": [0, 2]
    })

with OUTPUT_JSON.open("w", encoding="utf-8") as f:
    json.dump(chunked, f, indent=2)

print("Total puzzles:", len(chunked))
print("Chunks:", (len(chunked) + CHUNK_SIZE - 1) // CHUNK_SIZE)