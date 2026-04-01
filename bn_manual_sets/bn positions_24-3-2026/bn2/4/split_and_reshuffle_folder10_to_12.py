import glob
import json
import os
import random
from collections import Counter, defaultdict

import chess

INPUT_FOLDER = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4\10"
OUTPUT_FOLDER = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4\12"

os.makedirs(OUTPUT_FOLDER, exist_ok=True)

RANDOM_SEED = 42
random.seed(RANDOM_SEED)


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


def exact_same_position(a, b):
    return piece_signature(a) == piece_signature(b)


def transition_score(prev, cand, recent_sigs):
    if exact_same_position(prev, cand):
        return -10**9

    sig = change_signature(prev, cand)
    cnt = len(sig)

    if cnt < 2:
        return -10**9

    score = 0

    if cnt == 3:
        score += 120
    elif cnt == 2:
        score += 80

    if recent_sigs:
        if sig == recent_sigs[-1]:
            score -= 50
    if len(recent_sigs) >= 2:
        if sig == recent_sigs[-1] == recent_sigs[-2]:
            score -= 200

    return score


def reshuffle_group(data):
    if len(data) <= 2:
        return list(data), {"fallback_appends": 0}

    remaining = list(data)
    random.shuffle(remaining)

    out = [remaining.pop(0)]
    recent_sigs = []
    fallback_appends = 0

    while remaining:
        prev = out[-1]

        scored = []
        for idx, cand in enumerate(remaining):
            scored.append((transition_score(prev, cand, recent_sigs), idx, cand))

        scored.sort(key=lambda x: x[0], reverse=True)

        chosen = None
        chosen_idx = None
        for score, idx, cand in scored[:10]:
            if score > -10**8:
                chosen = cand
                chosen_idx = idx
                break

        if chosen is None:
            chosen_idx = 0
            chosen = remaining[chosen_idx]
            fallback_appends += 1

        remaining.pop(chosen_idx)
        recent_sigs.append(change_signature(out[-1], chosen))
        out.append(chosen)

    return out, {"fallback_appends": fallback_appends}


def analyze_sequence(seq):
    stats = Counter()
    if len(seq) <= 1:
        return stats

    sigs = []
    for i in range(1, len(seq)):
        prev = seq[i - 1]
        cur = seq[i]
        sig = change_signature(prev, cur)
        sigs.append(sig)

        stats[f"change_{len(sig)}"] += 1
        if exact_same_position(prev, cur):
            stats["exact_repeats"] += 1

    for i in range(2, len(sigs)):
        if sigs[i] == sigs[i - 1] == sigs[i - 2]:
            stats["triple_repeat_same_sig"] += 1

    return stats


def make_output_name(base_name, md, bk, index, total_groups):
    stem = base_name[:-5] if base_name.lower().endswith(".json") else base_name
    md_part = "md_none" if md is None else f"md{md}"
    bk_part = f"bk_{bk}"

    if total_groups == 1:
        return f"{stem}__{md_part}__{bk_part}.json"
    return f"{stem}__{md_part}__{bk_part}__part{index:02d}.json"


def main():
    files = sorted(glob.glob(os.path.join(INPUT_FOLDER, "*.json")))
    print(f"Found files: {len(files)}")

    grand = Counter()

    for file_idx, path in enumerate(files, start=1):
        name = os.path.basename(path)

        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        groups = defaultdict(list)
        missing_fen = 0

        for pos in data:
            md = pos.get("mate_distance", None)

            fen = pos.get("fen")
            if fen:
                bk = get_black_king_square_from_fen(fen)
            else:
                bk = "unknown"
                missing_fen += 1

            groups[(md, bk)].append(pos)

        sorted_keys = sorted(
            groups.keys(),
            key=lambda x: (str(x[1]), x[0] is None, -1 if x[0] is None else x[0])
        )

        print(f"\n[{file_idx}/{len(files)}] {name}")
        print(f"  input positions: {len(data)}")
        print(f"  subgroups: {len(sorted_keys)}")
        if missing_fen:
            print(f"  missing fen: {missing_fen}")

        for sub_idx, key in enumerate(sorted_keys, start=1):
            md, bk = key
            subgroup = groups[key]

            reshuffled, extra = reshuffle_group(subgroup)
            stats = analyze_sequence(reshuffled)

            out_name = make_output_name(name, md, bk, sub_idx, len(sorted_keys))
            out_path = os.path.join(OUTPUT_FOLDER, out_name)

            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(reshuffled, f, indent=2, ensure_ascii=False)

            print(
                f"  -> {out_name} | positions={len(subgroup)} "
                f"| md={md} | bk={bk} "
                f"| c2={stats.get('change_2', 0)} "
                f"| c3={stats.get('change_3', 0)} "
                f"| repeats={stats.get('exact_repeats', 0)} "
                f"| triple_sig={stats.get('triple_repeat_same_sig', 0)} "
                f"| fallback={extra['fallback_appends']}"
            )

            if sub_idx == 1:
                grand["input_files"] += 1
            grand["output_files"] += 1
            grand["positions"] += len(subgroup)
            grand["change_2"] += stats.get("change_2", 0)
            grand["change_3"] += stats.get("change_3", 0)
            grand["exact_repeats"] += stats.get("exact_repeats", 0)
            grand["triple_repeat_same_sig"] += stats.get("triple_repeat_same_sig", 0)
            grand["fallback_appends"] += extra["fallback_appends"]
            grand["missing_fen"] += sum(1 for p in subgroup if not p.get("fen"))

    print("\n=== GRAND TOTAL ===")
    for k, v in sorted(grand.items()):
        print(f"{k}: {v}")


if __name__ == "__main__":
    main()