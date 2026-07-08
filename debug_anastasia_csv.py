import csv
from pathlib import Path

INPUT_CSV = Path("lichess_db_puzzle.csv")

def split_themes(raw):
    if not raw:
        return []
    return raw.strip().split()

with INPUT_CSV.open("r", encoding="utf-8", newline="") as f:
    reader = csv.DictReader(f)

    print("HEADERS:")
    print(reader.fieldnames)
    print()

    count_matein2 = 0
    count_anastasia = 0
    shown = 0

    for row in reader:
        themes_raw = row.get("Themes", "")
        themes = split_themes(themes_raw)

        if "mateIn2" in themes:
            count_matein2 += 1

        if any("anastasia" in t.lower() for t in themes):
            count_anastasia += 1
            if shown < 10:
                print("ROW WITH ANASTASIA:")
                print("PuzzleId:", row.get("PuzzleId"))
                print("FEN:", row.get("FEN"))
                print("Moves:", row.get("Moves"))
                print("Themes:", row.get("Themes"))
                print("-" * 60)
                shown += 1

    print()
    print("mateIn2 rows:", count_matein2)
    print("rows with 'anastasia' in Themes:", count_anastasia)