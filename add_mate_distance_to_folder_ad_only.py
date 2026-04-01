# add_mate_distance_to_folder_ad_only.py

from __future__ import annotations

import json
from pathlib import Path
import chess
import chess.engine

FOLDER = Path(r"C:\Users\Ariel\chess-trainer\bn_manual_sets\cleaned_a8_light_sorted\final_unique_sorted")

ENGINE_PATH = r"C:\Users\Ariel\chess-trainer\stockfish-windows-x86-64-avx2\stockfish\stockfish-windows-x86-64-avx2.exe"

# Analysis settings
SEARCH_TIME_SEC = 0.20
SEARCH_DEPTH = None   # set to int like 18 if you want depth instead of time

WRITE_ONLY_IF_ANY_MATE_FOUND = True
OUTPUT_SUFFIX = "_md"


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data):
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def extract_items(data):
    if isinstance(data, list):
        return data, "list"

    if isinstance(data, dict):
        for key in ("positions", "items", "puzzles"):
            if isinstance(data.get(key), list):
                return data[key], key

    return [], None


def rebuild_same_shape(original_data, new_items, shape_kind):
    if shape_kind == "list":
        return new_items

    if isinstance(original_data, dict):
        out = dict(original_data)
        out[shape_kind] = new_items
        return out

    return new_items


def get_fen(item):
    return item.get("startFen") or item.get("fen")


def get_limit():
    if SEARCH_DEPTH is not None:
        return chess.engine.Limit(depth=SEARCH_DEPTH)
    return chess.engine.Limit(time=SEARCH_TIME_SEC)


def black_king_is_on_a_to_d(board: chess.Board) -> bool:
    bk = board.king(chess.BLACK)
    if bk is None:
        return False
    file_idx = chess.square_file(bk)  # a=0, b=1, c=2, d=3
    return file_idx <= 3


def analyze_mate_distance(engine: chess.engine.SimpleEngine, fen: str):
    try:
        board = chess.Board(fen)
    except Exception:
        return None, "bad_fen"

    if not black_king_is_on_a_to_d(board):
        return None, "skip_file"

    try:
        info = engine.analyse(board, get_limit())
    except Exception:
        return None, "engine_fail"

    score = info.get("score")
    if score is None:
        return None, "no_score"

    rel = score.relative
    mate = rel.mate()

    if mate is None:
        return None, "no_mate"

    return {
        "mateScore": mate,
        "mateDistance": abs(mate),
    }, "ok"


def process_file(engine: chess.engine.SimpleEngine, path: Path):
    try:
        data = load_json(path)
    except Exception as e:
        print(f"[READ-ERROR] {path.name}: {e}")
        return

    items, shape_kind = extract_items(data)
    if shape_kind is None:
        print(f"[SKIP] {path.name}: unsupported JSON structure")
        return

    total = len(items)
    scanned = 0
    skipped_outside_ad = 0
    mates_found = 0
    bad_fen = 0

    new_items = []

    for item in items:
        if not isinstance(item, dict):
            new_items.append(item)
            continue

        new_item = dict(item)
        fen = get_fen(new_item)

        if not fen:
            bad_fen += 1
            new_items.append(new_item)
            continue

        result, status = analyze_mate_distance(engine, fen)

        if status == "bad_fen":
            bad_fen += 1
        elif status == "skip_file":
            skipped_outside_ad += 1
        else:
            scanned += 1

        if result is not None:
            new_item["mateDistance"] = result["mateDistance"]
            new_item["mateScore"] = result["mateScore"]
            mates_found += 1

        new_items.append(new_item)

    print(
        f"[SCAN] {path.name} | total={total} scanned_AD={scanned} "
        f"skipped_EH={skipped_outside_ad} mates_found={mates_found} bad_fen={bad_fen}"
    )

    if WRITE_ONLY_IF_ANY_MATE_FOUND and mates_found == 0:
        print(f"[UNCHANGED] {path.name} (no mate found in a-d king placements)")
        return

    out_data = rebuild_same_shape(data, new_items, shape_kind)
    out_path = path.with_name(path.stem + OUTPUT_SUFFIX + path.suffix)
    save_json(out_path, out_data)

    print(f"[WRITE] {out_path.name}")


def main():
    if not FOLDER.exists():
        print(f"[STOP] Folder not found: {FOLDER}")
        return

    files = sorted(FOLDER.glob("*.json"))
    if not files:
        print(f"[STOP] No JSON files found in: {FOLDER}")
        return

    if not Path(ENGINE_PATH).exists():
        print(f"[STOP] Engine not found: {ENGINE_PATH}")
        return

    print(f"[START] Files: {len(files)}")
    print(f"[ENGINE] {ENGINE_PATH}")
    print("[FILTER] Only black king on files a-d")
    print()

    with chess.engine.SimpleEngine.popen_uci(ENGINE_PATH) as engine:
        for path in files:
            process_file(engine, path)

    print()
    print("[FINISHED]")


if __name__ == "__main__":
    main()