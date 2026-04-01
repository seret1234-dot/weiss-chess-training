import json
import os
import chess
import chess.engine
from chess import Board, square_name, SQUARES, square_file, square_rank

ENGINE_PATH = r"C:\Users\Ariel\chess-trainer\stockfish-windows-x86-64-avx2\stockfish\stockfish-windows-x86-64-avx2.exe"
ENGINE_DEPTH = 12
ENGINE_TIME_LIMIT = 0.15

BLACK_KING = chess.B8

OUTPUT_JSON = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bk_b8_typical_w_near_king_all_mates.json"

def is_light_square(sq):
    return (square_file(sq) + square_rank(sq)) % 2 == 1

def chebyshev_distance(sq1, sq2):
    f1, r1 = square_file(sq1), square_rank(sq1)
    f2, r2 = square_file(sq2), square_rank(sq2)
    return max(abs(f1-f2), abs(r1-r2))

def build_board(wk, wn, wb):
    board = Board(None)
    board.clear()
    board.set_piece_at(BLACK_KING, chess.Piece(chess.KING, chess.BLACK))
    board.set_piece_at(wk, chess.Piece(chess.KING, chess.WHITE))
    board.set_piece_at(wn, chess.Piece(chess.KNIGHT, chess.WHITE))
    board.set_piece_at(wb, chess.Piece(chess.BISHOP, chess.WHITE))
    board.turn = chess.WHITE
    return board

def analyze(engine, board):
    try:
        info = engine.analyse(
            board,
            chess.engine.Limit(depth=ENGINE_DEPTH, time=ENGINE_TIME_LIMIT)
        )
        score = info["score"].white().mate()
        if score and score > 0:
            return score
    except:
        pass
    return None

def main():
    engine = chess.engine.SimpleEngine.popen_uci(ENGINE_PATH)
    results = []
    count = 0
    mates = {}

    try:
        for wk in SQUARES:
            if wk == BLACK_KING:
                continue
            if chebyshev_distance(BLACK_KING, wk) > 2:
                continue

            for wn in SQUARES:
                if wn in {BLACK_KING, wk}:
                    continue

                for wb in SQUARES:
                    if wb in {BLACK_KING, wk, wn}:
                        continue
                    if not is_light_square(wb):
                        continue

                    board = build_board(wk, wn, wb)
                    if not board.is_valid():
                        continue

                    count += 1
                    if count % 25 == 0:
                        print("checked:", count, "kept:", len(results))

                    md = analyze(engine, board)
                    if not md:
                        continue

                    mates[md] = mates.get(md, 0) + 1

                    results.append({
                        "fen": board.fen(),
                        "white_king": square_name(wk),
                        "white_knight": square_name(wn),
                        "white_bishop": square_name(wb),
                        "mate_distance": md
                    })

    finally:
        engine.quit()

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print("=== FINISHED ===")
    print("Total kept:", len(results))
    for k in sorted(mates):
        print("mate in", k, ":", mates[k])

if __name__ == "__main__":
    main()