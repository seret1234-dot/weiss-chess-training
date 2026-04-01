import json
import glob
import os
from collections import Counter

import chess

INPUT_FOLDER = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4\10"
OUTPUT_FOLDER = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4\11"

os.makedirs(OUTPUT_FOLDER, exist_ok=True)


def get_black_king_square_from_fen(fen: str) -> str:
    board = chess.Board(fen)
    sq = board.king(chess.BLACK)
    return chess.square_name(sq)


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


def transition_score(prev, cand, history):
    if piece_signature(prev) == piece_signature(cand):
        return -10**9

    change_sig = change_signature(prev, cand)
    change_count = len(change_sig)

    if change_count < 2:
        return -10**9

    if len(history) >= 2 and history[-1] == change_sig and history[-2] == change_sig:
        return -10**9

    score = 0

    if change_count == 3:
        score += 100
    elif change_count == 2:
        score += 60

    if len(history) >= 1 and history[-1] == change_sig:
        score -= 25
    if len(history) >= 2 and history[-2] == change_sig:
        score -= 10

    prev_sig = piece_signature(prev)
    cand_sig = piece_signature(cand)
    diff_bonus = sum(1 for x, y in zip(prev_sig, cand_sig) if x != y)
    score += diff_bonus * 5

    return score


def reshuffle_positions(data):
    if len(data) <= 2:
        return list(data), {"fallback_appends": 0}

    remaining = list(data)
    output = [remaining.pop(0)]
    history = []
    fallback_appends = 0

    while remaining:
        prev = output[-1]

        best_idx = None
        best_score = -10**9

        for idx, cand in enumerate(remaining):
            score = transition_score(prev, cand, history)
            if score > best_score:
                best_score = score
                best_idx = idx

        if best_idx is None or best_score <= -10**8:
            best_idx = 0
            cand = remaining.pop(best_idx)
            if output:
                history.append(change_signature(output[-1], cand))
            output.append(cand)
            fallback_appends += 1
            continue

        cand = remaining.pop(best_idx)
        history.append(change_signature(output[-1], cand))
        output.append(cand)

    return output, {"fallback_appends": fallback_appends}


def analyze_sequence(seq):
    stats = Counter()

    if not seq:
        return stats

    exact_repeats = 0
    sigs = []

    for i in range(1, len(seq)):
        prev = seq[i - 1]
        cur = seq[i]
        sig = change_signature(prev, cur)
        sigs.append(sig)

        stats[f"change_{len(sig)}"] += 1
        label = "+".join(sig) if sig else "NONE"
        stats[f"sig_{label}"] += 1

        if piece_signature(prev) == piece_signature(cur):
            exact_repeats += 1

    triple_repeat = 0
    for i in range(2, len(sigs)):
        if sigs[i] == sigs[i - 1] == sigs[i - 2]:
            triple_repeat += 1

    stats["exact_repeats"] = exact_repeats
    stats["triple_repeat_same_sig"] = triple_repeat
    return stats


def validate_file_homogeneity(data):
    mate_distance_values = set()
    bk_squares = set()

    for pos in data:
        md = pos.get("mate_distance", None)
        mate_distance_values.add(md)

        fen = pos.get("fen")
        if fen:
            bk_squares.add(get_black_king_square_from_fen(fen))

    def md_sort_key(x):
        return (x is None, x if isinstance(x, int) else 999999)

    mate_distances = sorted(mate_distance_values, key=md_sort_key)
    bk_squares = sorted(bk_squares)

    return mate_distances, bk_squares


def main():
    files = sorted(glob.glob(os.path.join(INPUT_FOLDER, "*.json")))

    grand = Counter()
    warnings = []

    print(f"Found files: {len(files)}")

    for file_idx, path in enumerate(files, start=1):
        name = os.path.basename(path)

        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        mate_distances, bk_squares = validate_file_homogeneity(data)

        if len(mate_distances) > 1:
            warnings.append(f"{name}: mixed mate_distance {mate_distances}")
        if len(bk_squares) > 1:
            warnings.append(f"{name}: mixed black king squares {bk_squares}")

        reshuffled, extra = reshuffle_positions(data)
        stats = analyze_sequence(reshuffled)

        out_path = os.path.join(OUTPUT_FOLDER, name)
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(reshuffled, f, indent=2, ensure_ascii=False)

        print(f"\n[{file_idx}/{len(files)}] {name}")
        print(f"  positions: {len(data)}")
        print(f"  mate_distance values: {mate_distances}")
        print(f"  black king squares:   {bk_squares}")
        print(f"  transitions with 2 changes: {stats.get('change_2', 0)}")
        print(f"  transitions with 3 changes: {stats.get('change_3', 0)}")
        print(f"  exact repeats:             {stats.get('exact_repeats', 0)}")
        print(f"  triple same-signature:     {stats.get('triple_repeat_same_sig', 0)}")
        print(f"  fallback appends:          {extra['fallback_appends']}")
        print(f"  wrote: {out_path}")

        grand["files"] += 1
        grand["positions"] += len(data)
        grand["change_2"] += stats.get("change_2", 0)
        grand["change_3"] += stats.get("change_3", 0)
        grand["exact_repeats"] += stats.get("exact_repeats", 0)
        grand["triple_repeat_same_sig"] += stats.get("triple_repeat_same_sig", 0)
        grand["fallback_appends"] += extra["fallback_appends"]

    print("\n=== GRAND TOTAL ===")
    for k, v in sorted(grand.items()):
        print(f"{k}: {v}")

    if warnings:
        print("\n=== WARNINGS ===")
        for w in warnings:
            print(w)
    else:
        print("\n=== WARNINGS ===")
        print("none")


if __name__ == "__main__":
    main()