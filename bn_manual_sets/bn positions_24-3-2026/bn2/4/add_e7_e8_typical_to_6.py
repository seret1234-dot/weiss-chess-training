import os
import json
import random

SRC = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4\5"
DST = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4\6"

FILES = {
    "bn_typical_bk_e7_light_300.json": "no_mate_bk_e7.json",
    "bn_typical_bk_e8_light_300.json": "no_mate_bk_e8.json",
}

MAX_KEEP = 120
random.seed(42)


def get_fen(pos):
    for key in ("fen", "FEN", "startFen", "start_fen"):
        value = pos.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def fallback_key(pos):
    wk = pos.get("white_king", "")
    wn = pos.get("white_knight", "")
    wb = pos.get("white_bishop", "")
    bk = pos.get("black_king", "")
    stm = pos.get("side_to_move", "")
    return f"{wk}|{wn}|{wb}|{bk}|{stm}"


def normalize_fen(fen):
    parts = fen.split()
    if len(parts) >= 2:
        return f"{parts[0]} {parts[1]}"
    return fen


def reduce_positions(data):
    seen = set()
    out = []

    for p in data:
        if not isinstance(p, dict):
            continue

        fen = get_fen(p)
        if fen:
            key = normalize_fen(fen)
        else:
            key = fallback_key(p)

        if key in seen:
            continue
        seen.add(key)
        out.append(p)

    random.shuffle(out)
    return out[:MAX_KEEP]


for src_name, dst_name in FILES.items():
    src = os.path.join(SRC, src_name)
    dst = os.path.join(DST, dst_name)

    if not os.path.exists(src):
        print("[MISSING]", src_name)
        continue

    with open(src, "r", encoding="utf-8") as f:
        data = json.load(f)

    if not isinstance(data, list):
        print("[SKIP]", src_name, "not a list")
        continue

    reduced = reduce_positions(data)

    with open(dst, "w", encoding="utf-8") as f:
        json.dump(reduced, f, ensure_ascii=False, indent=2)

    print(f"[ADDED] {dst_name}: {len(reduced)}")

print("\nDONE")