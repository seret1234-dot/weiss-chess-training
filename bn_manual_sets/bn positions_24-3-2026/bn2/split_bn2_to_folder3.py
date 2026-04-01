import json
import os
import chess
from collections import defaultdict

SOURCE_DIR = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2"
OUTPUT_DIR = os.path.join(SOURCE_DIR, "3")


def get_black_king_square_from_fen(fen: str):
    try:
        board = chess.Board(fen)
        sq = board.king(chess.BLACK)
        if sq is None:
            return None
        return chess.square_name(sq)
    except Exception:
        return None


def load_json_list(path: str):
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if isinstance(data, list):
            return data
    except Exception as e:
        print(f"[SKIP] {os.path.basename(path)} -> {e}")
    return None


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    mate_buckets = defaultdict(list)
    nonmate_buckets = defaultdict(list)

    loaded_files = 0
    loaded_positions = 0

    for filename in sorted(os.listdir(SOURCE_DIR)):
        if not filename.endswith(".json"):
            continue

        full_path = os.path.join(SOURCE_DIR, filename)
        data = load_json_list(full_path)
        if data is None:
            continue

        loaded_files += 1
        loaded_positions += len(data)
        print(f"[LOAD] {filename}: {len(data)}")

        # global reduced mate files: only take their own range
        if filename == "bn_global_mates1_3_reduced.json":
            for item in data:
                md = item.get("mate_distance")
                if isinstance(md, int) and md in (1, 2, 3):
                    mate_buckets[md].append(item)
            continue

        if filename == "bn_global_mates4_8_reduced.json":
            for item in data:
                md = item.get("mate_distance")
                if isinstance(md, int) and md in (4, 5, 6, 7, 8):
                    mate_buckets[md].append(item)
            continue

        if filename == "bn_global_mates9_plus_reduced.json":
            for item in data:
                md = item.get("mate_distance")
                if isinstance(md, int) and md >= 9:
                    mate_buckets[md].append(item)
            continue

        # phase2 non-mate files: automatically include f7/f8/g8/h8/e7/e8/etc.
        if filename.startswith("00") and "bn_phase2_typical_" in filename:
            for item in data:
                fen = item.get("fen")
                if not isinstance(fen, str) or not fen:
                    continue

                bk_sq = item.get("black_king") or get_black_king_square_from_fen(fen)
                if bk_sq is None:
                    continue

                nonmate_buckets[bk_sq].append(item)
            continue

        # direct non-mate files like bn_typical_bk_e7_light.json / e8
        if filename.startswith("bn_typical_bk_") and filename.endswith(".json"):
            for item in data:
                fen = item.get("fen")
                if not isinstance(fen, str) or not fen:
                    continue

                bk_sq = item.get("black_king") or get_black_king_square_from_fen(fen)
                if bk_sq is None:
                    continue

                nonmate_buckets[bk_sq].append(item)
            continue

        print(f"[SKIP] {filename} -> not part of final clean sources")

    # write mate files
    for md in sorted(mate_buckets):
        out_path = os.path.join(OUTPUT_DIR, f"mate_{md}.json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(mate_buckets[md], f, indent=2, ensure_ascii=False)
        print(f"[WRITE] mate_{md}.json: {len(mate_buckets[md])}")

    # write non-mate files
    for sq in sorted(nonmate_buckets):
        out_path = os.path.join(OUTPUT_DIR, f"nonmate_bk_{sq}.json")
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(nonmate_buckets[sq], f, indent=2, ensure_ascii=False)
        print(f"[WRITE] nonmate_bk_{sq}.json: {len(nonmate_buckets[sq])}")

    print("=== FINISHED ===")
    print(f"Loaded files: {loaded_files}")
    print(f"Loaded positions: {loaded_positions}")

    print("\nMate files created:")
    if mate_buckets:
        for md in sorted(mate_buckets):
            print(f"  mate_{md}.json -> {len(mate_buckets[md])}")
    else:
        print("  none")

    print("\nNon-mate files created:")
    if nonmate_buckets:
        for sq in sorted(nonmate_buckets):
            print(f"  nonmate_bk_{sq}.json -> {len(nonmate_buckets[sq])}")
    else:
        print("  none")

    print(f"\nOutput folder: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()