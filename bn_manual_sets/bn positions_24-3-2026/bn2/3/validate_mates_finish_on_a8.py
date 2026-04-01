import json
import re
from pathlib import Path

import chess
import chess.engine

# =========================================================
# CONFIG
# =========================================================
ENGINE_PATH = r"C:\Users\Ariel\chess-trainer\stockfish-windows-x86-64-avx2\stockfish\stockfish-windows-x86-64-avx2.exe"
ANALYSIS_TIME = 0.25  # seconds per position
BASE_DIR = Path(".")
OUTPUT_DIR = BASE_DIR / "a8_valid"
OUTPUT_DIR.mkdir(exist_ok=True)

# only run these files:
MATE_FILE_RE = re.compile(r"^mate_(\d+)\.json$")


# =========================================================
# HELPERS
# =========================================================
def load_json(path: Path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def get_fen(pos):
    for key in ["fen", "startFen", "start_fen", "initialFen", "initial_fen"]:
        value = pos.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def black_king_on_a8(board: chess.Board) -> bool:
    piece = board.piece_at(chess.A8)
    return piece is not None and piece.piece_type == chess.KING and piece.color == chess.BLACK


def analyze_position(engine, fen: str):
    board = chess.Board(fen)
    info = engine.analyse(board, chess.engine.Limit(time=ANALYSIS_TIME))
    score = info.get("score")
    pv = info.get("pv", [])

    if score is None:
        return board, None, pv

    mate_score = score.white().mate()
    return board, mate_score, pv


def final_board_after_line(board: chess.Board, pv_moves):
    b = board.copy()
    for mv in pv_moves:
        if mv not in b.legal_moves:
            return None
        b.push(mv)
    return b


# =========================================================
# MAIN
# =========================================================
def main():
    mate_files = sorted(
        [p for p in BASE_DIR.iterdir() if p.is_file() and MATE_FILE_RE.match(p.name)],
        key=lambda p: int(MATE_FILE_RE.match(p.name).group(1))
    )

    print("Mate files to process:")
    for p in mate_files:
        print(f"  {p.name}")

    total_seen = 0
    total_kept = 0
    total_no_fen = 0
    total_not_mate = 0
    total_bad_line = 0
    total_not_a8 = 0

    engine = chess.engine.SimpleEngine.popen_uci(ENGINE_PATH)

    try:
        for path in mate_files:
            data = load_json(path)
            kept = []

            file_no_fen = 0
            file_not_mate = 0
            file_bad_line = 0
            file_not_a8 = 0

            for pos in data:
                total_seen += 1

                fen = get_fen(pos)
                if not fen:
                    file_no_fen += 1
                    total_no_fen += 1
                    continue

                try:
                    board, mate_score, pv_moves = analyze_position(engine, fen)
                except Exception:
                    file_bad_line += 1
                    total_bad_line += 1
                    continue

                # must be a mate position for White
                if mate_score is None or mate_score <= 0:
                    file_not_mate += 1
                    total_not_mate += 1
                    continue

                if not pv_moves:
                    file_bad_line += 1
                    total_bad_line += 1
                    continue

                end_board = final_board_after_line(board, pv_moves)
                if end_board is None:
                    file_bad_line += 1
                    total_bad_line += 1
                    continue

                if black_king_on_a8(end_board):
                    kept.append(pos)
                    total_kept += 1
                else:
                    file_not_a8 += 1
                    total_not_a8 += 1

            out_path = OUTPUT_DIR / path.name
            save_json(out_path, kept)

            print(f"\n[LOAD]  {path.name}: {len(data)}")
            print(f"[KEEP]  {path.name}: {len(kept)}")
            print(f"[SKIP]  no fen: {file_no_fen}")
            print(f"[SKIP]  not mate: {file_not_mate}")
            print(f"[SKIP]  bad pv/line: {file_bad_line}")
            print(f"[SKIP]  final mate not on a8: {file_not_a8}")

    finally:
        engine.quit()

    print("\n=== FINISHED ===")
    print(f"Total seen: {total_seen}")
    print(f"Total kept: {total_kept}")
    print(f"Total no fen: {total_no_fen}")
    print(f"Total not mate: {total_not_mate}")
    print(f"Total bad pv/line: {total_bad_line}")
    print(f"Total final mate not on a8: {total_not_a8}")
    print(f"Output folder: {OUTPUT_DIR.resolve()}")


if __name__ == "__main__":
    main()