import json
from pathlib import Path
from collections import defaultdict

# ===== PATHS =====
BASE = Path(r"C:\Users\Ariel\chess-trainer\bn_v1\bn_v2")
MAIN_FILE = BASE / "bn_v1_sorted.json"
CENTER_FILE = BASE / "bn_v1_center_300.json"
OUT_DIR = BASE / "by_mate_and_king"

OUT_DIR.mkdir(parents=True, exist_ok=True)


def load_json(path: Path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def safe_name(s: str) -> str:
    return str(s).replace("/", "_").replace("\\", "_").replace(" ", "_")


print("Loading main file...")
main_data = load_json(MAIN_FILE)

print("Loading center file...")
center_data = load_json(CENTER_FILE)

groups = defaultdict(list)

# group by mate distance + black king square
for item in main_data:
    mate = item.get("mateDistance", "unknown")
    bk = (
        item.get("blackKing")
        or item.get("bk")
        or item.get("king")
        or item.get("corner")
        or "unknown"
    )

    key = (mate, bk)
    groups[key].append(item)

written = 0

# write grouped files
for (mate, bk), items in sorted(
    groups.items(),
    key=lambda x: (
        999 if x[0][0] == "unknown" else int(x[0][0]),
        str(x[0][1]),
    ),
):
    filename = f"m{mate}_bk_{safe_name(bk)}.json"
    out_path = OUT_DIR / filename

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(items, f, indent=2)

    print(f"{filename}: {len(items)}")
    written += 1


# write center positions separately
center_out = OUT_DIR / "phase1_center.json"
with open(center_out, "w", encoding="utf-8") as f:
    json.dump(center_data, f, indent=2)

print("\nDone")
print(f"Wrote {written} mate+king files")
print(f"Wrote phase1 center file: {len(center_data)} positions")
print(f"Output folder: {OUT_DIR}")