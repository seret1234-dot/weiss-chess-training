import json
import glob

files = glob.glob("*.json")

seen = set()
merged = []

for f in files:
    with open(f, "r") as fh:
        try:
            data = json.load(fh)
        except:
            continue

    for p in data:
        fen = p.get("fen")
        if fen and fen not in seen:
            seen.add(fen)
            merged.append(p)

print("Unique positions:", len(merged))

with open("bn_v1_merged.json", "w") as f:
    json.dump(merged, f, indent=2)