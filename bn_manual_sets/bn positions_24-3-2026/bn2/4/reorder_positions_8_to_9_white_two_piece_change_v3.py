import os
import json
import random
from typing import List, Dict, Optional

INPUT_FOLDER = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4\8"
OUTPUT_FOLDER = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4\9"

SEED = 42
LOCAL_REPAIR_PASSES = 5
SEARCH_WINDOW = 12

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


def sig_score(sig: str, prev_sig: Optional[str]) -> int:
    changed = len(sig)
    score = 0

    # Priority 1: do not repeat same signature
    if prev_sig is not None:
        if sig == prev_sig:
            score -= 10000
        else:
            score += 3000

    # Priority 2: require 2+ piece changes
    if changed >= 2:
        score += 2000
    else:
        score -= 5000

    # Priority 3: prefer 3 changes over 2
    if changed == 3:
        score += 150
    elif changed == 2:
        score += 60

    return score


def greedy_reorder(data: List[dict], rng: random.Random) -> List[dict]:
    if len(data) <= 2:
        return list(data)

    remaining = list(data)
    rng.shuffle(remaining)
    ordered = [remaining.pop(0)]
    prev_sig = None

    while remaining:
        prev_pos = ordered[-1]

        if len(remaining) <= SEARCH_WINDOW:
            candidate_indices = list(range(len(remaining)))
        else:
            candidate_indices = rng.sample(range(len(remaining)), SEARCH_WINDOW)

        best_score = None
        best_indices = []

        for i in candidate_indices:
            sig = change_signature(prev_pos, remaining[i])
            score = sig_score(sig, prev_sig)

            if best_score is None or score > best_score:
                best_score = score
                best_indices = [i]
            elif score == best_score:
                best_indices.append(i)

        pick_i = rng.choice(best_indices)
        picked = remaining.pop(pick_i)
        prev_sig = change_signature(prev_pos, picked)
        ordered.append(picked)

    return ordered


def transition_stats(data: List[dict]) -> Dict[str, int]:
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


def local_score_around(arr: List[dict], start: int, end: int) -> int:
    start = max(0, start)
    end = min(len(arr) - 1, end)

    if end - start < 1:
        return 0

    total = 0
    prev_sig = None
    for i in range(start, end):
        sig = change_signature(arr[i], arr[i + 1])
        total += sig_score(sig, prev_sig)
        prev_sig = sig
    return total


def try_swap(arr: List[dict], i: int, j: int) -> bool:
    left = max(0, min(i, j) - 2)
    right = min(len(arr) - 1, max(i, j) + 2)

    old_score = local_score_around(arr, left, right)

    arr[i], arr[j] = arr[j], arr[i]
    new_score = local_score_around(arr, left, right)

    if new_score > old_score:
        return True

    arr[i], arr[j] = arr[j], arr[i]
    return False


def repair_repeats(arr: List[dict]) -> List[dict]:
    if len(arr) <= 3:
        return arr

    arr = list(arr)

    for _ in range(LOCAL_REPAIR_PASSES):
        changed_any = False
        prev_sig = None
        i = 0

        while i < len(arr) - 1:
            sig = change_signature(arr[i], arr[i + 1])

            bad_repeat = prev_sig is not None and sig == prev_sig
            bad_under_two = len(sig) < 2

            if bad_repeat or bad_under_two:
                fixed = False

                for j in range(i + 2, min(len(arr), i + 2 + SEARCH_WINDOW)):
                    if try_swap(arr, i + 1, j):
                        fixed = True
                        changed_any = True
                        break

                if not fixed and i >= 1:
                    for j in range(max(1, i - SEARCH_WINDOW), i):
                        if try_swap(arr, i, j):
                            fixed = True
                            changed_any = True
                            break

            prev_sig = change_signature(arr[i], arr[i + 1])
            i += 1

        if not changed_any:
            break

    return arr


def reorder_positions(data: List[dict], rng: random.Random) -> List[dict]:
    ordered = greedy_reorder(data, rng)
    ordered = repair_repeats(ordered)
    return ordered


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
        stats = transition_stats(reordered)

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