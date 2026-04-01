import os
import math
import pandas as pd

INPUT_DIR = os.path.join("theme_exports", "mateIn1_subthemes_raw")
OUTPUT_DIR = os.path.join("theme_exports", "mateIn1_subthemes")
MAX_PUZZLES = 5010
CHUNK_SIZE = 30


def evenly_sample_sorted(df: pd.DataFrame, n: int) -> pd.DataFrame:
    if len(df) <= n:
        return df.copy().reset_index(drop=True)

    positions = [round(i * (len(df) - 1) / (n - 1)) for i in range(n)]
    sampled = df.iloc[positions].copy()
    sampled = sampled.drop_duplicates().reset_index(drop=True)

    if len(sampled) < n:
        remaining = df.drop(sampled.index, errors="ignore")
        need = n - len(sampled)
        extra = remaining.head(need)
        sampled = pd.concat([sampled, extra], ignore_index=True)

    sampled = sampled.sort_values("Rating", ascending=True).reset_index(drop=True)
    return sampled


def main():
    if not os.path.exists(INPUT_DIR):
        raise ValueError(f"Input folder not found: {INPUT_DIR}")

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    csv_files = [f for f in os.listdir(INPUT_DIR) if f.endswith(".csv")]
    print(f"Found {len(csv_files)} subtheme files")

    for csv_file in sorted(csv_files):
        input_path = os.path.join(INPUT_DIR, csv_file)
        subtheme_name = os.path.splitext(csv_file)[0]

        df = pd.read_csv(input_path)

        if "Rating" not in df.columns:
            print(f"Skipping {csv_file}: no Rating column")
            continue

        df = df.dropna(subset=["Rating"]).copy()
        df["Rating"] = pd.to_numeric(df["Rating"], errors="coerce")
        df = df.dropna(subset=["Rating"]).copy()

        df = df.sort_values("Rating", ascending=True).reset_index(drop=True)
        df = evenly_sample_sorted(df, MAX_PUZZLES)

        subtheme_output_dir = os.path.join(OUTPUT_DIR, subtheme_name)
        os.makedirs(subtheme_output_dir, exist_ok=True)

        total_chunks = math.ceil(len(df) / CHUNK_SIZE)

        for chunk_index in range(total_chunks):
            start = chunk_index * CHUNK_SIZE
            end = start + CHUNK_SIZE
            chunk_df = df.iloc[start:end].copy()

            chunk_name = f"chunk_{chunk_index + 1:03d}.csv"
            output_path = os.path.join(subtheme_output_dir, chunk_name)
            chunk_df.to_csv(output_path, index=False)

        print(f"{subtheme_name}: {len(df)} puzzles -> {total_chunks} chunks")

    print("Done.")


if __name__ == "__main__":
    main()