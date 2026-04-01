import os
import json
import random
from typing import List, Dict, Tuple, Optional

INPUT_FOLDER = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4\8"
OUTPUT_FOLDER = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4\9"

SEED = 42

# how far ahead to search when picking next item
LOOKAHEAD_CANDIDATES = 12

# local improvement passes after greedy build
LOCAL_SWAP_PASSES = 3

os.makedirs(OUTPUT_FOLDER, exist_ok=True)


def parse_fen_piece_squares(fen: str) -> Dict[str, str]:
    parts = fen.split()
    board = parts[0]
    ranks = board.split("/")

    out = {}
    for r_index, rank in enumerate(ranks):
        file_idx = 0
        for ch in rank:
            if ch.isdigit():
                file_idx += int(ch)
            else:
                sq = f"{'abcdefgh'[file_idx]}{8 - r_index}"
                out[ch] = sq
                file_idx += 1
    return out


def get_white_squares(pos: dict) -> Dict[str, str]:
    wk = pos.get("white_king")
    wn = pos.get("white_knight")
    wb = pos.get("white_bishop")

    if wk and wn and wb:
        return {"K": wk, "N": wn, "B": wb}

    fen = pos.get("fen")
    if not fen:
        return {"K": "?", "N": "?", "B": "?"}

    mp = parse_fen_piece_squares(fen)
    return {
        "K": mp.get("K", "?"),
        "N": mp.get("N", "?"),
        "B": mp.get("B", "?"),
    }


def change_signature(pos_a: dict, pos_b: dict) -> str:
    a = get_white_squares(pos_a)
    b = get_white_squares(pos_b)

    changed = []
    if a["B"] != b["B"]:
        changed.append("B")
    if a["K"] != b["K"]:
        changed.append("K")
    if a["N"] != b["N"]:
        changed.append("N")

    return "".join(changed)


def pair_score(sig: str, prev_sig: Optional[str]) -> int:
    changed_count = len(sig)

    score = 0

    # Very strong penalty if fewer than 2 white pieces changed
    if changed_count >= 2:
        score += 1000
    else:
        score -= 10000

    # Prefer 3-piece change over 2-piece change
    if changed_count == 3:
        score += 120
    elif changed_count == 2:
        score += 60

    # Strong penalty for repeating same signature
    if prev_sig is not None and sig == prev_sig:
        score -= 700
    else:
        score += 90

    # Slight variety preference among 2-piece signatures
    if sig in ("BK", "BN", "KN"):
        score += 10

    return score


def best_next_index(
    prev_pos: dict,
    remaining: List[dict],
    prev_sig: Optional[str],
    rng: random.Random,
) -> int:
    best_score = None
    best_indices = []

    limit = min(len(remaining), LOOKAHEAD_CANDIDATES if len(remaining) > LOOKAHEAD_CANDIDATES else len(remaining))

    # sample or use all
    if len(remaining) <= limit:
        indices = list(range(len(remaining)))
    else:
        indices = rng.sample(range(len(remaining)), limit)

    for i in indices:
        cand = remaining[i]
        sig = change_signature(prev_pos, cand)
        score = pair_score(sig, prev_sig)

        if best_score is None or score > best_score:
            best_score = score
            best_indices = [i]
        elif score == best_score:
            best_indices.append(i)

    return rng.choice(best_indices)


def greedy_reorder(data: List[dict], rng: random.Random) -> List[dict]:
    if len(data) <= 2:
        return list(data)

    remaining = list(data)
    rng.shuffle(remaining)

    ordered = [remaining.pop(0)]
    prev_sig = None

    while remaining:
        i = best_next_index(ordered[-1], remaining, prev_sig, rng)
        nxt = remaining.pop(i)
        prev_sig = change_signature(ordered[-1], nxt)
        ordered.append(nxt)

    return ordered


def total_order_score(data: List[dict]) -> int:
    if len(data) <= 1:
        return 0

    total = 0
    prev_sig = None
    for i in range(len(data) - 1):
        sig = change_signature(data[i], data[i + 1])
        total += pair_score(sig, prev_sig)
        prev_sig = sig
    return total


def local_swap_improve(data: List[dict]) -> List[dict]:
    if len(data) <= 3:
        return data

    arr = list(data)
    improved = True
    passes = 0

    while improved and passes < LOCAL_SWAP_PASSES:
        improved = False
        passes += 1

        # try swapping adjacent items in the middle
        for i in range(1, len(arr) - 1):
            old_score = total_order_score(arr[max(0, i - 2): min(len(arr), i + 3)])

            candidate = list(arr)
            candidate[i], candidate[i + 1] = candidate[i + 1], candidate[i]

            new_score = total_order_score(candidate[max(0, i - 2): min(len(candidate), i + 3)])

            if new_score > old_score:
                arr = candidate
                improved = True

        # try one-step jumps
        for i in range(1, len(arr) - 2):
            old_score = total_order_score(arr[max(0, i - 2): min(len(arr), i + 4)])

            candidate = list(arr)
            candidate[i], candidate[i + 2] = candidate[i + 2], candidate[i]

            new_score = total_order_score(candidate[max(0, i - 2): min(len(candidate), i + 4)])

            if new_score > old_score:
                arr = candidate
                improved = True

    return arr


def reorder_positions(data: List[dict], rng: random.Random) -> List[dict]:
    ordered = greedy_reorder(data, rng)
    ordered = local_swap_improve(ordered)
    return ordered


def analyze_order(data: List[dict]) -> Dict[str, int]:
    if len(data) <= 1:
        return {
            "transitions": 0,
            "good_two_plus": 0,
            "bad_under_two": 0,
            "repeat_sig": 0,
            "three_changed": 0,
        }

    good_two_plus = 0
    bad_under_two = 0
    repeat_sig = 0
    three_changed = 0
    prev_sig = None

    for i in range(len(data) - 1):
        sig = change_signature(data[i], data[i + 1])

        if len(sig) >= 2:
            good_two_plus += 1
        else:
            bad_under_two += 1

        if len(sig) == 3:
            three_changed += 1

        if prev_sig is not None and sig == prev_sig:
            repeat_sig += 1

        prev_sig = sig

    return {
        "transitions": len(data) - 1,
        "good_two_plus": good_two_plus,
        "bad_under_two": bad_under_two,
        "repeat_sig": repeat_sig,
        "three_changed": three_changed,
    }


def main():
    rng = random.Random(SEED)

    files = [f for f in os.listdir(INPUT_FOLDER) if f.endswith(".json")]
    files.sort()

    total_files = 0
    total_positions = 0
    total_transitions = 0
    total_good = 0
    total_bad = 0
    total_repeat = 0
    total_three = 0

    for filename in files:
        src = os.path.join(INPUT_FOLDER, filename)
        dst = os.path.join(OUTPUT_FOLDER, filename)

        with open(src, "r", encoding="utf-8") as f:
            data = json.load(f)

        if not isinstance(data, list):
            print(f"[SKIP] {filename} (not a list)")
            continue

        reordered = reorder_positions(data, rng)
        stats = analyze_order(reordered)

        with open(dst, "w", encoding="utf-8") as f:
            json.dump(reordered, f, ensure_ascii=False, indent=2)

        total_files += 1
        total_positions += len(reordered)
        total_transitions += stats["transitions"]
        total_good += stats["good_two_plus"]
        total_bad += stats["bad_under_two"]
        total_repeat += stats["repeat_sig"]
        total_three += stats["three_changed"]

        print(
            f"[WRITE] {filename}: "
            f"positions={len(reordered)} | "
            f"good_2plus={stats['good_two_plus']}/{stats['transitions']} | "
            f"three_changed={stats['three_changed']} | "
            f"repeat_sig={stats['repeat_sig']}"
        )

    print("\n=== FINISHED ===")
    print("read from:", INPUT_FOLDER)
    print("wrote to:", OUTPUT_FOLDER)
    print("files:", total_files)
    print("positions:", total_positions)
    print("transitions:", total_transitions)
    print("good 2+ white-piece changes:", total_good)
    print("bad <2 white-piece changes:", total_bad)
    print("3-piece changes:", total_three)
    print("repeated change signatures:", total_repeat)
    print("source files unchanged: YES")


if __name__ == "__main__":
    main()