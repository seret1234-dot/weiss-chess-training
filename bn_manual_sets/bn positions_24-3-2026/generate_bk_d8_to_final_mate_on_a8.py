import json
import chess
import chess.engine
from chess import Board, square_name, SQUARES, square_file, square_rank

ENGINE_PATH = r"C:\Users\Ariel\chess-trainer\stockfish-windows-x86-64-avx2\stockfish\stockfish-windows-x86-64-avx2.exe"
ENGINE_DEPTH = 14
ENGINE_TIME_LIMIT = 0.2

BLACK_KING_START = chess.D8
FINAL_MATE_SQUARE = chess.A8

OUTPUT_JSON = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bk_d8_to_final_mate_on_a8.json"


def is_light_square(sq):
    return (square_file(sq) + square_rank(sq)) % 2 == 1


def chebyshev_distance(sq1, sq2):
    f1, r1 = square_file(sq1), square_rank(sq1)
    f2, r2 = square_file(sq2), square_rank(sq2)
    return max(abs(f1 - f2), abs(r1 - r2))


def build_board(wk, wn, wb):
    board = Board(None)
    board.clear()
    board.set_piece_at(BLACK_KING_START, chess.Piece(chess.KING, chess.BLACK))
    board.set_piece_at(wk, chess.Piece(chess.KING, chess.WHITE))
    board.set_piece_at(wn, chess.Piece(chess.KNIGHT, chess.WHITE))
    board.set_piece_at(wb, chess.Piece(chess.BISHOP, chess.WHITE))
    board.turn = chess.WHITE
    board.castling_rights = 0
    board.ep_square = None
    board.halfmove_clock = 0
    board.fullmove_number = 1
    return board


def get_black_king_square(board):
    for sq in SQUARES:
        piece = board.piece_at(sq)
        if piece and piece.color == chess.BLACK and piece.piece_type == chess.KING:
            return sq
    return None


def analyze_to_final_a8_mate(engine, board):
    try:
        info = engine.analyse(
            board,
            chess.engine.Limit(depth=ENGINE_DEPTH, time=ENGINE_TIME_LIMIT)
        )

        score = info.get("score")
        pv = info.get("pv", [])

        if score is None:
            return None

        mate_score = score.white().mate()
        if mate_score is None or mate_score <= 0:
            return None

        if not pv:
            return None

        test_board = board.copy()

        for move in pv:
            if move not in test_board.legal_moves:
                break
            test_board.push(move)
            if test_board.is_checkmate():
                bk_sq = get_black_king_square(test_board)
                if bk_sq == FINAL_MATE_SQUARE:
                    first_move = pv[0]
                    temp = board.copy()
                    return {
                        "mate_distance": mate_score,
                        "bestmove_uci": first_move.uci(),
                        "bestmove_san": temp.san(first_move),
                        "pv_uci": [m.uci() for m in pv],
                    }
                return None

        return None

    except Exception:
        return None


def main():
    engine = chess.engine.SimpleEngine.popen_uci(ENGINE_PATH)
    results = []
    checked = 0
    mates = {}

    try:
        for wk in SQUARES:
            if wk == BLACK_KING_START:
                continue

            # wider zone, because d8 is still earlier in the funnel
            if chebyshev_distance(BLACK_KING_START, wk) > 3:
                continue

            for wn in SQUARES:
                if wn in {BLACK_KING_START, wk}:
                    continue

                for wb in SQUARES:
                    if wb in {BLACK_KING_START, wk, wn}:
                        continue
                    if not is_light_square(wb):
                        continue

                    board = build_board(wk, wn, wb)

                    if not board.is_valid():
                        continue

                    checked += 1
                    if checked % 25 == 0:
                        print("checked:", checked, "kept:", len(results))

                    result = analyze_to_final_a8_mate(engine, board)
                    if result is None:
                        continue

                    md = result["mate_distance"]
                    mates[md] = mates.get(md, 0) + 1

                    results.append({
                        "fen": board.fen(),
                        "black_king_start": square_name(BLACK_KING_START),
                        "white_king": square_name(wk),
                        "white_knight": square_name(wn),
                        "white_bishop": square_name(wb),
                        "final_mate_square": square_name(FINAL_MATE_SQUARE),
                        "mate_distance": md,
                        "bestmove_uci": result["bestmove_uci"],
                        "bestmove_san": result["bestmove_san"],
                        "pv_uci": result["pv_uci"],
                    })

    finally:
        engine.quit()

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print("=== FINISHED ===")
    print("Total kept:", len(results))
    for k in sorted(mates):
        print("mate in", k, ":", mates[k])


if __name__ == "__main__":
    main()