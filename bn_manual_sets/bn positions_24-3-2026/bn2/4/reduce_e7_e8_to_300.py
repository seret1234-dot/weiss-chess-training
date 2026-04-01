import json
import random
from pathlib import Path

INPUT_FILES = [
    "bn_typical_bk_e7_light.json",
    "bn_typical_bk_e8_light.json",
]

TARGET_SIZE = 300
RANDOM_SEED = 42


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def position_key(pos):
    if isinstance(pos, dict):
        if "fen" in pos:
            return pos["fen"]
        if "startFen" in pos:
            return pos["startFen"]
        return json.dumps(pos, sort_keys=True, ensure_ascii=False)
    return json.dumps(pos, sort_keys=True, ensure_ascii=False)


def unique_positions(data):
    seen = set()
    out = []
    for pos in data:
        k = position_key(pos)
        if k in seen:
            continue
        seen.add(k)
        out.append(pos)
    return out


def main():
    random.seed(RANDOM_SEED)
    base = Path(".")

    for name in INPUT_FILES:
        path = base / name
        data = load_json(path)
        print(f"[LOAD] {name}: {len(data)}")

        data = unique_positions(data)
        print(f"[UNIQUE] {name}: {len(data)}")

        random.shuffle(data)
        reduced = data[:TARGET_SIZE]

        out_name = path.stem + "_300.json"
        save_json(base / out_name, reduced)
        print(f"[WRITE] {out_name}: {len(reduced)}")

    print("=== FINISHED ===")


if __name__ == "__main__":
    main()