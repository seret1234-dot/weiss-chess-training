import glob
import json
import os
import random
from collections import Counter

INPUT_FOLDER = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4\9"
OUTPUT_FOLDER = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4\15"

os.makedirs(OUTPUT_FOLDER, exist_ok=True)

RANDOM_SEED = 42
random.seed(RANDOM_SEED)


def should_use_file(name):
    prefix = name[:3]
    if not prefix.isdigit():
        return False
    num = int(prefix)
    return 88 <= num <= 106


def piece_signature(pos):
    return (
        pos.get("whiteKing") or pos.get("white_king"),
        pos.get("whiteKnight") or pos.get("white_knight"),
        pos.get("whiteBishop") or pos.get("white_bishop"),
    )


def exact_same_position(a, b):
    return piece_signature(a) == piece_signature(b)


def position_key(pos):
    """
    Prefer real board identity.
    """
    if pos.get("startFen"):
        return ("startFen", pos["startFen"])
    if pos.get("fen"):
        return ("fen", pos["fen"])

    # fallback: use full object content, sorted
    return ("full", json.dumps(pos, sort_keys=True, ensure_ascii=False))


def change_signature(a, b):
    ak, an, ab = piece_signature(a)
    bk, bn, bb = piece_signature(b)

    changed = []
    if ak != bk:
        changed.append("K")
    if an != bn:
        changed.append("N")
    if ab != bb:
        changed.append("B")
    return tuple(changed)


def dedupe_positions(data):
    seen = set()
    out = []

    for pos in data:
        key = position_key(pos)
        if key in seen:
            continue
        seen.add(key)
        out.append(pos)

    return out


def transition_score(prev, cand, history):
    if position_key(prev) == position_key(cand):
        return -10**9

    sig = change_signature(prev, cand)
    cnt = len(sig)

    if cnt == 0:
        return -10**9

    score = 0

    # soft rules for later stages
    if cnt == 3:
        score += 100
    elif cnt == 2:
        score += 70
    elif cnt == 1:
        score += 35

    if history:
        if sig == history[-1]:
            score -= 25

    if len(history) >= 2:
        if sig == history[-1] == history[-2]:
            score -= 120

    return score


def soft_shuffle(data):
    if len(data) <= 2:
        return list(data), 0

    remaining = list(data)
    random.shuffle(remaining)

    out = [remaining.pop(0)]
    history = []
    fallback = 0

    while remaining:
        prev = out[-1]

        scored = []
        for i, cand in enumerate(remaining):
            scored.append((transition_score(prev, cand, history), i, cand))

        scored.sort(key=lambda x: x[0], reverse=True)

        chosen = None
        chosen_idx = None

        for score, i, cand in scored:
            if score > -10**8:
                chosen = cand
                chosen_idx = i
                break

        if chosen is None:
            chosen_idx = 0
            chosen = remaining[chosen_idx]
            fallback += 1

        remaining.pop(chosen_idx)
        history.append(change_signature(out[-1], chosen))
        out.append(chosen)

    return out, fallback


def analyze(seq):
    stats = Counter()
    sigs = []

    for i in range(1, len(seq)):
        prev = seq[i - 1]
        cur = seq[i]

        if position_key(prev) == position_key(cur):
            stats["exact_repeats"] += 1

        sig = change_signature(prev, cur)
        sigs.append(sig)
        stats[f"change_{len(sig)}"] += 1

    for i in range(2, len(sigs)):
        if sigs[i] == sigs[i - 1] == sigs[i - 2]:
            stats["triple"] += 1

    return stats


def main():
    files = sorted(glob.glob(os.path.join(INPUT_FOLDER, "*.json")))
    files = [f for f in files if should_use_file(os.path.basename(f))]

    print(f"Files to process: {len(files)}")

    grand = Counter()

    for idx, path in enumerate(files, 1):
        name = os.path.basename(path)

        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        deduped = dedupe_positions(data)
        removed_dupes = len(data) - len(deduped)

        shuffled, fallback = soft_shuffle(deduped)
        stats = analyze(shuffled)

        out_path = os.path.join(OUTPUT_FOLDER, name)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(shuffled, f, indent=2, ensure_ascii=False)

        print(f"\n[{idx}/{len(files)}] {name}")
        print(f"  input: {len(data)}")
        print(f"  deduped: {len(deduped)}")
        print(f"  removed_dupes: {removed_dupes}")
        print(f"  change1: {stats.get('change_1', 0)}")
        print(f"  change2: {stats.get('change_2', 0)}")
        print(f"  change3: {stats.get('change_3', 0)}")
        print(f"  repeats: {stats.get('exact_repeats', 0)}")
        print(f"  triple: {stats.get('triple', 0)}")
        print(f"  fallback: {fallback}")

        grand["files"] += 1
        grand["input_positions"] += len(data)
        grand["deduped_positions"] += len(deduped)
        grand["removed_dupes"] += removed_dupes
        grand["change_1"] += stats.get("change_1", 0)
        grand["change_2"] += stats.get("change_2", 0)
        grand["change_3"] += stats.get("change_3", 0)
        grand["repeats"] += stats.get("exact_repeats", 0)
        grand["triple"] += stats.get("triple", 0)
        grand["fallback"] += fallback

    print("\n=== GRAND TOTAL ===")
    for k, v in sorted(grand.items()):
        print(f"{k}: {v}")


if __name__ == "__main__":
    main()