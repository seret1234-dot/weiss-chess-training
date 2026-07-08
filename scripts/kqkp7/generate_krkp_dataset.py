from __future__ import annotations

import argparse
import json
import random
from pathlib import Path
from typing import Optional, Tuple

try:
    import chess
    import chess.engine
    import chess.syzygy
except ImportError as exc:
    raise SystemExit(
        "Missing dependency: python-chess. Install it with:\n"
        "  pip install python-chess\n"
    ) from exc

FILES = "abcdefgh"


def sq(file_i: int, rank: int) -> chess.Square:
    return chess.square(file_i, rank - 1)


def kings_adjacent(wk: chess.Square, bk: chess.Square) -> bool:
    return chess.square_distance(wk, bk) <= 1


def build_board(wk: chess.Square, wr: chess.Square, bk: chess.Square, bp: chess.Square) -> Optional[chess.Board]:
    if len({wk, wr, bk, bp}) != 4:
        return None
    if kings_adjacent(wk, bk):
        return None

    board = chess.Board.empty()
    board.turn = chess.WHITE
    board.castling_rights = 0
    board.ep_square = None
    board.halfmove_clock = 0
    board.fullmove_number = 1

    board.set_piece_at(wk, chess.Piece(chess.KING, chess.WHITE))
    board.set_piece_at(wr, chess.Piece(chess.ROOK, chess.WHITE))
    board.set_piece_at(bk, chess.Piece(chess.KING, chess.BLACK))
    board.set_piece_at(bp, chess.Piece(chess.PAWN, chess.BLACK))

    # Reject illegal/impossible positions.
    if not board.is_valid():
        return None

    # With White to move, Black should not already be in check.
    temp = board.copy(stack=False)
    temp.turn = chess.BLACK
    if temp.is_check():
        return None

    return board


def random_krkp_board(rng: random.Random) -> Optional[chess.Board]:
    wk = sq(rng.randrange(8), rng.randrange(1, 9))
    wr = sq(rng.randrange(8), rng.randrange(1, 9))
    bk = sq(rng.randrange(8), rng.randrange(1, 9))

    # Black pawn cannot legally be on rank 1 or 8.
    bp = sq(rng.randrange(8), rng.randrange(2, 8))
    return build_board(wk, wr, bk, bp)


def syzygy_label(board: chess.Board, tablebase: chess.syzygy.Tablebase) -> Optional[str]:
    try:
        # WDL from side to move. White to move in our generated positions.
        wdl = tablebase.probe_wdl(board)
    except Exception:
        return None

    if wdl > 0:
        return "win"
    if wdl == 0:
        return "draw"

    # We do not want positions where White is losing.
    return None


def stockfish_label(board: chess.Board, engine: chess.engine.SimpleEngine, depth: int) -> Optional[str]:
    info = engine.analyse(board, chess.engine.Limit(depth=depth))
    score = info["score"].pov(chess.WHITE)

    if score.is_mate():
        mate = score.mate()
        if mate is not None and mate > 0:
            return "win"
        return None

    cp = score.score(mate_score=100000)
    if cp is None:
        return None

    # Conservative thresholds. Ambiguous positions are skipped.
    if cp >= 300:
        return "win"
    if -80 <= cp <= 80:
        return "draw"

    return None


def make_explanation(result: str) -> str:
    if result == "win":
        return "White should win: the rook can either stop the pawn, cut off the king, or win the pawn."
    return "Draw: the pawn/king setup gives Black enough counterplay or blockade resources."


def write_dataset(output_dir: Path, positions: list[dict], chunks: int, chunk_size: int) -> None:
    chunks_dir = output_dir / "chunks"
    chunks_dir.mkdir(parents=True, exist_ok=True)

    chunk_files = []
    for chunk_index in range(chunks):
        start = chunk_index * chunk_size
        end = start + chunk_size
        chunk_positions = positions[start:end]
        chunk_file = f"chunk_{chunk_index + 1:03d}.json"
        chunk_files.append(chunk_file)
        (chunks_dir / chunk_file).write_text(
            json.dumps(chunk_positions, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

    progression = {
        "order": ["basic-win-draw"],
        "masteryFastSolves": 5,
        "maxSecondsPerMove": 3,
        "themes": {
            "basic-win-draw": {
                "label": "Basic Win / Draw",
                "mode": "evaluate",
                "chunkFiles": chunk_files,
            }
        },
    }

    (output_dir / "progression.json").write_text(
        json.dumps(progression, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate KR vs KP evaluate-mode dataset.")
    parser.add_argument(
        "--stockfish",
        default=r"C:\Users\Ariel\chess-trainer\stockfish-windows-x86-64-avx2\stockfish\stockfish-windows-x86-64-avx2.exe",
        help="Path to Stockfish executable.",
    )
    parser.add_argument(
        "--syzygy",
        default="",
        help="Optional path to Syzygy tablebases. If provided, labels are exact.",
    )
    parser.add_argument(
        "--out",
        default=r"C:\Users\Ariel\chess-trainer\public\data\endgames\krkp",
        help="Output folder.",
    )
    parser.add_argument("--chunks", type=int, default=10)
    parser.add_argument("--chunk-size", type=int, default=30)
    parser.add_argument("--depth", type=int, default=18)
    parser.add_argument("--seed", type=int, default=12345)
    parser.add_argument("--max-tries", type=int, default=250000)
    args = parser.parse_args()

    target_total = args.chunks * args.chunk_size
    target_each = target_total // 2
    rng = random.Random(args.seed)

    stockfish_path = Path(args.stockfish)
    if not stockfish_path.exists():
        raise SystemExit(f"Stockfish not found: {stockfish_path}")

    output_dir = Path(args.out)
    output_dir.mkdir(parents=True, exist_ok=True)

    tablebase = None
    if args.syzygy:
        tablebase = chess.syzygy.open_tablebase(args.syzygy)

    engine = chess.engine.SimpleEngine.popen_uci(str(stockfish_path))
    try:
        if args.syzygy:
            try:
                engine.configure({"SyzygyPath": args.syzygy})
            except Exception:
                pass

        positions: list[dict] = []
        seen_fens: set[str] = set()
        counts = {"win": 0, "draw": 0}
        tries = 0

        while len(positions) < target_total and tries < args.max_tries:
            tries += 1
            board = random_krkp_board(rng)
            if board is None:
                continue

            fen = board.fen()
            if fen in seen_fens:
                continue

            if tablebase is not None:
                label = syzygy_label(board, tablebase)
            else:
                label = stockfish_label(board, engine, args.depth)

            if label not in ("win", "draw"):
                continue

            # Keep the dataset balanced.
            if counts[label] >= target_each:
                other = "draw" if label == "win" else "win"
                if counts[other] < target_each:
                    continue

            item_number = len(positions) + 1
            positions.append({
                "id": f"krkp_{item_number:04d}",
                "label": f"KR vs KP #{item_number}",
                "fen": fen,
                "result": label,
                "explanation": make_explanation(label),
            })
            seen_fens.add(fen)
            counts[label] += 1

            if item_number % 30 == 0:
                print(f"Generated {item_number}/{target_total} | win={counts['win']} draw={counts['draw']} | tries={tries}")

        if len(positions) < target_total:
            raise SystemExit(
                f"Only generated {len(positions)}/{target_total}. "
                f"Try increasing --max-tries, lowering --depth, or using Syzygy. Counts={counts}"
            )

        # Shuffle so each chunk contains mixed win/draw positions.
        rng.shuffle(positions)
        for i, item in enumerate(positions, start=1):
            item["id"] = f"krkp_{i:04d}"
            item["label"] = f"KR vs KP #{i}"

        write_dataset(output_dir, positions, args.chunks, args.chunk_size)
        print("DONE")
        print(f"Output: {output_dir}")
        print(f"Positions: {len(positions)} | win={counts['win']} draw={counts['draw']}")

    finally:
        engine.quit()
        if tablebase is not None:
            tablebase.close()


if __name__ == "__main__":
    main()
