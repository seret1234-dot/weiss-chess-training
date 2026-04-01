import json
import random
import chess
from pathlib import Path

OUTPUT_FILE = Path("bn_phase1_random_300.json")
RANDOM_SEED = 42
NUM_POSITIONS = 300

# Black king near center
CENTER_SQUARES = [
    chess.D5, chess.E5, chess.D4, chess.E4,
    chess.C5, chess.F5, chess.C4, chess.F4,
]

def king_distance(a, b):
    return max(
        abs(chess.square_file(a) - chess.square_file(b)),
        abs(chess.square_rank(a) - chess.square_rank(b))
    )

def random_square(exclude):
    while True:
        sq = random.choice(list(chess.SQUARES))
        if sq not in exclude:
            return sq

def build_random_position():
    while True:
        bk = random.choice(CENTER_SQUARES)

        wk = random_square({bk})
        if king_distance(wk, bk) <= 1:
            continue

        wn = random_square({bk, wk})
        wb = random_square({bk, wk, wn})

        board = chess.Board(None)
        board.clear()

        board.set_piece_at(wk, chess.Piece(chess.KING, chess.WHITE))
        board.set_piece_at(wn, chess.Piece(chess.KNIGHT, chess.WHITE))
        board.set_piece_at(wb, chess.Piece(chess.BISHOP, chess.WHITE))
        board.set_piece_at(bk, chess.Piece(chess.KING, chess.BLACK))

        board.turn = chess.WHITE
        board.castling_rights = 0
        board.ep_square = None

        if board.is_valid():
            return board

def main():
    random.seed(RANDOM_SEED)

    positions = []
    seen = set()

    while len(positions) < NUM_POSITIONS:
        board = build_random_position()
        fen = " ".join(board.fen().split()[:4])

        if fen in seen:
            continue

        seen.add(fen)

        positions.append({
            "fen": fen,
            "phase": "phase1",
            "type": "random_center"
        })

        if len(positions) % 25 == 0:
            print(f"Generated {len(positions)}/{NUM_POSITIONS}")

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(positions, f, indent=2)

    print(f"Generated {len(positions)} positions")
    print(f"Saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    main()