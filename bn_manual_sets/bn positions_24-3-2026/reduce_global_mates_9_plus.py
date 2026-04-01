import json
import os
import chess

FOLDER = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026"
OUTPUT_JSON = os.path.join(FOLDER, "bn_global_mates9_plus_reduced.json")

CRITICAL = [chess.A7, chess.B7, chess.C7, chess.A8, chess.C8]


def bishop_signature(board):
    controlled = []
    for sq in CRITICAL:
        if board.is_attacked_by(chess.WHITE, sq):
            controlled.append(chess.square_name(sq))
    return tuple(controlled)


def make_signature(item):
    board = chess.Board(item["fen"])
    return (
        item["mate_distance"],
        item.get("black_king"),
        item.get("white_king"),
        item.get("white_knight"),
        item.get("bestmove_uci"),
        bishop_signature(board),
    )


def main():
    all_data = []

    for file in os.listdir(FOLDER):
        if not file.endswith(".json"):
            continue
        if "reduced" in file:
            continue

        path = os.path.join(FOLDER, file)

        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, list):
                    print("Loaded:", file, len(data))
                    all_data.extend(data)
        except Exception:
            continue

    print("Total loaded:", len(all_data))

    mates = [
        x for x in all_data
        if x.get("mate_distance") is not None and x.get("mate_distance") >= 9
    ]
    others = [
        x for x in all_data
        if x.get("mate_distance") is None or x.get("mate_distance") < 9
    ]

    print("Mates 9+ total:", len(mates))

    unique = {}
    removed = 0

    for item in mates:
        sig = make_signature(item)
        if sig not in unique:
            unique[sig] = item
        else:
            removed += 1

    reduced = list(unique.values())
    final = others + reduced

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(final, f, indent=2, ensure_ascii=False)

    print("=== FINISHED ===")
    print("Original mates 9+:", len(mates))
    print("Reduced mates 9+:", len(reduced))
    print("Removed duplicates:", removed)
    print("Saved:", OUTPUT_JSON)


if __name__ == "__main__":
    main()