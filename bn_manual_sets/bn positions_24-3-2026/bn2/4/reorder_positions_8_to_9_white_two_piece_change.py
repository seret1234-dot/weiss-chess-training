import os
import re
import json
import random

INPUT_FOLDER = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4\8"
OUTPUT_FOLDER = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4\9"

SEED = 42

os.makedirs(OUTPUT_FOLDER, exist_ok=True)


def parse_fen_piece_squares(fen: str):
    """
    Returns dict like:
    {'K': 'c6', 'N': 'e5', 'B': 'h3', 'k': 'a8'}
    """
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


def get_white_squares(pos: dict):
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


def change_signature(pos_a: dict, pos_b: dict):
    """
    Returns string like:
      'BN', 'BK', 'KN', 'BKN', 'K', etc.
    Order always B, K, N for stable naming.
    """
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


def transition_score(prev_pos, cand_pos, prev_sig):
    """
    Higher is better.
    Priority:
    1) 3 white pieces changed
    2) 2 white pieces changed
    3) avoid same change signature as previous transition
    """
    sig = change_signature(prev_pos, cand_pos)
    changed_count = len(sig)

    score = 0

    # Strong preference for at least 2 pieces changing
    if changed_count >= 2:
        score += 100
    else:
        score -= 1000

    # Prefer 3 over 2
    score += changed_count * 10

    # Avoid repeating same signature as previous transition
    if prev_sig is not None and sig == prev_sig:
        score -= 50
    else:
        score += 15

    return score, sig


def reorder_positions(data, rng):
    """
    Greedy reorder:
    - start from random item
    - always choose next remaining item with best transition score
    """
    if len(data) <= 2:
        return list(data)

    remaining = list(data)
    rng.shuffle(remaining)

    ordered = [remaining.pop(0)]
    prev_sig = None

    while remaining:
        prev_pos = ordered[-1]

        best_score = None
        best_indices = []
        best_sig = None

        for i, cand in enumerate(remaining):
            score, sig = transition_score(prev_pos, cand, prev_sig)

            if best_score is None or score > best_score:
                best_score = score
                best_indices = [i]
                best_sig = sig
            elif score == best_score:
                best_indices.append(i)

        pick_i = rng.choice(best_indices)
        picked = remaining.pop(pick_i)

        prev_sig = change_signature(prev_pos, picked)
        ordered.append(picked)

    return ordered


def analyze_order(data):
    """
    Returns stats on consecutive transitions.
    """
    if len(data) <= 1:
        return {
            "transitions": 0,
            "good_two_plus": 0,
            "bad_under_two": 0,
            "repeat_sig": 0,
        }

    good_two_plus = 0
    bad_under_two = 0
    repeat_sig = 0

    prev_sig = None

    for i in range(len(data) - 1):
        sig = change_signature(data[i], data[i + 1])

        if len(sig) >= 2:
            good_two_plus += 1
        else:
            bad_under_two += 1

        if prev_sig is not None and sig == prev_sig:
            repeat_sig += 1

        prev_sig = sig

    return {
        "transitions": len(data) - 1,
        "good_two_plus": good_two_plus,
        "bad_under_two": bad_under_two,
        "repeat_sig": repeat_sig,
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

        print(
            f"[WRITE] {filename}: "
            f"positions={len(reordered)} | "
            f"good_2plus={stats['good_two_plus']}/{stats['transitions']} | "
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
    print("repeated change signatures:", total_repeat)
    print("source files unchanged: YES")


if __name__ == "__main__":
    main()