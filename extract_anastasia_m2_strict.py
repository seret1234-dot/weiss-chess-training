import csv
import json
from pathlib import Path
import chess

INPUT_CSV = Path("lichess_db_puzzle.csv")
OUTPUT_JSON = Path("anastasia_m2_strict.json")

def split_themes(raw):
    if not raw:
        return []
    return raw.strip().split()

def split_moves(raw):
    if not raw:
        return []
    return raw.strip().split()

def is_good_puzzle(row):
    themes = split_themes(row.get("Themes", ""))
    moves = split_moves(row.get("Moves", ""))
    fen = row.get("FEN", "").strip()

    if "mateIn2" not in themes:
        return None

    if "anastasiaMate" not in themes:
        return None

    # Lichess format here is:
    # premove, user move, opponent reply, user mate
    if len(moves) < 4:
        return None

    pre_move = moves[0]
    line = moves[1:4]

    if not fen:
        return None

    board = chess.Board(fen)

    try:
        pre = chess.Move.from_uci(pre_move)
        if pre not in board.legal_moves:
            return None
        board.push(pre)

        for uci in line:
            move = chess.Move.from_uci(uci)
            if move not in board.legal_moves:
                return None
            board.push(move)
    except Exception:
        return None

    if not board.is_checkmate():
        return None

    try:
        rating = int(row.get("Rating", "0") or 0)
    except:
        rating = 0

    return {
        "id": row.get("PuzzleId", "").strip(),
        "fen": fen,
        "preMove": pre_move,
        "rating": rating,
        "solutionLine": line
    }

def main():
    results = []
    seen = set()

    with INPUT_CSV.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)

        for row in reader:
            item = is_good_puzzle(row)
            if not item:
                continue

            if not item["id"]:
                continue

            if item["id"] in seen:
                continue
            seen.add(item["id"])

            results.append(item)

    results.sort(key=lambda x: x["rating"])

    chunked = []
    for i, item in enumerate(results[:1500]):
        chunked.append({
            "id": item["id"],
            "fen": item["fen"],
            "preMove": item["preMove"],
            "rating": item["rating"],
            "label": f"Anastasia Pattern {i + 1}",
            "theme": "Anastasia Mate",
            "chunkNumber": (i // 30) + 1,
            "chunkIndex": i % 30,
            "solutionLine": item["solutionLine"],
            "userMoveIndexes": [0, 2]
        })

    with OUTPUT_JSON.open("w", encoding="utf-8") as f:
        json.dump(chunked, f, indent=2)

    print("Strict valid puzzles:", len(chunked))
    print("Chunks:", (len(chunked) + 29) // 30)
    print("Saved to:", OUTPUT_JSON)

if __name__ == "__main__":
    main()