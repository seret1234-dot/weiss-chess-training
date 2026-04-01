import json
import chess

INPUT_JSON = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bk_b8_mate7_reduced.json"

OUTPUT_JSON = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bk_b8_mate8_reduced.json"
REMOVED_JSON = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bk_b8_mate8_removed_similar.json"

BLACK_KING = chess.B8
CRITICAL_SQUARES = [chess.A7, chess.B7, chess.C7, chess.A8, chess.C8]


def bishop_controls_square(board, bishop_sq, target_sq):
    piece = board.piece_at(bishop_sq)
    if piece is None or piece.piece_type != chess.BISHOP:
        return False
    return board.is_attacked_by(chess.WHITE, target_sq) and target_sq != bishop_sq


def get_bishop_control_signature(board, bishop_sq):
    controlled = []
    for sq in CRITICAL_SQUARES:
        if bishop_controls_square(board, bishop_sq, sq):
            controlled.append(chess.square_name(sq))
    return tuple(controlled)


def bishop_distance_to_bk(bishop_sq):
    bf = chess.square_file(bishop_sq)
    br = chess.square_rank(bishop_sq)
    kf = chess.square_file(BLACK_KING)
    kr = chess.square_rank(BLACK_KING)
    return abs(bf - kf) + abs(br - kr)


def bestmove_value(item):
    return item.get("bestmove_uci") or ""


def make_signature(item):
    board = chess.Board(item["fen"])
    wk = item["white_king"]
    wn = item["white_knight"]
    wb = item["white_bishop"]
    bishop_sq = chess.parse_square(wb)

    bishop_control = get_bishop_control_signature(board, bishop_sq)

    return (
        item["mate_distance"],
        wk,
        wn,
        bestmove_value(item),
        bishop_control,
    )


def choose_better(a, b):
    a_sq = chess.parse_square(a["white_bishop"])
    b_sq = chess.parse_square(b["white_bishop"])

    a_dist = bishop_distance_to_bk(a_sq)
    b_dist = bishop_distance_to_bk(b_sq)

    if a_dist < b_dist:
        return a
    if b_dist < a_dist:
        return b

    if a["white_bishop"] < b["white_bishop"]:
        return a
    return b


def main():
    with open(INPUT_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)

    mate8 = [x for x in data if x.get("mate_distance") == 8]
    others = [x for x in data if x.get("mate_distance") != 8]

    print(f"Total positions in input: {len(data)}")
    print(f"Mate in 8 positions: {len(mate8)}")

    kept_by_signature = {}
    removed = []

    for item in mate8:
        sig = make_signature(item)

        if sig not in kept_by_signature:
            kept_by_signature[sig] = item
        else:
            old_item = kept_by_signature[sig]
            better = choose_better(old_item, item)

            if better is old_item:
                removed.append(item)
            else:
                removed.append(old_item)
                kept_by_signature[sig] = item

    reduced_mate8 = list(kept_by_signature.values())
    reduced_mate8.sort(key=lambda x: (x["white_king"], x["white_knight"], x["white_bishop"]))

    final_output = others + reduced_mate8
    final_output.sort(key=lambda x: (x["mate_distance"], x["white_king"], x["white_knight"], x["white_bishop"]))

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(final_output, f, indent=2, ensure_ascii=False)

    with open(REMOVED_JSON, "w", encoding="utf-8") as f:
        json.dump(removed, f, indent=2, ensure_ascii=False)

    print("=== FINISHED ===")
    print(f"Original mate in 8 count: {len(mate8)}")
    print(f"Reduced mate in 8 count: {len(reduced_mate8)}")
    print(f"Removed as similar: {len(removed)}")
    print(f"Saved reduced file to: {OUTPUT_JSON}")
    print(f"Saved removed file to: {REMOVED_JSON}")


if __name__ == "__main__":
    main()