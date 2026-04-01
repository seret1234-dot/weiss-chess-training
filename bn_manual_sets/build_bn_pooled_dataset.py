import json
import random
from math import ceil
from pathlib import Path
from collections import defaultdict

SOURCE_DIR = Path(r"C:\Users\Ariel\chess-trainer\public\data\lichess\bn_v3\chunks")
OUTPUT_DIR = Path(r"C:\Users\Ariel\chess-trainer\bn_manual_sets\pooled_bn_output")
CHUNK_SIZE = 30

EXCLUDE_PREFIXES = [
    "phase1_center_chunk_",
]

random.seed()

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def load_json(path: Path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def should_exclude(filename: str) -> bool:
    return any(filename.startswith(prefix) for prefix in EXCLUDE_PREFIXES)


def get_black_king_square(pos: dict) -> str | None:
    bk = pos.get("blackKing")
    if isinstance(bk, str) and len(bk) == 2:
        return bk.lower()

    fen = pos.get("fen") or pos.get("startFen")
    if not isinstance(fen, str):
        return None

    board = fen.split()[0]
    ranks = board.split("/")

    for rank_index, rank_data in enumerate(ranks):
        file_index = 0
        for ch in rank_data:
            if ch.isdigit():
                file_index += int(ch)
            else:
                if ch == "k":
                    file_char = "abcdefgh"[file_index]
                    rank_char = str(8 - rank_index)
                    return f"{file_char}{rank_char}"
                file_index += 1
    return None


def get_piece_square(pos: dict, piece_key: str) -> str:
    value = pos.get(piece_key)
    if isinstance(value, str) and len(value) == 2:
        return value.lower()
    return ""


def get_mate_distance(pos: dict):
    if "mateDistance" in pos and pos["mateDistance"] is not None:
        return pos["mateDistance"]
    if "mate_distance" in pos and pos["mate_distance"] is not None:
        return pos["mate_distance"]
    return None


def get_pool_key(filename: str, pos: dict) -> str | None:
    mate_distance = get_mate_distance(pos)

    if mate_distance is not None:
        return f"mate_{int(mate_distance)}"

    bk = get_black_king_square(pos)
    if not bk:
        return None

    return f"bk_{bk}"


def normalize_positions(data, filename: str):
    if isinstance(data, dict) and isinstance(data.get("positions"), list):
        positions = data["positions"]
    elif isinstance(data, list):
        positions = data
    else:
        return []

    normalized = []
    for pos in positions:
        if not isinstance(pos, dict):
            continue
        p = dict(pos)
        p["_pooledFromChunk"] = filename
        normalized.append(p)

    return normalized


def dedupe_positions(positions: list[dict]) -> list[dict]:
    seen = set()
    unique = []

    for pos in positions:
        key = pos.get("id")
        if not key:
            key = (
                (pos.get("fen") or pos.get("startFen") or "")
                + "||"
                + str(pos.get("mateDistance", pos.get("mate_distance", "")))
            )

        if key in seen:
            continue

        seen.add(key)
        unique.append(pos)

    return unique


def diversify_positions(positions: list[dict]) -> list[dict]:
    if len(positions) <= 2:
        return positions[:]

    remaining = positions[:]
    random.shuffle(remaining)

    arranged = [remaining.pop(0)]

    while remaining:
        prev = arranged[-1]

        prev_bk = get_black_king_square(prev) or ""
        prev_wn = get_piece_square(prev, "whiteKnight")

        strict_candidates = []
        semi_candidates = []
        fallback_candidates = []

        for i, candidate in enumerate(remaining):
            curr_bk = get_black_king_square(candidate) or ""
            curr_wn = get_piece_square(candidate, "whiteKnight")

            bk_changed = prev_bk != curr_bk
            wn_changed = prev_wn != curr_wn

            if bk_changed and wn_changed:
                strict_candidates.append((i, candidate))
            elif bk_changed or wn_changed:
                semi_candidates.append((i, candidate))
            else:
                fallback_candidates.append((i, candidate))

        if strict_candidates:
            best_index = strict_candidates[0][0]
        elif semi_candidates:
            best_index = semi_candidates[0][0]
        else:
            best_index = fallback_candidates[0][0]

        arranged.append(remaining.pop(best_index))

    return arranged


def write_chunk_file(theme_id: str, chunk_index: int, chunk_positions: list[dict]):
    out_name = f"{theme_id}_chunk_{chunk_index:03d}.json"
    out_path = OUTPUT_DIR / out_name
    payload = {
        "theme": theme_id,
        "count": len(chunk_positions),
        "positions": chunk_positions,
    }
    save_json(out_path, payload)
    return out_name


def sort_theme_ids(theme_ids: list[str]) -> list[str]:
    mate_ids = []
    bk_ids = []

    for t in theme_ids:
        if t.startswith("mate_"):
            mate_ids.append(t)
        elif t.startswith("bk_"):
            bk_ids.append(t)

    mate_ids.sort(key=lambda x: int(x.split("_")[1]))
    bk_order = ["bk_e7", "bk_e8", "bk_f7", "bk_f8", "bk_g8", "bk_h8"]
    bk_ids.sort(key=lambda x: bk_order.index(x) if x in bk_order else 999)

    return mate_ids + bk_ids


def build_label(theme_id: str) -> str:
    if theme_id.startswith("mate_"):
        num = theme_id.split("_")[1]
        return f"Mate in {num}"
    if theme_id.startswith("bk_"):
        sq = theme_id.split("_", 1)[1]
        return f"Black king {sq}"
    return theme_id


def main():
    pools = defaultdict(list)

    for path in SOURCE_DIR.glob("*.json"):
        filename = path.name

        if should_exclude(filename):
            print(f"[SKIP] {filename}")
            continue

        data = load_json(path)
        positions = normalize_positions(data, filename)

        if not positions:
            print(f"[EMPTY] {filename}")
            continue

        added = 0
        for pos in positions:
            pool_key = get_pool_key(filename, pos)
            if not pool_key:
                continue
            pools[pool_key].append(pos)
            added += 1

        print(f"[LOAD] {filename}: {added}")

    progression = {
        "name": "BN Pooled Dataset",
        "chunkSize": CHUNK_SIZE,
        "basePath": "chunks",
        "masteryFastSolves": 30,
        "maxSecondsPerMove": 3,
        "order": [],
        "themes": {},
    }

    theme_ids = sort_theme_ids(list(pools.keys()))

    total_positions = 0
    total_chunks = 0

    for theme_id in theme_ids:
        positions = dedupe_positions(pools[theme_id])
        positions = diversify_positions(positions)

        total_positions += len(positions)

        chunk_files = []
        num_chunks = ceil(len(positions) / CHUNK_SIZE)

        for i in range(num_chunks):
            start = i * CHUNK_SIZE
            end = start + CHUNK_SIZE
            chunk_positions = positions[start:end]
            if not chunk_positions:
                continue

            chunk_file = write_chunk_file(theme_id, i + 1, chunk_positions)
            chunk_files.append(chunk_file)
            total_chunks += 1

        progression["order"].append(theme_id)
        progression["themes"][theme_id] = {
            "chunkFiles": chunk_files,
            "label": build_label(theme_id),
        }

        print(f"[THEME] {theme_id}: {len(positions)} positions -> {len(chunk_files)} chunks")

    save_json(OUTPUT_DIR / "progression.json", progression)

    print("\n=== FINISHED ===")
    print(f"Themes: {len(theme_ids)}")
    print(f"Chunks: {total_chunks}")
    print(f"Positions: {total_positions}")
    print(f"Output: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()