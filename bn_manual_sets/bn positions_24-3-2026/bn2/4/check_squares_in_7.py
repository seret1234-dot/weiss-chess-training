import os
import re

FOLDER = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4\7"

squares = set()

for fn in os.listdir(FOLDER):
    m = re.search(r"__bk_([a-h][1-8])_chunk_", fn)
    if m:
        squares.add(m.group(1))

print("Squares found:")
print(sorted(squares, key=lambda s: (-int(s[1]), "abcdefgh".index(s[0]))))