import json

with open("bn_v1_merged.json", "r", encoding="utf-8") as f:
    data = json.load(f)

CENTER_PHASE_NAMES = {
    "phase1",
    "wrong_corner",
    "near_wrong_corner",
    "center_drive",
}

CORNER_ORDER = {
    "a8": 0, "h8": 1, "a1": 2, "h1": 3,
    "g8": 4, "b8": 5, "a7": 6, "h7": 7,
    "f8": 8, "g7": 9, "b7": 10, "a6": 11,
    "e8": 12, "f7": 13, "c8": 14, "h6": 15,
    "d8": 16, "e7": 17, "g6": 18, "b6": 19,
    "a5": 20, "h5": 21, "c7": 22, "f6": 23,
    "d7": 24, "e6": 25, "g5": 26, "b5": 27,
    "a4": 28, "h4": 29, "c6": 30, "f5": 31,
    "d6": 32, "e5": 33, "g4": 34, "b4": 35,
    "a3": 36, "h3": 37, "c5": 38, "f4": 39,
    "d5": 40, "e4": 41, "g3": 42, "b3": 43,
    "a2": 44, "h2": 45, "c4": 46, "f3": 47,
    "d4": 48, "e3": 49, "g2": 50, "b2": 51,
    "a1": 52, "h1": 53, "c3": 54, "f2": 55,
    "d3": 56, "e2": 57, "g1": 58, "b1": 59,
    "c2": 60, "f1": 61, "d2": 62, "e1": 63,
    "c1": 64, "d1": 65,
}

def black_king_square(p):
    return p.get("blackKing") or p.get("corner") or "zz"

def is_center_phase(p):
    phase = str(p.get("phase", "")).lower()
    return any(name in phase for name in CENTER_PHASE_NAMES)

main_data = []
center_data = []

for p in data:
    if is_center_phase(p):
        center_data.append(p)
    else:
        main_data.append(p)

def sort_key(p):
    mate = p.get("mateDistance", 999)
    bk = black_king_square(p)
    bk_rank = CORNER_ORDER.get(bk, 999)
    phase = str(p.get("phase", ""))
    return (mate, bk_rank, phase)

main_data.sort(key=sort_key)

with open("bn_v1_main_sorted.json", "w", encoding="utf-8") as f:
    json.dump(main_data, f, indent=2)

with open("bn_v1_center_300.json", "w", encoding="utf-8") as f:
    json.dump(center_data, f, indent=2)

print("Main sorted:", len(main_data))
print("Center separate:", len(center_data))