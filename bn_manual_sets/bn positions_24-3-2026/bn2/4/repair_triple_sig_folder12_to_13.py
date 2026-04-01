import glob
import json
import os
from collections import Counter

INPUT_FOLDER = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4\12"
OUTPUT_FOLDER = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4\13"

os.makedirs(OUTPUT_FOLDER, exist_ok=True)


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


def analyze_sequence(seq):
    stats = Counter()
    sigs = []

    for i in range(1, len(seq)):
        prev = seq[i - 1]
        cur = seq[i]
        sig = change_signature(prev, cur)
        sigs.append(sig)

        stats[f"change_{len(sig)}"] += 1
        if exact_same_position(prev, cur):
            stats["exact_repeats"] += 1

    triple_positions = []
    for i in range(2, len(sigs)):
        if sigs[i] == sigs[i - 1] == sigs[i - 2]:
            stats["triple_repeat_same_sig"] += 1
            triple_positions.append((i - 1, i, i + 1, sigs[i]))

    return stats, triple_positions


def local_score(seq, idx):
    """
    Lower is better.
    Score only the neighborhood around idx.
    """
    n = len(seq)
    score = 0

    left = max(1, idx - 3)
    right = min(n - 1, idx + 3)

    sigs = []
    for i in range(left, right + 1):
        if i < n:
            prev = seq[i - 1]
            cur = seq[i]

            if exact_same_position(prev, cur):
                score += 1000

            sig = change_signature(prev, cur)
            if len(sig) < 2:
                score += 300
            elif len(sig) == 2:
                score += 20
            elif len(sig) == 3:
                score += 0

            sigs.append((i, sig))

    # punish triple streaks in the local window
    only_sigs = [sig for _, sig in sigs]
    for j in range(2, len(only_sigs)):
        if only_sigs[j] == only_sigs[j - 1] == only_sigs[j - 2]:
            score += 500

    return score


def try_repair_file(seq):
    seq = list(seq)
    n = len(seq)

    if n < 4:
        return seq, 0

    swaps_made = 0
    max_passes = 6

    for _ in range(max_passes):
        _, triples = analyze_sequence(seq)
        if not triples:
            break

        changed_any = False

        for a, b, c, sig in triples:
            target_idx = c  # try to replace the third item in the streak
            best_j = None
            best_score = local_score(seq, target_idx)

            search_start = target_idx + 1
            search_end = min(n, target_idx + 12)

            for j in range(search_start, search_end):
                if piece_signature(seq[target_idx]) == piece_signature(seq[j]):
                    continue

                trial = list(seq)
                trial[target_idx], trial[j] = trial[j], trial[target_idx]

                score = (
                    local_score(trial, target_idx)
                    + local_score(trial, j)
                )

                if score < best_score:
                    best_score = score
                    best_j = j

            if best_j is not None:
                seq[target_idx], seq[best_j] = seq[best_j], seq[target_idx]
                swaps_made += 1
                changed_any = True

        if not changed_any:
            break

    return seq, swaps_made


def main():
    files = sorted(glob.glob(os.path.join(INPUT_FOLDER, "*.json")))
    print(f"Found files: {len(files)}")

    grand = Counter()

    for file_idx, path in enumerate(files, start=1):
        name = os.path.basename(path)

        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        before_stats, before_triples = analyze_sequence(data)
        repaired, swaps_made = try_repair_file(data)
        after_stats, after_triples = analyze_sequence(repaired)

        out_path = os.path.join(OUTPUT_FOLDER, name)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(repaired, f, indent=2, ensure_ascii=False)

        print(f"\n[{file_idx}/{len(files)}] {name}")
        print(f"  positions: {len(data)}")
        print(f"  swaps: {swaps_made}")
        print(f"  triple_before: {before_stats.get('triple_repeat_same_sig', 0)}")
        print(f"  triple_after:  {after_stats.get('triple_repeat_same_sig', 0)}")
        print(f"  repeats_after: {after_stats.get('exact_repeats', 0)}")
        print(f"  wrote: {out_path}")

        grand["files"] += 1
        grand["positions"] += len(data)
        grand["swaps"] += swaps_made
        grand["triple_before"] += before_stats.get("triple_repeat_same_sig", 0)
        grand["triple_after"] += after_stats.get("triple_repeat_same_sig", 0)
        grand["exact_repeats_after"] += after_stats.get("exact_repeats", 0)

    print("\n=== GRAND TOTAL ===")
    for k, v in sorted(grand.items()):
        print(f"{k}: {v}")


if __name__ == "__main__":
    main()