import csv
import json
import math
from pathlib import Path

import chess


ROOT = Path(r"C:\Users\Ariel\chess-trainer")
CSV_PATH = ROOT / "lichess_db_puzzle.csv"

OUT_DIR = ROOT / "public" / "data" / "lichess" / "mate_in_3" / "anastasia"

CHUNK_SIZE = 30
CATEGORY = "Mate in 3"
THEME_NAME = "Anastasia Mate"

REQUIRED_THEMES = {"anastasiaMate", "mateIn3"}
SOLUTION_LENGTH = 5
USER_MOVE_INDEXES = [0, 2, 4]


def parse_int(value, fallback=0):
    try:
        return int(value)
    except Exception:
        return fallback


def build_puzzle(row):
    themes = set(row["Themes"].split())

    if not REQUIRED_THEMES.issubset(themes):
        return None

    moves = row["Moves"].split()

    # Current trainer format:
    # fen = original Lichess CSV FEN
    # preMove = first move from Lichess CSV
    # solutionLine = remaining puzzle line
    if len(moves) < 1 + SOLUTION_LENGTH:
        return None

    pre_move = moves[0]
    solution_line = moves[1:]

    if len(solution_line) != SOLUTION_LENGTH:
        return None

    try:
        board = chess.Board(row["FEN"])

        pre = chess.Move.from_uci(pre_move)
        if pre not in board.legal_moves:
            return None

        board.push(pre)

        for uci in solution_line:
            move = chess.Move.from_uci(uci)
            if move not in board.legal_moves:
                return None
            board.push(move)

        if not board.is_checkmate():
            return None

    except Exception:
        return None

    return {
        "id": row["PuzzleId"],
        "fen": row["FEN"],
        "preMove": pre_move,
        "rating": parse_int(row.get("Rating", 0), 0),
        "label": "",
        "theme": THEME_NAME,
        "chunkNumber": 0,
        "chunkIndex": 0,
        "solutionLine": solution_line,
        "userMoveIndexes": USER_MOVE_INDEXES,
    }


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    puzzles = []

    print(f"Reading: {CSV_PATH}")

    with CSV_PATH.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)

        for row in reader:
            puzzle = build_puzzle(row)
            if puzzle:
                puzzles.append(puzzle)

    puzzles.sort(key=lambda p: (p["rating"], p["id"]))

    print(f"Found {len(puzzles)} Anastasia Mate in 3 puzzles")

    for old in OUT_DIR.glob("chunk_*.json"):
        old.unlink()

    manifest_path = OUT_DIR / "manifest.json"
    if manifest_path.exists():
        manifest_path.unlink()

    total_chunks = math.ceil(len(puzzles) / CHUNK_SIZE)
    files = []

    for chunk_zero in range(total_chunks):
        start = chunk_zero * CHUNK_SIZE
        end = start + CHUNK_SIZE
        chunk = puzzles[start:end]

        file_name = f"chunk_{chunk_zero}.json"
        files.append(file_name)

        chunk_number = chunk_zero + 1

        for i, puzzle in enumerate(chunk):
            global_number = start + i + 1
            puzzle["label"] = f"Anastasia Pattern {global_number}"
            puzzle["chunkNumber"] = chunk_number
            puzzle["chunkIndex"] = i

        out_path = OUT_DIR / file_name
        out_path.write_text(
            json.dumps({"puzzles": chunk}, indent=2),
            encoding="utf-8",
        )

        min_rating = min(p["rating"] for p in chunk)
        max_rating = max(p["rating"] for p in chunk)

        print(f"Wrote {file_name}: {len(chunk)} puzzles rating {min_rating}-{max_rating}")

    manifest = {
        "category": CATEGORY,
        "theme": "Anastasia",
        "totalChunks": total_chunks,
        "chunkSize": CHUNK_SIZE,
        "totalPuzzles": len(puzzles),
        "files": files,
    }

    manifest_path.write_text(
        json.dumps(manifest, indent=2),
        encoding="utf-8",
    )

    print(f"Wrote manifest: {manifest_path}")
    print("Done")


if __name__ == "__main__":
    main()
