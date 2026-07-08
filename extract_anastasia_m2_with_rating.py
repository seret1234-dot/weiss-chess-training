import csv
import json
from pathlib import Path

INPUT_CSV = Path("lichess_db_puzzle.csv")
OUTPUT_JSON = Path("anastasia_m2_all.json")

def split_themes(raw):
    if not raw:
        return []
    return raw.strip().split()

def split_moves(raw):
    if not raw:
        return []
    return raw.strip().split()

def main():
    results = []
    seen = set()

    with INPUT_CSV.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)

        for row in reader:
            themes = split_themes(row.get("Themes", ""))
            moves = split_moves(row.get("Moves", ""))

            if "mateIn2" not in themes:
                continue

            if "anastasiaMate" not in themes:
                continue

            if len(moves) < 3:
                continue

            puzzle_id = row.get("PuzzleId", "").strip()
            fen = row.get("FEN", "").strip()
            rating_raw = row.get("Rating", "").strip()

            if not puzzle_id or not fen:
                continue

            if puzzle_id in seen:
                continue
            seen.add(puzzle_id)

            try:
                rating = int(rating_raw)
            except:
                rating = 0

            results.append({
                "id": puzzle_id,
                "fen": fen,
                "rating": rating,
                "solutionLine": moves[:3]
            })

    with OUTPUT_JSON.open("w", encoding="utf-8") as f:
        json.dump(results, f)

    print("Saved", len(results), "puzzles to", OUTPUT_JSON)

if __name__ == "__main__":
    main()