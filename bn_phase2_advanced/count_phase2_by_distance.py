import json
from pathlib import Path
import re

BASE = Path(r"C:\Users\Ariel\chess-trainer\bn_phase2_advanced")

pattern = re.compile(r"m(\d+)", re.IGNORECASE)

counts = {}

for file in BASE.glob("phase2_*.json"):
    name = file.stem.lower()

    m = pattern.search(name)
    if not m:
        continue

    dist = int(m.group(1))

    try:
        with open(file, "r", encoding="utf-8") as f:
            data = json.load(f)
            counts[dist] = counts.get(dist, 0) + len(data)
    except:
        pass

print("\nMate distance counts:\n")

for d in sorted(counts.keys(), reverse=True):
    print(f"Mate in {d}: {counts[d]}")

print("\nTotal:", sum(counts.values()))