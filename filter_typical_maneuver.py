import json
from pathlib import Path
import chess

INPUT = Path(r"C:\Users\Ariel\chess-trainer\bn_manual_sets\cleaned_a8_light_sorted\final_unique_sorted")
FILES = [
    "005_bn_typical_bk_e7_light.json",
    "006_bn_typical_bk_e8_light.json"
]

# only keep white king in these more typical maneuver squares
TYPICAL_WK = {
    "c6", "d6", "e6",
    "c7", "d7", "e7",
    "c8", "d8"
}

def chebyshev(a, b):
    return max(
        abs(chess.square_file(a) - chess.square_file(b)),
        abs(chess.square_rank(a) - chess.square_rank(b))
    )

def filter_file(name):
    path = INPUT / name
    data = json.load(open(path, "r", encoding="utf-8"))

    items = data["positions"] if isinstance(data, dict) and "positions" in data else data

    kept = []

    for p in items:
        fen = p.get("fen") or p.get("startFen")
        if not fen:
            continue

        try:
            board = chess.Board(fen)
        except Exception:
            continue

        wk = board.king(chess.WHITE)
        bk = board.king(chess.BLACK)

        knight = None
        bishop = None

        for sq, piece in board.piece_map().items():
            if piece.color == chess.WHITE:
                if piece.piece_type == chess.KNIGHT:
                    knight = sq
                elif piece.piece_type == chess.BISHOP:
                    bishop = sq

        if wk is None or bk is None or knight is None or bishop is None:
            continue

        wk_name = chess.square_name(wk)

        # stricter maneuver shape
        if wk_name not in TYPICAL_WK:
            continue

        if chebyshev(wk, bk) > 2:
            continue

        if chebyshev(knight, bk) > 2:
            continue

        if chebyshev(bishop, bk) > 3:
            continue

        # keep pieces reasonably coordinated
        if chebyshev(wk, knight) > 3:
            continue

        if chebyshev(wk, bishop) > 3:
            continue

        kept.append(p)

    out = path.parent / name.replace(".json", "_typical_strict.json")

    if isinstance(data, dict) and "positions" in data:
        out_data = dict(data)
        out_data["positions"] = kept
    else:
        out_data = kept

    with open(out, "w", encoding="utf-8") as f:
        json.dump(out_data, f, indent=2)

    print(name, "->", len(kept))

for f in FILES:
    filter_file(f)