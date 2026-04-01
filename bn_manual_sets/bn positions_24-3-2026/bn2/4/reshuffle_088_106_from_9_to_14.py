import glob
import json
import os
import random
from collections import Counter

INPUT_FOLDER = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4\9"
OUTPUT_FOLDER = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4\14"

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
        pos.get("white_king"),
        pos.get("white_knight"),
        pos.get("white_bishop"),
    )


def change_signature(a, b):
    changed = []
    if a.get("white_king") != b.get("white_king"):
        changed.append("K")
    if a.get("white_knight") != b.get("white_knight"):
        changed.append("N")
    if a.get("white_bishop") != b.get("white_bishop"):
        changed.append("B")
    return tuple(changed)


def exact_same_position(a, b):
    return piece_signature(a) == piece_signature(b)


def transition_score(prev, cand, history):
    if exact_same_position(prev, cand):
        return -10**9

    sig = change_signature(prev, cand)
    cnt = len(sig)

    if cnt < 2:
        return -10**9

    score = 0

    if cnt == 3:
        score += 100
    else:
        score += 60

    if history:
        if sig == history[-1]:
            score -= 40

    if len(history) >= 2:
        if sig == history[-1] == history[-2]:
            score -= 200

    return score


def reshuffle(data):
    if len(data) <= 2:
        return data, 0

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
        idx = None

        for score, i, cand in scored:
            if score > -10**8:
                chosen = cand
                idx = i
                break

        if chosen is None:
            idx = 0
            chosen = remaining[idx]
            fallback += 1

        remaining.pop(idx)
        history.append(change_signature(out[-1], chosen))
        out.append(chosen)

    return out, fallback


def analyze(seq):
    stats = Counter()
    sigs = []

    for i in range(1, len(seq)):
        sig = change_signature(seq[i-1], seq[i])
        sigs.append(sig)

        stats[f"change_{len(sig)}"] += 1

        if exact_same_position(seq[i-1], seq[i]):
            stats["exact_repeats"] += 1

    for i in range(2, len(sigs)):
        if sigs[i] == sigs[i-1] == sigs[i-2]:
            stats["triple"] += 1

    return stats


def main():
    files = sorted(glob.glob(os.path.join(INPUT_FOLDER, "*.json")))
    files = [f for f in files if should_use_file(os.path.basename(f))]

    print(f"Files to shuffle: {len(files)}")

    grand = Counter()

    for idx, path in enumerate(files, 1):
        name = os.path.basename(path)

        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        shuffled, fallback = reshuffle(data)
        stats = analyze(shuffled)

        out_path = os.path.join(OUTPUT_FOLDER, name)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(shuffled, f, indent=2)

        print(f"\n[{idx}/{len(files)}] {name}")
        print(f" positions: {len(data)}")
        print(f" change2: {stats.get('change_2',0)}")
        print(f" change3: {stats.get('change_3',0)}")
        print(f" triple: {stats.get('triple',0)}")
        print(f" repeats: {stats.get('exact_repeats',0)}")
        print(f" fallback: {fallback}")

        grand["files"] += 1
        grand["positions"] += len(data)
        grand["triple"] += stats.get("triple",0)
        grand["repeats"] += stats.get("exact_repeats",0)
        grand["fallback"] += fallback

    print("\n=== GRAND TOTAL ===")
    for k,v in sorted(grand.items()):
        print(f"{k}: {v}")


if __name__ == "__main__":
    main()