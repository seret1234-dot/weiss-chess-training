import os
import pandas as pd
from supabase import create_client

SUPABASE_URL = "https://nykqqbsjldabnxnnzrdh.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im55a3FxYnNqbGRhYm54bm56cmRoIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTc2NzE5MiwiZXhwIjoyMDg3MzQzMTkyfQ.E3HMwYvAI9uR6S2J5i-njFMv8OCNP2SRJt7JOPMN35I"

BASE_PATH = "theme_exports/matein1_subthemes"
MATE_IN_1_THEME_ID = 92

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)


def get_subtheme_map():
    res = supabase.table("subthemes").select("id,name").execute()
    return {str(row["name"]).strip(): row["id"] for row in res.data}


def create_chunk(chunk_index):
    res = supabase.table("chunks").insert({
        "theme_id": MATE_IN_1_THEME_ID,
        "depth": 1,
        "chunk_number": chunk_index,
        "required_correct": 5,
        "required_time_ms": 3000,
        "difficulty_score": 1200
    }).execute()
    return res.data[0]["id"]


def insert_puzzles(df, subtheme_id, chunk_id):
    records = []

    for pos, (_, row) in enumerate(df.iterrows(), start=1):
        records.append({
            "chunk_id": chunk_id,
            "fen": row["FEN"],
            "solution": row["Moves"],
            "rating": int(row["Rating"]),
            "position_in_chunk": pos,
            "theme_id": MATE_IN_1_THEME_ID,
            "subtheme_id": subtheme_id,
            "mate_distance": 1
        })

    res = supabase.table("puzzles").insert(records).execute()
    return [r["id"] for r in res.data]


def insert_chunk_puzzles(chunk_id, puzzle_ids):
    records = []

    for i, pid in enumerate(puzzle_ids, start=1):
        records.append({
            "chunk_id": chunk_id,
            "puzzle_id": pid,
            "puzzle_order": i
        })

    supabase.table("chunk_puzzles").insert(records).execute()


def process():
    subtheme_map = get_subtheme_map()

    for raw_subtheme_name in sorted(os.listdir(BASE_PATH)):
        subtheme_name = raw_subtheme_name.strip()
        subtheme_path = os.path.join(BASE_PATH, raw_subtheme_name)

        if not os.path.isdir(subtheme_path):
            continue

        print(f"\nProcessing {subtheme_name}")

        subtheme_id = subtheme_map.get(subtheme_name)
        if not subtheme_id:
            print(f"Skipping {subtheme_name} - not found in DB")
            continue

        files = sorted(
            [f for f in os.listdir(subtheme_path) if f.endswith(".csv")]
        )

        for i, file in enumerate(files, start=1):
            file_path = os.path.join(subtheme_path, file)
            df = pd.read_csv(file_path)

            chunk_id = create_chunk(i)
            puzzle_ids = insert_puzzles(df, subtheme_id, chunk_id)
            insert_chunk_puzzles(chunk_id, puzzle_ids)

            print(f"Chunk {i} done ({len(puzzle_ids)} puzzles)")

    print("\nDONE")


if __name__ == "__main__":
    process()