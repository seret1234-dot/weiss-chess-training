import os
import re
import json
from math import ceil

INPUT_FOLDER = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4\5"
OUTPUT_FOLDER = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4\6"
CHUNK_SIZE = 30

os.makedirs(OUTPUT_FOLDER, exist_ok=True)


def parse_filename(filename: str):
    """
    Accepts:
      mate_5__bk_a8.json
      no_mate__bk_f7.json
    Returns dict or None
    """
    if not filename.endswith(".json"):
        return None

    name = filename[:-5]

    m = re.fullmatch(r"mate_(\d+)__bk_([a-h][1-8])", name)
    if m:
        return {
            "kind": "mate",
            "mate": int(m.group(1)),
            "bk": m.group(2),
            "base": name,
        }

    m = re.fullmatch(r"no_mate__bk_([a-h][1-8])", name)
    if m:
        return {
            "kind": "no_mate",
            "mate": None,
            "bk": m.group(1),
            "base": name,
        }

    return None


def square_order(square: str):
    """
    Required order: a8 -> h8
    then a7 -> h7 ...
    """
    file_idx = "abcdefgh".index(square[0])
    rank = int(square[1])
    return (-rank, file_idx)


def file_sort_key(filename: str):
    meta = parse_filename(filename)
    if meta is None:
        return (2, 999, (99, 99), filename.lower())

    if meta["kind"] == "mate":
        return (0, meta["mate"], square_order(meta["bk"]), filename.lower())

    return (1, 999, square_order(meta["bk"]), filename.lower())


def chunked(items, size):
    for i in range(0, len(items), size):
        yield items[i:i + size]


def main():
    files = [f for f in os.listdir(INPUT_FOLDER) if f.endswith(".json")]
    files = [f for f in files if parse_filename(f) is not None]
    files.sort(key=file_sort_key)

    total_input_files = 0
    total_positions = 0
    total_chunks = 0

    for filename in files:
        meta = parse_filename(filename)
        src_path = os.path.join(INPUT_FOLDER, filename)

        with open(src_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        if not isinstance(data, list):
            print(f"[SKIP] {filename} (not a list)")
            continue

        total_input_files += 1
        total_positions += len(data)

        num_chunks = ceil(len(data) / CHUNK_SIZE) if data else 0
        print(f"[LOAD] {filename}: {len(data)} positions -> {num_chunks} chunk(s)")

        for idx, chunk in enumerate(chunked(data, CHUNK_SIZE), start=1):
            out_name = f"{meta['base']}_chunk_{idx:03d}.json"
            out_path = os.path.join(OUTPUT_FOLDER, out_name)

            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(chunk, f, ensure_ascii=False, indent=2)

            total_chunks += 1
            print(f"[WRITE] {out_name}: {len(chunk)}")

    print("\n=== FINISHED ===")
    print("read from:", INPUT_FOLDER)
    print("wrote to:", OUTPUT_FOLDER)
    print("input files:", total_input_files)
    print("positions:", total_positions)
    print("chunks written:", total_chunks)
    print("source files unchanged: YES")


if __name__ == "__main__":
    main()