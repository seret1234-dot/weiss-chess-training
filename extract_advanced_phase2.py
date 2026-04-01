import json
from pathlib import Path
from collections import defaultdict
import chess

INPUT_DIR = Path("bn_by_mate_overnight")
OUTPUT_DIR = Path("bn_phase2_advanced")

MIN_MATE_DISTANCE = 9

# light-square bishop project
CORRECT_CORNER = chess.A8
WRONG_CORNER = chess.H8

INPUT_FILES = sorted(INPUT_DIR.glob("bn_m*.json"))


def square_name(sq: int) -> str:
    return chess.square_name(sq)


def parse_square(name: str | None):
    if not name:
        return None
    return chess.parse_square(name)


def king_distance(sq1: int, sq2: int) -> int:
    f1, r1 = chess.square_file(sq1), chess.square_rank(sq1)
    f2, r2 = chess.square_file(sq2), chess.square_rank(sq2)
    return max(abs(f1 - f2), abs(r1 - r2))


def on_edge(square: int) -> bool:
    file = chess.square_file(square)
    rank = chess.square_rank(square)
    return file in (0, 7) or rank in (0, 7)


def get_black_king_square(item: dict):
    bk_name = item.get("blackKing")
    if bk_name:
        try:
            return chess.parse_square(bk_name)
        except Exception:
            pass

    try:
        board = chess.Board(item["fen"])
        for sq, piece in board.piece_map().items():
            if piece.color == chess.BLACK and piece.piece_type == chess.KING:
                return sq
    except Exception:
        pass

    return None


def classify_advanced_zone(bk_sq: int) -> str | None:
    """
    Advanced Phase 2 zones for light-square bishop project:
    - wrong_corner: exactly h8
    - near_wrong_corner: within 2 king-steps of h8
    - edge_transfer: edge squares on the transfer route, not near a8
    """
    if bk_sq == WRONG_CORNER:
        return "wrong_corner"

    if king_distance(bk_sq, WRONG_CORNER) <= 2:
        return "near_wrong_corner"

    if on_edge(bk_sq):
        # exclude the correct-corner side
        if king_distance(bk_sq, CORRECT_CORNER) <= 2:
            return None
        return "edge_transfer"

    return None


def load_positions():
    positions = []

    for path in INPUT_FILES:
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            print(f"[SKIP] {path} -> {e}")
            continue

        if not isinstance(data, list):
            print(f"[SKIP] Not a list: {path}")
            continue

        print(f"[LOAD] {path.name} -> {len(data)}")

        for item in data:
            if isinstance(item, dict):
                item = dict(item)
                item["_sourceMateFile"] = path.name
                positions.append(item)

    return positions


def main():
    OUTPUT_DIR.mkdir(exist_ok=True)

    positions = load_positions()
    print(f"\nLoaded positions: {len(positions)}")

    selected = []
    by_zone = defaultdict(list)
    by_mate = defaultdict(list)

    skipped_no_bk = 0
    skipped_short = 0
    skipped_wrong_zone = 0

    for item in positions:
        mate_distance = item.get("mateDistance")
        if mate_distance is None or mate_distance < MIN_MATE_DISTANCE:
            skipped_short += 1
            continue

        bk_sq = get_black_king_square(item)
        if bk_sq is None:
            skipped_no_bk += 1
            continue

        zone = classify_advanced_zone(bk_sq)
        if zone is None:
            skipped_wrong_zone += 1
            continue

        out = dict(item)
        out["advancedZone"] = zone
        out["phaseTag"] = "phase2_advanced"
        out["correctCorner"] = "a8"
        out["wrongCorner"] = "h8"
        out["bishopProject"] = "light_a8_h8"

        selected.append(out)
        by_zone[zone].append(out)
        by_mate[mate_distance].append(out)

    selected.sort(key=lambda x: (
        x["advancedZone"],
        x.get("mateDistance", 999),
        x.get("blackKing", ""),
        x["fen"],
    ))

    with open(OUTPUT_DIR / "phase2_advanced_all.json", "w", encoding="utf-8") as f:
        json.dump(selected, f, indent=2)
    print(f"Wrote {OUTPUT_DIR / 'phase2_advanced_all.json'} -> {len(selected)}")

    for zone, items in sorted(by_zone.items()):
        items.sort(key=lambda x: (x.get("mateDistance", 999), x["fen"]))
        path = OUTPUT_DIR / f"phase2_{zone}.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(items, f, indent=2)
        print(f"Wrote {path} -> {len(items)}")

    for mate_distance, items in sorted(by_mate.items()):
        items.sort(key=lambda x: x["fen"])
        path = OUTPUT_DIR / f"phase2_m{mate_distance}.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(items, f, indent=2)
        print(f"Wrote {path} -> {len(items)}")

    print("\n=== SUMMARY ===")
    print(f"Loaded total: {len(positions)}")
    print(f"Selected advanced phase2: {len(selected)}")
    print(f"Skipped short mates (< M{MIN_MATE_DISTANCE}): {skipped_short}")
    print(f"Skipped no black king found: {skipped_no_bk}")
    print(f"Skipped wrong zone: {skipped_wrong_zone}")

    print("\nBy advanced zone:")
    for zone in sorted(by_zone):
        print(f"  {zone}: {len(by_zone[zone])}")

    print("\nBy mate distance:")
    for mate_distance in sorted(by_mate):
        print(f"  M{mate_distance}: {len(by_mate[mate_distance])}")


if __name__ == "__main__":
    main()