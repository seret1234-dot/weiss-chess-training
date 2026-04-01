import json
import random
from pathlib import Path
from collections import defaultdict
import chess

OUTPUT_FILE = Path("bn_backrank_strip_sampled.json")

RANDOM_SEED = 42

# Black king allowed squares on back rank
BLACK_KING_SQUARES = [
    chess.H8, chess.G8, chess.F8, chess.E8, chess.D8, chess.C8,
]

# White pieces must stay near the black king
WHITE_KING_MAX_KING_DISTANCE = 3
WHITE_KNIGHT_MAX_KING_DISTANCE = 3
WHITE_BISHOP_MAX_KING_DISTANCE = 4

# Knight should control at least one relevant square near the black king
CONTROL_TARGET_MAX_DISTANCE = 2

# Sample cap per structural bucket
# bucket = (blackKing, whiteKing, whiteKnight)
MAX_BISHOPS_PER_BUCKET = 6


def square_name(sq: int) -> str:
    return chess.square_name(sq)


def king_distance(sq1: int, sq2: int) -> int:
    f1, r1 = chess.square_file(sq1), chess.square_rank(sq1)
    f2, r2 = chess.square_file(sq2), chess.square_rank(sq2)
    return max(abs(f1 - f2), abs(r1 - r2))


def knight_controls(square_from: int, target: int) -> bool:
    return bool(chess.BB_KNIGHT_ATTACKS[square_from] & chess.BB_SQUARES[target])


def bishop_is_light_square(square: int) -> bool:
    file = chess.square_file(square)
    rank = chess.square_rank(square)
    return (file + rank) % 2 == 0


def kings_not_touching(wk_sq: int, bk_sq: int) -> bool:
    return king_distance(wk_sq, bk_sq) > 1


def build_board(wk_sq: int, wn_sq: int, wb_sq: int, bk_sq: int) -> chess.Board:
    board = chess.Board(None)
    board.clear()

    board.set_piece_at(wk_sq, chess.Piece(chess.KING, chess.WHITE))
    board.set_piece_at(wn_sq, chess.Piece(chess.KNIGHT, chess.WHITE))
    board.set_piece_at(wb_sq, chess.Piece(chess.BISHOP, chess.WHITE))
    board.set_piece_at(bk_sq, chess.Piece(chess.KING, chess.BLACK))

    board.turn = chess.WHITE
    board.castling_rights = 0
    board.ep_square = None

    return board


def normalize_fen4(board: chess.Board) -> str:
    return " ".join(board.fen().split()[:4])


def nearby_squares(center_sq: int, max_dist: int):
    return [
        sq for sq in chess.SQUARES
        if king_distance(sq, center_sq) <= max_dist
    ]


def control_targets_for_black_king(bk_sq: int):
    return [
        sq for sq in chess.SQUARES
        if sq != bk_sq and 1 <= king_distance(sq, bk_sq) <= CONTROL_TARGET_MAX_DISTANCE
    ]


def main():
    random.seed(RANDOM_SEED)

    print("Black king squares:")
    print([square_name(sq) for sq in BLACK_KING_SQUARES])

    bishop_candidates_by_bucket = defaultdict(list)

    for bk_sq in BLACK_KING_SQUARES:
        target_squares = control_targets_for_black_king(bk_sq)

        wk_candidates = [
            sq for sq in nearby_squares(bk_sq, WHITE_KING_MAX_KING_DISTANCE)
            if sq != bk_sq and kings_not_touching(sq, bk_sq)
        ]

        wn_candidates = [
            sq for sq in nearby_squares(bk_sq, WHITE_KNIGHT_MAX_KING_DISTANCE)
            if sq != bk_sq
        ]

        wb_candidates = [
            sq for sq in nearby_squares(bk_sq, WHITE_BISHOP_MAX_KING_DISTANCE)
            if sq != bk_sq
        ]

        print(f"\nBK {square_name(bk_sq)}")
        print(f"  WK candidates: {len(wk_candidates)}")
        print(f"  WN candidates: {len(wn_candidates)}")
        print(f"  WB candidates: {len(wb_candidates)}")
        print(f"  Control targets: {[square_name(sq) for sq in target_squares]}")

        for wk_sq in wk_candidates:
            for wn_sq in wn_candidates:
                if wn_sq == wk_sq:
                    continue

                controlled_targets = [
                    target_sq for target_sq in target_squares
                    if knight_controls(wn_sq, target_sq)
                ]

                if not controlled_targets:
                    continue

                for wb_sq in wb_candidates:
                    if wb_sq in (wk_sq, wn_sq):
                        continue

                    board = build_board(wk_sq, wn_sq, wb_sq, bk_sq)

                    if not board.is_valid():
                        continue

                    fen4 = normalize_fen4(board)

                    bucket_key = (
                        square_name(bk_sq),
                        square_name(wk_sq),
                        square_name(wn_sq),
                    )

                    bishop_candidates_by_bucket[bucket_key].append({
                        "fen": fen4,
                        "bk_sq": bk_sq,
                        "wk_sq": wk_sq,
                        "wn_sq": wn_sq,
                        "wb_sq": wb_sq,
                        "controlled_targets": [square_name(sq) for sq in controlled_targets],
                    })

    print(f"\nTotal structural buckets: {len(bishop_candidates_by_bucket)}")

    sampled_positions = {}

    for bucket_key, candidates in bishop_candidates_by_bucket.items():
        random.shuffle(candidates)
        chosen = candidates[:MAX_BISHOPS_PER_BUCKET]

        for item in chosen:
            fen = item["fen"]

            if fen not in sampled_positions:
                sampled_positions[fen] = {
                    "fen": fen,
                    "whiteKing": square_name(item["wk_sq"]),
                    "blackKing": square_name(item["bk_sq"]),
                    "whiteKnight": square_name(item["wn_sq"]),
                    "whiteBishop": square_name(item["wb_sq"]),
                    "controlledSquares": sorted(set(item["controlled_targets"])),
                    "bishopColor": "light" if bishop_is_light_square(item["wb_sq"]) else "dark",
                    "phase": "backrank_strip_sampled",
                }
            else:
                existing = set(sampled_positions[fen]["controlledSquares"])
                existing.update(item["controlled_targets"])
                sampled_positions[fen]["controlledSquares"] = sorted(existing)

    results = list(sampled_positions.values())
    results.sort(key=lambda x: (
        x["blackKing"],
        x["whiteKing"],
        x["whiteKnight"],
        x["whiteBishop"],
        x["fen"],
    ))

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    by_black_king = defaultdict(int)
    by_white_king = defaultdict(int)
    multi_control = 0

    for item in results:
        by_black_king[item["blackKing"]] += 1
        by_white_king[item["whiteKing"]] += 1
        if len(item["controlledSquares"]) > 1:
            multi_control += 1

    print("\n=== SUMMARY ===")
    print(f"Max bishops per bucket: {MAX_BISHOPS_PER_BUCKET}")
    print(f"Unique sampled positions: {len(results)}")
    print(f"Positions controlling 2+ target squares: {multi_control}")
    print(f"Saved to: {OUTPUT_FILE}")

    print("\nBy black king square:")
    for sq in sorted(by_black_king):
        print(f"  {sq}: {by_black_king[sq]}")

    print("\nTop white king counts:")
    for sq, cnt in sorted(by_white_king.items(), key=lambda x: (-x[1], x[0]))[:20]:
        print(f"  {sq}: {cnt}")


if __name__ == "__main__":
    main()