import json
from collections import defaultdict
from pathlib import Path

import chess
import chess.engine

# =========================================================
# CONFIG
# =========================================================
ENGINE_PATH = r"C:\Users\Ariel\chess-trainer\stockfish-windows-x86-64-avx2\stockfish\stockfish-windows-x86-64-avx2.exe"

INPUT_FILE = Path(r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4\bk_c8_typical_drive_pool.json")
OUTPUT_DIR = Path(r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4\a8_mate_scan")
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

SEARCH_TIME = 0.08
FOLLOW_TIME = 0.08
MAX_MATE_DISTANCE = 30
PRINT_EVERY = 25
SAVE_EVERY = 100

TARGET_FINAL_SQUARE = chess.A8


# =========================================================
# HELPERS
# =========================================================
def save_json(path: Path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def load_json(path: Path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def black_king_on_a8(board: chess.Board) -> bool:
    piece = board.piece_at(TARGET_FINAL_SQUARE)
    return piece is not None and piece.piece_type == chess.KING and piece.color == chess.BLACK


def mate_score_for_side_to_move(info):
    score = info.get("score")
    if score is None or score.relative is None:
        return None
    return score.relative.mate()


def follow_best_line_to_end(engine, board: chess.Board, max_plies: int):
    b = board.copy()
    moves = []

    for _ in range(max_plies):
        if b.is_checkmate():
            return moves, b

        info = engine.analyse(b, chess.engine.Limit(time=FOLLOW_TIME))
        pv = info.get("pv")
        if not pv:
            return None, None

        mv = pv[0]
        if mv not in b.legal_moves:
            return None, None

        moves.append(mv)
        b.push(mv)

        if b.is_checkmate():
            return moves, b

    return None, None


def build_record(pos, mate_dist, bestmove, line_uci):
    out = dict(pos)
    out["mate_distance"] = mate_dist
    out["bestmove_uci"] = bestmove.uci()
    out["best_line_uci"] = line_uci
    return out


def write_partial(grouped):
    for mate_dist in sorted(grouped):
        save_json(OUTPUT_DIR / f"bk_c8_to_a8_mate{mate_dist}.json", grouped[mate_dist])


# =========================================================
# MAIN
# =========================================================
def main():
    print("starting c8 pool scan for final mate on a8...")
    print(f"input:  {INPUT_FILE}")
    print(f"output: {OUTPUT_DIR}")

    data = load_json(INPUT_FILE)
    print(f"loaded positions: {len(data)}")

    grouped = defaultdict(list)

    scanned = 0
    mate_found = 0
    kept = 0
    no_mate = 0
    bad_line = 0
    wrong_final = 0

    engine = chess.engine.SimpleEngine.popen_uci(ENGINE_PATH)

    try:
        try:
            engine.configure({"Threads": 4, "Hash": 256})
        except Exception:
            pass

        for pos in data:
            scanned += 1

            if scanned % PRINT_EVERY == 0:
                print(
                    f"[UPDATE] scanned={scanned} mate_found={mate_found} "
                    f"kept={kept} no_mate={no_mate} bad_line={bad_line} wrong_final={wrong_final}"
                )

            if scanned % SAVE_EVERY == 0:
                write_partial(grouped)
                print(f"[SAVE] partial files written at scanned={scanned}")

            fen = pos.get("fen")
            if not fen:
                bad_line += 1
                continue

            try:
                board = chess.Board(fen)
            except Exception:
                bad_line += 1
                continue

            try:
                info = engine.analyse(board, chess.engine.Limit(time=SEARCH_TIME))
            except Exception:
                bad_line += 1
                continue

            mate_dist = mate_score_for_side_to_move(info)
            if mate_dist is None or mate_dist <= 0 or mate_dist > MAX_MATE_DISTANCE:
                no_mate += 1
                continue

            pv = info.get("pv")
            if not pv:
                bad_line += 1
                continue

            bestmove = pv[0]
            if bestmove not in board.legal_moves:
                bad_line += 1
                continue

            mate_found += 1

            max_plies = min(2 * mate_dist + 12, 100)
            line, final_board = follow_best_line_to_end(engine, board, max_plies=max_plies)
            if final_board is None or not final_board.is_checkmate():
                bad_line += 1
                continue

            if not black_king_on_a8(final_board):
                wrong_final += 1
                continue

            grouped[mate_dist].append(
                build_record(pos, mate_dist, bestmove, [mv.uci() for mv in line])
            )
            kept += 1

        write_partial(grouped)

        print("=== FINISHED ===")
        print(f"scanned: {scanned}")
        print(f"mate_found: {mate_found}")
        print(f"kept: {kept}")
        print(f"no_mate: {no_mate}")
        print(f"bad_line: {bad_line}")
        print(f"wrong_final: {wrong_final}")

        for mate_dist in sorted(grouped):
            print(f"[WRITE] bk_c8_to_a8_mate{mate_dist}.json: {len(grouped[mate_dist])}")

    finally:
        engine.quit()


if __name__ == "__main__":
    main()