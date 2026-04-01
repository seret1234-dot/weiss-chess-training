import json
import random
from pathlib import Path

import chess

# =========================
# Config
# =========================
OUTPUT_DIR = Path(r"C:\Users\Ariel\chess-trainer\bn_phase2_typical")
POSITIONS_PER_TARGET = 300
SEED = 42

TARGETS = ["h8", "g8", "f8", "f7"]

# Candidate zones for "typical" phase-2 transfer positions.
# These are intentionally biased toward the top-right / transfer corridor.
CANDIDATE_SQUARES = {
    "h8": {
        "wk": ["f6", "g6", "h6", "f7", "g7"],
        "wn": ["e6", "f5", "g5", "e7", "f7", "g6", "h6"],
        "wb": ["d3", "e4", "f5", "g6", "h7", "c4", "d5", "e6", "f7"],
    },
    "g8": {
        "wk": ["e6", "f6", "g6", "h6", "e7", "f7", "h7"],
        "wn": ["d6", "e5", "f5", "h5", "e7", "f6", "h6"],
        "wb": ["c4", "d5", "e6", "f7", "h7", "d3", "e4", "f5", "g6"],
    },
    "f8": {
        "wk": ["d6", "e6", "f6", "g6", "d7", "e7", "g7"],
        "wn": ["d5", "e5", "g5", "h6", "d7", "e6", "g6"],
        "wb": ["b4", "c5", "d6", "e7", "g7", "h6", "c2", "d3", "e4", "f5"],
    },
    "f7": {
        "wk": ["d5", "e5", "f5", "g5", "d6", "e6", "g6", "d7", "e7"],
        "wn": ["d4", "e5", "g5", "h6", "d6", "e7", "g7"],
        "wb": ["b3", "c4", "d5", "e6", "g6", "h5", "c2", "d3", "e4", "f5"],
    },
}

random.seed(SEED)


# =========================
# Helpers
# =========================
def sq(name: str) -> chess.Square:
    return chess.parse_square(name)


def manhattan(a: chess.Square, b: chess.Square) -> int:
    return abs(chess.square_file(a) - chess.square_file(b)) + abs(chess.square_rank(a) - chess.square_rank(b))


def find_piece(board: chess.Board, piece_type: chess.PieceType, color: chess.Color):
    for square, piece in board.piece_map().items():
        if piece.piece_type == piece_type and piece.color == color:
            return square
    return None


def is_dark_square(square: chess.Square) -> bool:
    file_i = chess.square_file(square)
    rank_i = chess.square_rank(square)
    return (file_i + rank_i) % 2 == 1


def bishop_color_ok(board: chess.Board) -> bool:
    """Require bishop to be dark-squared so the correct mating corner is h8."""
    wb = find_piece(board, chess.BISHOP, chess.WHITE)
    if wb is None:
        return False
    return is_dark_square(wb)


def legal_bn_position(board: chess.Board) -> bool:
    if not board.is_valid():
        return False
    if board.turn != chess.WHITE:
        return False
    if board.is_check():
        return False
    if board.is_checkmate():
        return False
    if board.is_stalemate():
        return False
    return True


def mobility_score(board: chess.Board) -> int:
    """
    Count black king legal moves by switching side to move temporarily.
    We want some resistance, not zero and not too many.
    """
    temp = board.copy(stack=False)
    temp.turn = chess.BLACK
    return len(list(temp.legal_moves))


def typical_phase2_ok(board: chess.Board, target_bk: str) -> bool:
    wk = find_piece(board, chess.KING, chess.WHITE)
    bk = find_piece(board, chess.KING, chess.BLACK)
    wn = find_piece(board, chess.KNIGHT, chess.WHITE)
    wb = find_piece(board, chess.BISHOP, chess.WHITE)

    if None in (wk, bk, wn, wb):
        return False

    if chess.square_name(bk) != target_bk:
        return False

    # Keep dark-squared bishop so h8 is the final mating corner.
    if not bishop_color_ok(board):
        return False

    # White king should be near enough to matter, but not adjacent illegally.
    wk_dist = manhattan(wk, bk)
    if wk_dist < 2 or wk_dist > 4:
        return False

    # Knight should be active and near the action.
    if manhattan(wn, bk) > 4:
        return False

    # Bishop should participate; don't allow it to be too far.
    if manhattan(wb, bk) > 6:
        return False

    # Avoid immediate trivials / dead positions:
    # black should usually have 1-3 king moves in these transfer positions.
    mob = mobility_score(board)
    if mob < 1 or mob > 3:
        return False

    # Require the knight or bishop to attack squares near the king area.
    attacked = board.attacks(wn) | board.attacks(wb)
    neighborhood = chess.SquareSet(chess.BB_KING_ATTACKS[bk]) | chess.SquareSet([bk])
    pressure = len(attacked & neighborhood)
    if pressure < 2:
        return False

    return True


def build_board(wk_name: str, wn_name: str, wb_name: str, bk_name: str):
    squares = [wk_name, wn_name, wb_name, bk_name]
    if len(set(squares)) < 4:
        return None

    board = chess.Board(None)
    board.set_piece_at(sq(wk_name), chess.Piece(chess.KING, chess.WHITE))
    board.set_piece_at(sq(wn_name), chess.Piece(chess.KNIGHT, chess.WHITE))
    board.set_piece_at(sq(wb_name), chess.Piece(chess.BISHOP, chess.WHITE))
    board.set_piece_at(sq(bk_name), chess.Piece(chess.KING, chess.BLACK))
    board.turn = chess.WHITE

    if not legal_bn_position(board):
        return None
    return board


def generate_for_target(target_bk: str, limit: int):
    cfg = CANDIDATE_SQUARES[target_bk]

    extra_pool = {
        "wk": ["e5", "f5", "g5", "h5", "d6", "e6", "f6", "g6", "h6", "d7", "e7", "f7", "g7", "h7"],
        "wn": ["c5", "d5", "e5", "f5", "g5", "h5", "c6", "d6", "e6", "f6", "g6", "h6", "d7", "e7", "f7", "g7"],
        "wb": ["b2", "c3", "d4", "e5", "f6", "g7", "h8", "b4", "c5", "d6", "e7", "f8", "c1", "d2", "e3", "f4", "g5", "h6"],
    }

    wk_candidates = list(dict.fromkeys(cfg["wk"] + extra_pool["wk"]))
    wn_candidates = list(dict.fromkeys(cfg["wn"] + extra_pool["wn"]))
    wb_candidates = list(dict.fromkeys(cfg["wb"] + extra_pool["wb"]))

    wk_candidates = [name for name in wk_candidates if name != target_bk]
    wn_candidates = [name for name in wn_candidates if name != target_bk]
    wb_candidates = [name for name in wb_candidates if name != target_bk and is_dark_square(sq(name))]

    all_triples = [(wk, wn, wb) for wk in wk_candidates for wn in wn_candidates for wb in wb_candidates]
    random.shuffle(all_triples)

    seen = set()
    out = []

    for wk_name, wn_name, wb_name in all_triples:
        board = build_board(wk_name, wn_name, wb_name, target_bk)
        if board is None:
            continue

        if not typical_phase2_ok(board, target_bk):
            continue

        key = board.board_fen()
        if key in seen:
            continue
        seen.add(key)

        out.append(
            {
                "fen": board.fen(),
                "bk": target_bk,
                "source": "generated_typical_phase2",
                "theme": "bn_phase2_transfer",
            }
        )

        if len(out) >= limit:
            break

    return out


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    summary = {}

    for target in TARGETS:
        positions = generate_for_target(target, POSITIONS_PER_TARGET)
        summary[target] = len(positions)

        out_path = OUTPUT_DIR / f"bn_phase2_typical_{target}.json"
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(positions, f, indent=2)

        print(f"{target}: wrote {len(positions)} -> {out_path.name}")

    merged = []
    for target in TARGETS:
        p = OUTPUT_DIR / f"bn_phase2_typical_{target}.json"
        with open(p, "r", encoding="utf-8") as f:
            merged.extend(json.load(f))

    merged_path = OUTPUT_DIR / "bn_phase2_typical_all.json"
    with open(merged_path, "w", encoding="utf-8") as f:
        json.dump(merged, f, indent=2)

    print("\nSummary:")
    for target in TARGETS:
        print(f"  {target}: {summary[target]}")
    print(f"  total: {len(merged)}")
    print(f"\nMerged file: {merged_path}")


if __name__ == "__main__":
    main()