import os
import re
import shutil

INPUT_FOLDER = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4\7"
OUTPUT_FOLDER = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4\8"

os.makedirs(OUTPUT_FOLDER, exist_ok=True)


def square_order(square: str):
    # a8 -> h8 first, then a7 -> h7, etc.
    file_idx = "abcdefgh".index(square[0])
    rank = int(square[1])
    return (-rank, file_idx)


def parse_filename(filename: str):
    """
    Accepts:
      mate_5__bk_a8_chunk_001.json
      no_mate__bk_e7_chunk_002.json
    """
    m = re.fullmatch(r"mate_(\d+)__bk_([a-h][1-8])_chunk_(\d+)\.json", filename)
    if m:
        return {
            "kind": "mate",
            "mate": int(m.group(1)),
            "bk": m.group(2),
            "chunk": int(m.group(3)),
            "filename": filename,
        }

    m = re.fullmatch(r"no_mate__bk_([a-h][1-8])_chunk_(\d+)\.json", filename)
    if m:
        return {
            "kind": "no_mate",
            "mate": None,
            "bk": m.group(1),
            "chunk": int(m.group(2)),
            "filename": filename,
        }

    return None


def sort_key(meta: dict):
    if meta["kind"] == "mate":
        return (0, meta["mate"], square_order(meta["bk"]), meta["chunk"], meta["filename"].lower())

    # no_mate goes after all mate files
    return (1, 999, square_order(meta["bk"]), meta["chunk"], meta["filename"].lower())


def main():
    parsed_files = []

    for filename in os.listdir(INPUT_FOLDER):
        meta = parse_filename(filename)
        if meta is not None:
            parsed_files.append(meta)

    parsed_files.sort(key=sort_key)

    total = 0

    for idx, meta in enumerate(parsed_files, start=1):
        src = os.path.join(INPUT_FOLDER, meta["filename"])

        if meta["kind"] == "mate":
            new_name = f"{idx:03d}_mate_{meta['mate']}__bk_{meta['bk']}.json"
        else:
            new_name = f"{idx:03d}_no_mate__bk_{meta['bk']}.json"

        dst = os.path.join(OUTPUT_FOLDER, new_name)
        shutil.copy2(src, dst)

        total += 1
        print(f"[COPY] {meta['filename']} -> {new_name}")

    print("\n=== FINISHED ===")
    print("read from:", INPUT_FOLDER)
    print("wrote to:", OUTPUT_FOLDER)
    print("files copied:", total)
    print("source files unchanged: YES")


if __name__ == "__main__":
    main()