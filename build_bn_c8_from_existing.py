# build_bn_c8_from_existing.py
# Rebuild BN positions for:
# - black king on c8
# - light-squared bishop
# - mating corner = a8
#
# Source comes from already-correct generated files, not Stockfish search.

from __future__ import annotations

import json
from pathlib import Path
import chess

# ---- CHANGE THESE PATHS IF NEEDED ----
INPUT_FILES = [
    r"C:\Users\Ariel\chess-trainer\bn_source\bk_a8.json",
    r"C:\Users\Ariel\chess-trainer\bn_source\bk_b8.json",
    r"C:\Users\Ariel\chess-trainer\bn_source\bk_f8.json",
    r"C:\Users\Ariel\chess-trainer\bn_source\bk_g8.json",
    r"C:\Users\Ariel\chess-trainer\bn_source\bk_h8.json",
]

OUTPUT_FILE = r"C:\Users\Ariel\chess-trainer\bn_source\bk_c8_light_a8.json"

TARGET_BLACK_KING = chess.C8
TARGET_BLACK_KING_NAME = "c8"
TARGET_MATE_CORNER = "a8"


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def extract_items(data):
    # Supports:
    # 1) list of positions
    # 2) {"positions": [...]}
    # 3) {"items": [...]}
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        if isinstance(data.get("positions"), list):
            return data["positions"]
        if isinstance(data.get("items"), list):
            return data["items"]
    return []


def is_light_square(square: int) -> bool:
    file_idx = chess.square_file(square)
    rank_idx = chess.square_rank(square)
    return (file_idx + rank_idx) % 2 == 1


def find_piece_square(board: chess.Board, piece_type: int, color: bool):
    for sq, piece in board.piece_map().items():
        if piece.piece_type == piece_type and piece.color == color:
            return sq
    return None


def make_template_position(wk_sq: int, wb_sq: int, wn_sq: int, bk_sq: int) -> chess.Board | None:
    # Build a minimal legal board with just KBN vs K
    squares = [wk_sq, wb_sq, wn_sq, bk_sq]
    if len(set(squares)) != 4:
        return None

    board = chess.Board(None)  # empty board
    board.set_piece_at(wk_sq, chess.Piece(chess.KING, chess.WHITE))
    board.set_piece_at(wb_sq, chess.Piece(chess.BISHOP, chess.WHITE))
    board.set_piece_at(wn_sq, chess.Piece(chess.KNIGHT, chess.WHITE))
    board.set_piece_at(bk_sq, chess.Piece(chess.KING, chess.BLACK))
    board.turn = chess.WHITE
    board.castling_rights = 0
    board.ep_square = None
    board.halfmove_clock = 0
    board.fullmove_number = 1

    # Kings cannot touch
    if chess.square_distance(wk_sq, bk_sq) <= 1:
        return None

    # White king cannot be in check from black king
    if board.is_attacked_by(chess.BLACK, wk_sq):
        return None

    # Black king cannot already be in check in a legal "white to move" setup
    if board.is_attacked_by(chess.WHITE, bk_sq):
        return None

    # Must have exactly one of each side's king
    if board.king(chess.WHITE) is None or board.king(chess.BLACK) is None:
        return None

    return board


def parse_source_position(item):
    fen = item.get("startFen") or item.get("fen")
    if not fen:
        return None

    try:
        board = chess.Board(fen)
    except Exception:
        return None

    wk_sq = find_piece_square(board, chess.KING, chess.WHITE)
    wb_sq = find_piece_square(board, chess.BISHOP, chess.WHITE)
    wn_sq = find_piece_square(board, chess.KNIGHT, chess.WHITE)
    bk_sq = find_piece_square(board, chess.KING, chess.BLACK)

    if None in (wk_sq, wb_sq, wn_sq, bk_sq):
        return None

    return {
        "wk": wk_sq,
        "wb": wb_sq,
        "wn": wn_sq,
        "bk": bk_sq,
        "sourceFen": fen,
        "label": item.get("label", ""),
        "id": item.get("id", ""),
    }


def main():
    all_items = []
    for raw_path in INPUT_FILES:
        path = Path(raw_path)
        if not path.exists():
            print(f"[MISSING] {path}")
            continue

        try:
            data = load_json(path)
            items = extract_items(data)
            all_items.extend((path.name, x) for x in items)
            print(f"[LOAD] {path.name}: {len(items)}")
        except Exception as e:
            print(f"[ERROR] {path.name}: {e}")

    if not all_items:
        print("[STOP] No input items loaded.")
        return

    seen_fens = set()
    out = []
    kept = 0
    skipped_parse = 0
    skipped_dark_bishop = 0
    skipped_illegal = 0

    for source_name, item in all_items:
        parsed = parse_source_position(item)
        if parsed is None:
            skipped_parse += 1
            continue

        wk_sq = parsed["wk"]
        wb_sq = parsed["wb"]
        wn_sq = parsed["wn"]

        # Keep only light-squared bishop
        if not is_light_square(wb_sq):
            skipped_dark_bishop += 1
            continue

        new_board = make_template_position(
            wk_sq=wk_sq,
            wb_sq=wb_sq,
            wn_sq=wn_sq,
            bk_sq=TARGET_BLACK_KING,
        )

        if new_board is None:
            skipped_illegal += 1
            continue

        fen = new_board.fen()
        if fen in seen_fens:
            continue
        seen_fens.add(fen)

        kept += 1
        out.append({
            "id": f"c8_{kept}",
            "label": "bk_c8_light_a8",
            "blackKing": TARGET_BLACK_KING_NAME,
            "mateCorner": TARGET_MATE_CORNER,
            "whiteKing": chess.square_name(wk_sq),
            "whiteKnight": chess.square_name(wn_sq),
            "whiteBishop": chess.square_name(wb_sq),
            "startFen": fen,
            "sourceLabel": parsed["label"],
            "sourceId": parsed["id"],
            "sourceFen": parsed["sourceFen"],
            "sourceFile": source_name,
        })

    out_path = Path(OUTPUT_FILE)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)

    print()
    print("=== DONE ===")
    print(f"Output file: {out_path}")
    print(f"Kept: {kept}")
    print(f"Skipped parse: {skipped_parse}")
    print(f"Skipped dark bishop: {skipped_dark_bishop}")
    print(f"Skipped illegal: {skipped_illegal}")


if __name__ == "__main__":
    main()