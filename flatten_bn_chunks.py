from pathlib import Path
import shutil

# main chunks folder that currently contains subfolders like mate_1, mate_2, phase1_center...
CHUNKS_DIR = Path(r"C:\Users\Ariel\chess-trainer\public\data\lichess\bn_v3\chunks")

if not CHUNKS_DIR.exists():
    raise FileNotFoundError(f"Chunks folder not found: {CHUNKS_DIR}")

moved = 0
renamed = 0
skipped = 0
deleted_dirs = 0

# go over every direct subfolder inside chunks
for subdir in sorted(CHUNKS_DIR.iterdir()):
    if not subdir.is_dir():
        continue

    prefix = subdir.name

    for json_file in sorted(subdir.glob("*.json")):
        old_name = json_file.name
        new_name = f"{prefix}_{old_name}"
        target = CHUNKS_DIR / new_name

        if target.exists():
            print(f"[SKIP exists] {target.name}")
            skipped += 1
            continue

        shutil.move(str(json_file), str(target))
        print(f"[MOVE] {json_file.relative_to(CHUNKS_DIR)} -> {target.name}")
        moved += 1
        renamed += 1

    # delete folder if empty after moving
    remaining = list(subdir.iterdir())
    if not remaining:
        subdir.rmdir()
        print(f"[DELETE DIR] {subdir.name}")
        deleted_dirs += 1
    else:
        print(f"[KEEP DIR not empty] {subdir.name}")

print()
print("Done.")
print(f"Moved files: {moved}")
print(f"Renamed files: {renamed}")
print(f"Skipped files: {skipped}")
print(f"Deleted empty folders: {deleted_dirs}")