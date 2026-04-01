import chess
import json

def generate_positions(bk_square):
    results = []

    for wk in chess.SQUARES:
        for n in chess.SQUARES:
            for b in chess.SQUARES:

                if len({wk, n, b, bk_square}) != 4:
                    continue

                board = chess.Board(None)

                board.set_piece_at(wk, chess.Piece(chess.KING, chess.WHITE))
                board.set_piece_at(n, chess.Piece(chess.KNIGHT, chess.WHITE))
                board.set_piece_at(b, chess.Piece(chess.BISHOP, chess.WHITE))
                board.set_piece_at(bk_square, chess.Piece(chess.KING, chess.BLACK))

                board.turn = chess.WHITE

                if not board.is_valid():
                    continue

                if board.is_checkmate():
                    continue

                if board.is_stalemate():
                    continue

                # avoid immediate check (want longer mates)
                if board.is_check():
                    continue

                results.append({
                    "fen": board.fen(),
                    "bk": chess.square_name(bk_square)
                })

    return results


# Generate F7
f7_positions = generate_positions(chess.F7)
print("F7:", len(f7_positions))

with open("bn_phase2_f7.json", "w") as f:
    json.dump(f7_positions, f)


# Generate E7
e7_positions = generate_positions(chess.E7)
print("E7:", len(e7_positions))

with open("bn_phase2_e7.json", "w") as f:
    json.dump(e7_positions, f)