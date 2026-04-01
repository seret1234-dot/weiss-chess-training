# convert_ab_to_light_bishop.py

from __future__ import annotations

import json
from pathlib import Path
import chess

FOLDER = Path(r"C:\Users\Ariel\chess-trainer\bn_manual_sets\ab")


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data):
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def shift_bishop_to_light(square_name: str) -> str | None:
    sq = chess.parse_square(square_name)
    file_idx = chess.square_file(sq)
    rank_idx = chess.square_rank(sq)

    # move one file right if possible, else one file left
    if file_idx < 7:
        new_file = file_idx + 1
    elif file_idx > 0:
        new_file = file_idx - 1
    else:
        return None

    new_sq = chess.square(new_file, rank_idx)
    return chess.square_name(new_sq)


def rebuild_fen_with_new_bishop(fen: str, new_bishop_sq: str) -> str | None:
    try:
        board = chess.Board(fen)
    except Exception:
        return None

    old_bishop_sq = None
    for sq, piece in board.piece_map().items():
        if piece.color == chess.WHITE and piece.piece_type == chess.BISHOP:
            old_bishop_sq = sq
            break

    if old_bishop_sq is None:
        return None

    new_sq = chess.parse_square(new_bishop_sq)

    # destination must be empty unless it's the old bishop square
    if new_sq != old_bishop_sq and board.piece_at(new_sq) is not None:
        return None

    bishop_piece = board.remove_piece_at(old_bishop_sq)
    if bishop_piece is None:
        return None

    board.set_piece_at(new_sq, bishop_piece)

    # kings cannot touch
    wk = board.king(chess.WHITE)
    bk = board.king(chess.BLACK)
    if wk is None or bk is None:
        return None
    if chess.square_distance(wk, bk) <= 1:
        return None

    # white king cannot be attacked by black king
    if board.is_attacked_by(chess.BLACK, wk):
        return None

    return board.fen()


def process_file(path: Path):
    try:
        data = load_json(path)
    except Exception as e:
        print(f"[SKIP] {path.name} read error: {e}")
        return

    if not isinstance(data, list):
        print(f"[SKIP] {path.name} not a JSON list")
        return

    out = []
    skipped_no_bishop = 0
    skipped_shift = 0
    skipped_fen = 0
    seen = set()

    for i, item in enumerate(data, start=1):
        bishop_sq = item.get("whiteBishop")
        fen = item.get("startFen") or item.get("fen")

        if not bishop_sq or not fen:
            skipped_no_bishop += 1
            continue

        new_bishop_sq = shift_bishop_to_light(bishop_sq)
        if not new_bishop_sq:
            skipped_shift += 1
            continue

        new_fen = rebuild_fen_with_new_bishop(fen, new_bishop_sq)
        if not new_fen:
            skipped_fen += 1
            continue

        if new_fen in seen:
            continue
        seen.add(new_fen)

        new_item = dict(item)
        new_item["whiteBishop"] = new_bishop_sq

        if "startFen" in new_item:
            new_item["startFen"] = new_fen
        elif "fen" in new_item:
            new_item["fen"] = new_fen
        else:
            new_item["startFen"] = new_fen

        out.append(new_item)

    out_path = path.with_name(path.stem + "_light.json")
    save_json(out_path, out)

    print(
        f"[DONE] {path.name} -> {out_path.name} | "
        f"total={len(data)} kept={len(out)} "
        f"no_bishop={skipped_no_bishop} shift_fail={skipped_shift} fen_fail={skipped_fen}"
    )


def main():
    files = sorted(FOLDER.glob("*.json"))
    if not files:
        print(f"[STOP] No JSON files found in {FOLDER}")
        return

    print(f"[START] Found {len(files)} files in {FOLDER}\n")

    for path in files:
        process_file(path)

    print("\n[FINISHED]")


if __name__ == "__main__":
    main()