# remove_dark_bishops_folder.py

from __future__ import annotations

import json
from pathlib import Path
import chess

FOLDER = Path(r"C:\Users\Ariel\chess-trainer\bn_manual_sets")

OVERWRITE = True  # True = overwrite files, False = create _light copies


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data):
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def is_light_square(square_name: str) -> bool:
    sq = chess.parse_square(square_name)
    return (chess.square_file(sq) + chess.square_rank(sq)) % 2 == 1


def process_file(path: Path):
    try:
        data = load_json(path)
    except Exception:
        print(f"[SKIP] {path.name} (read error)")
        return

    if not isinstance(data, list):
        print(f"[SKIP] {path.name} (not list)")
        return

    total = len(data)
    kept = []
    dark = 0

    for item in data:
        bishop = item.get("whiteBishop")
        if not bishop:
            continue

        if is_light_square(bishop):
            kept.append(item)
        else:
            dark += 1

    if OVERWRITE:
        save_json(path, kept)
        out_name = path.name
    else:
        out_path = path.with_name(path.stem + "_light.json")
        save_json(out_path, kept)
        out_name = out_path.name

    print(
        f"[DONE] {path.name} -> {out_name} | "
        f"total={total} kept={len(kept)} removed_dark={dark}"
    )


def main():
    files = sorted(FOLDER.glob("*.json"))
    print(f"[START] {len(files)} files\n")

    for f in files:
        process_file(f)

    print("\n[FINISHED]")


if __name__ == "__main__":
    main()