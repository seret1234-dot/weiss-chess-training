import json
import time
from pathlib import Path
from collections import defaultdict
import chess
import chess.engine

ENGINE_PATH = r"C:\Users\Ariel\chess-trainer\stockfish-windows-x86-64-avx2\stockfish\stockfish-windows-x86-64-avx2.exe"

INPUT_FILES = [
    Path("bn_phase3_bk_a8_wk_2away_knight_controls_1or2away_fixed.json"),
    Path("bn_phase3_bk_a8_wk_3away_sampled.json"),
    Path("bn_backrank_strip_sampled.json"),
    Path("bn_wk_a6_knight_controls_a7.json"),
    Path("bn_wk_b6_knight_controls_b8.json"),
    Path("bn_wk_c7_knight_controls_a7.json"),
    Path("bn_wk_c8_knight_controls_a7.json"),
    Path("bn_wk_d8_knight_controls_a7.json"),
    Path("bn_wk_d8_knight_controls_b7.json"),
    Path("bn_wk_d8_knight_controls_c7.json"),
]

OUTPUT_DIR = Path("bn_by_mate_overnight")

THINK_TIME_SEC = 0.40
MULTIPV = 4
SAVE_EVERY = 100
MAX_POSITIONS = None  # set to 300 for a short test run

# light-square bishop project
CORRECT_CORNER = chess.A8
WRONG_CORNER = chess.H8


def normalize_fen(fen: str) -> str:
    parts = fen.strip().split()
    if len(parts) < 4:
        raise ValueError(f"Invalid FEN: {fen}")
    return " ".join(parts[:4])


def square_name(sq: int) -> str:
    return chess.square_name(sq)


def score_key(score: chess.engine.PovScore, turn: bool):
    s = score.pov(turn)
    mate = s.mate()
    if mate is not None:
        return ("mate", mate)
    cp = s.score(mate_score=100000)
    return ("cp", cp)


def king_distance(sq1: int, sq2: int) -> int:
    f1, r1 = chess.square_file(sq1), chess.square_rank(sq1)
    f2, r2 = chess.square_file(sq2), chess.square_rank(sq2)
    return max(abs(f1 - f2), abs(r1 - r2))


def parse_black_king_square(item: dict):
    bk = item.get("blackKing")
    if bk:
        try:
            return chess.parse_square(bk)
        except Exception:
            pass

    try:
        board = chess.Board(item["fen"])
        for sq, piece in board.piece_map().items():
            if piece.color == chess.BLACK and piece.piece_type == chess.KING:
                return sq
    except Exception:
        pass

    return None


def corner_priority(item: dict):
    bk_sq = parse_black_king_square(item)
    if bk_sq is None:
        return (99, 99, 99, item["fen"])

    d_correct = king_distance(bk_sq, CORRECT_CORNER)
    d_wrong = king_distance(bk_sq, WRONG_CORNER)
    edge_penalty = 0 if (
        chess.square_file(bk_sq) in (0, 7) or chess.square_rank(bk_sq) in (0, 7)
    ) else 1

    # smaller tuple = earlier processing
    return (d_correct, edge_penalty, d_wrong, item["fen"])


def classify_position(engine: chess.engine.SimpleEngine, fen: str):
    board = chess.Board(fen)

    if board.is_game_over():
        return None, []

    legal_count = board.legal_moves.count()
    multipv = min(MULTIPV, max(1, legal_count))

    infos = engine.analyse(
        board,
        chess.engine.Limit(time=THINK_TIME_SEC),
        multipv=multipv,
    )

    if not infos:
        return None, []

    if not isinstance(infos, list):
        infos = [infos]

    first = infos[0]
    if "score" not in first:
        return None, []

    root_score = first["score"].pov(board.turn)
    mate_distance = root_score.mate()

    if mate_distance is None or mate_distance <= 0:
        return None, []

    best_key = score_key(first["score"], board.turn)

    allowed_moves = []
    for info in infos:
        if "score" not in info or "pv" not in info or not info["pv"]:
            continue
        if score_key(info["score"], board.turn) == best_key:
            allowed_moves.append(info["pv"][0].uci())

    seen = set()
    allowed_moves = [m for m in allowed_moves if not (m in seen or seen.add(m))]

    return mate_distance, allowed_moves


def load_input_positions():
    loaded = []
    seen_input_files = []

    for path in INPUT_FILES:
        if not path.exists():
            print(f"[SKIP] Missing: {path}", flush=True)
            continue

        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            print(f"[SKIP] Failed to read {path}: {e}", flush=True)
            continue

        if not isinstance(data, list):
            print(f"[SKIP] Not a list: {path}", flush=True)
            continue

        print(f"[LOAD] {path} -> {len(data)} positions", flush=True)
        seen_input_files.append(str(path))

        for item in data:
            if not isinstance(item, dict):
                continue
            if "fen" not in item:
                continue

            try:
                fen = normalize_fen(item["fen"])
            except Exception:
                continue

            copy_item = dict(item)
            copy_item["fen"] = fen
            copy_item["_sourceFile"] = path.name
            loaded.append(copy_item)

    return loaded, seen_input_files


def merge_metadata(existing: dict, new_item: dict):
    existing_cs = set(existing.get("controlledSquares", []))
    new_cs = set(new_item.get("controlledSquares", []))
    if existing_cs or new_cs:
        existing["controlledSquares"] = sorted(existing_cs | new_cs)

    if "controlledSquare" not in existing and "controlledSquare" in new_item:
        existing["controlledSquare"] = new_item["controlledSquare"]

    existing_sources = set(existing.get("_sourceFiles", []))
    new_source = new_item.get("_sourceFile")
    if new_source:
        existing_sources.add(new_source)
    existing["_sourceFiles"] = sorted(existing_sources)

    for key in [
        "whiteKing",
        "blackKing",
        "whiteKnight",
        "whiteBishop",
        "corner",
        "bishopColor",
        "phase",
    ]:
        if key not in existing or existing[key] in (None, "", []):
            if key in new_item:
                existing[key] = new_item[key]


def make_output_item(fen: str, item: dict, mate_distance, allowed_moves):
    out = {
        "fen": fen,
        "allowedMoves": allowed_moves,
        "whiteKing": item.get("whiteKing"),
        "blackKing": item.get("blackKing"),
        "whiteKnight": item.get("whiteKnight"),
        "whiteBishop": item.get("whiteBishop"),
        "corner": item.get("corner"),
        "bishopColor": item.get("bishopColor"),
        "phase": item.get("phase"),
        "controlledSquares": item.get("controlledSquares", []),
        "controlledSquare": item.get("controlledSquare"),
        "sourceFiles": item.get("_sourceFiles", []),
    }
    if mate_distance is not None:
        out["mateDistance"] = mate_distance
    return out


def save_outputs(base_dir: Path, buckets, non_mates, eval_errors, processed_count=None):
    if processed_count is None:
        out_dir = base_dir
    else:
        out_dir = base_dir / "_partial"
        out_dir.mkdir(parents=True, exist_ok=True)

    for mate_distance in buckets:
        buckets[mate_distance].sort(key=lambda x: x["fen"])
    non_mates.sort(key=lambda x: x["fen"])

    for mate_distance in sorted(buckets):
        path = out_dir / f"bn_m{mate_distance}.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(buckets[mate_distance], f, indent=2)

    with open(out_dir / "bn_non_mates.json", "w", encoding="utf-8") as f:
        json.dump(non_mates, f, indent=2)

    with open(out_dir / "bn_eval_errors.json", "w", encoding="utf-8") as f:
        json.dump(eval_errors, f, indent=2)

    if processed_count is not None:
        with open(out_dir / "_progress.json", "w", encoding="utf-8") as f:
            json.dump({"processed": processed_count}, f, indent=2)
        print(f"[SAVE] Partial save at {processed_count} positions", flush=True)


def main():
    OUTPUT_DIR.mkdir(exist_ok=True)

    raw_positions, seen_input_files = load_input_positions()
    print(f"\nRaw loaded positions: {len(raw_positions)}", flush=True)

    deduped = {}
    duplicate_count = 0

    for item in raw_positions:
        fen = item["fen"]
        if fen not in deduped:
            item["_sourceFiles"] = [item["_sourceFile"]] if item.get("_sourceFile") else []
            deduped[fen] = item
        else:
            duplicate_count += 1
            merge_metadata(deduped[fen], item)

    items = list(deduped.items())
    items.sort(key=lambda pair: corner_priority(pair[1]))

    if MAX_POSITIONS is not None:
        items = items[:MAX_POSITIONS]

    print(f"Unique FENs after dedupe: {len(deduped)}", flush=True)
    print(f"Duplicates merged: {duplicate_count}", flush=True)
    print(f"Will classify: {len(items)} positions", flush=True)
    print(f"Think time per position: {THINK_TIME_SEC:.2f}s", flush=True)
    print("Ordering: corner-first", flush=True)
    print("Starting Stockfish...", flush=True)

    buckets = defaultdict(list)
    non_mates = []
    eval_errors = []

    started = time.time()

    with chess.engine.SimpleEngine.popen_uci(ENGINE_PATH) as engine:
        try:
            engine.configure({"Threads": 1})
        except Exception:
            pass

        total = len(items)

        for idx, (fen, item) in enumerate(items, start=1):
            pos_start = time.time()

            try:
                mate_distance, allowed_moves = classify_position(engine, fen)
            except Exception as e:
                err = {
                    "fen": fen,
                    "error": str(e),
                    "item": item,
                }
                eval_errors.append(err)
                elapsed = time.time() - started
                ppm = idx / elapsed * 60 if elapsed > 0 else 0.0
                print(
                    f"[{idx}/{total}] ERROR | pos={time.time()-pos_start:.2f}s | total={elapsed:.1f}s | rate={ppm:.1f}/min | fen={fen} | {e}",
                    flush=True,
                )
                continue

            out = make_output_item(fen, item, mate_distance, allowed_moves)

            if mate_distance is None:
                non_mates.append(out)
                result_text = "non-mate"
            else:
                buckets[mate_distance].append(out)
                result_text = f"M{mate_distance} | moves={allowed_moves}"

            elapsed = time.time() - started
            pos_elapsed = time.time() - pos_start
            ppm = idx / elapsed * 60 if elapsed > 0 else 0.0

            print(
                f"[{idx}/{total}] {result_text} | pos={pos_elapsed:.2f}s | total={elapsed:.1f}s | rate={ppm:.1f}/min | fen={fen}",
                flush=True,
            )

            if idx % SAVE_EVERY == 0:
                save_outputs(OUTPUT_DIR, buckets, non_mates, eval_errors, processed_count=idx)

    save_outputs(OUTPUT_DIR, buckets, non_mates, eval_errors)

    print(f"Wrote final outputs to {OUTPUT_DIR}", flush=True)

    elapsed = time.time() - started

    print("\n=== SUMMARY ===", flush=True)
    print(f"Input files used: {len(seen_input_files)}", flush=True)
    print(f"Raw loaded: {len(raw_positions)}", flush=True)
    print(f"Unique after dedupe: {len(deduped)}", flush=True)
    print(f"Actually classified: {len(items)}", flush=True)
    print(f"Non-mates / no forced mate found: {len(non_mates)}", flush=True)
    print(f"Eval errors: {len(eval_errors)}", flush=True)
    print(f"Elapsed seconds: {elapsed:.1f}", flush=True)

    print("\nMate buckets:", flush=True)
    for mate_distance in sorted(buckets):
        print(f"  M{mate_distance}: {len(buckets[mate_distance])}", flush=True)


if __name__ == "__main__":
    main()