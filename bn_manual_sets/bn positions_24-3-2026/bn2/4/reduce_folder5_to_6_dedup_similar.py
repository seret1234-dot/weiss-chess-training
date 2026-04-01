import os
import re
import json
import random
from collections import defaultdict

INPUT_FOLDER = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4\5"
OUTPUT_FOLDER = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4\6"

# =========================
# TUNING
# =========================

# Exact duplicate removal uses normalized FEN.
REMOVE_EXACT_DUPLICATES = True

# Similarity rule:
# keep at most this many positions with the same (white king, white knight, side to move)
MAX_PER_WK_WN_STM = 2

# Optional extra balancing:
# keep at most this many positions with the same (white king, white bishop, side to move)
MAX_PER_WK_WB_STM = 2

# Hard cap per output file after dedup/similarity reduction.
# Set to None if you do not want a cap.
MAX_PER_FILE = 300

# Deterministic shuffle seed so results are stable.
SEED = 42

os.makedirs(OUTPUT_FOLDER, exist_ok=True)


# =========================
# HELPERS
# =========================

def valid_source_filename(filename: str) -> bool:
    if not filename.endswith(".json"):
        return False
    name = filename[:-5]
    return (
        re.fullmatch(r"mate_\d+__bk_[a-h][1-8]", name) is not None
        or re.fullmatch(r"no_mate__bk_[a-h][1-8]", name) is not None
    )


def normalize_fen(fen: str) -> str:
    """
    Keep only board + side to move.
    Ignore castling / ep / halfmove / fullmove because these positions are tactical sets.
    """
    parts = fen.strip().split()
    if len(parts) >= 2:
        return f"{parts[0]} {parts[1]}"
    return fen.strip()


def parse_fen_positions(fen: str):
    """
    Returns:
      piece_map: dict like {'K':'c6', 'N':'e7', 'B':'h3', 'k':'a8'}
      stm: 'w' or 'b' or '?'
    """
    parts = fen.strip().split()
    board = parts[0]
    stm = parts[1] if len(parts) > 1 else "?"

    piece_map = {}
    ranks = board.split("/")

    for r_index, rank in enumerate(ranks):
        file_index = 0
        for ch in rank:
            if ch.isdigit():
                file_index += int(ch)
            else:
                sq = f"{'abcdefgh'[file_index]}{8 - r_index}"
                piece_map[ch] = sq
                file_index += 1

    return piece_map, stm


def get_square(pos: dict, field_name: str, fen_piece: str):
    """
    field_name examples: white_king, white_knight, white_bishop, black_king
    fen_piece examples: K, N, B, k
    """
    sq = pos.get(field_name)
    if sq:
        return sq

    fen = pos.get("fen", "")
    piece_map, _ = parse_fen_positions(fen)
    return piece_map.get(fen_piece, "unknown")


def get_stm(pos: dict):
    fen = pos.get("fen", "")
    _, stm = parse_fen_positions(fen)
    return stm


def deterministic_shuffle(items):
    rng = random.Random(SEED)
    items = list(items)
    rng.shuffle(items)
    return items


# =========================
# CORE REDUCTION
# =========================

def reduce_positions(data):
    exact_seen = set()
    deduped = []

    # 1) exact dedup
    if REMOVE_EXACT_DUPLICATES:
        for pos in data:
            if not isinstance(pos, dict):
                continue
            fen = pos.get("fen", "")
            key = normalize_fen(fen)
            if key in exact_seen:
                continue
            exact_seen.add(key)
            deduped.append(pos)
    else:
        deduped = [p for p in data if isinstance(p, dict)]

    # 2) deterministic shuffle to avoid "keep only first block from source"
    candidates = deterministic_shuffle(deduped)

    wk_wn_stm_count = defaultdict(int)
    wk_wb_stm_count = defaultdict(int)

    kept = []

    for pos in candidates:
        wk = get_square(pos, "white_king", "K")
        wn = get_square(pos, "white_knight", "N")
        wb = get_square(pos, "white_bishop", "B")
        stm = get_stm(pos)

        key1 = (wk, wn, stm)
        key2 = (wk, wb, stm)

        if wk_wn_stm_count[key1] >= MAX_PER_WK_WN_STM:
            continue

        if wk_wb_stm_count[key2] >= MAX_PER_WK_WB_STM:
            continue

        kept.append(pos)
        wk_wn_stm_count[key1] += 1
        wk_wb_stm_count[key2] += 1

        if MAX_PER_FILE is not None and len(kept) >= MAX_PER_FILE:
            break

    return deduped, kept


# =========================
# MAIN
# =========================

def main():
    files = [f for f in os.listdir(INPUT_FOLDER) if valid_source_filename(f)]
    files.sort()

    total_input_files = 0
    total_input_positions = 0
    total_after_exact = 0
    total_kept = 0

    for filename in files:
        src_path = os.path.join(INPUT_FOLDER, filename)
        dst_path = os.path.join(OUTPUT_FOLDER, filename)

        with open(src_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        if not isinstance(data, list):
            print(f"[SKIP] {filename} (not a list)")
            continue

        total_input_files += 1
        total_input_positions += len(data)

        deduped, kept = reduce_positions(data)

        total_after_exact += len(deduped)
        total_kept += len(kept)

        with open(dst_path, "w", encoding="utf-8") as f:
            json.dump(kept, f, ensure_ascii=False, indent=2)

        print(
            f"[WRITE] {filename}: "
            f"input={len(data)} | "
            f"after_exact={len(deduped)} | "
            f"kept={len(kept)}"
        )

    print("\n=== FINISHED ===")
    print("read from:", INPUT_FOLDER)
    print("wrote to:", OUTPUT_FOLDER)
    print("input files:", total_input_files)
    print("input positions:", total_input_positions)
    print("after exact dedup:", total_after_exact)
    print("final kept:", total_kept)
    print("source files unchanged: YES")
    print("MAX_PER_WK_WN_STM:", MAX_PER_WK_WN_STM)
    print("MAX_PER_WK_WB_STM:", MAX_PER_WK_WB_STM)
    print("MAX_PER_FILE:", MAX_PER_FILE)


if __name__ == "__main__":
    main()