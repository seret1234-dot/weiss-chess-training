import json
from pathlib import Path
import chess

INPUT_DIR = Path(r"C:\Users\Ariel\chess-trainer\public\data\lichess\mate_in_1\anastasia")
OUTPUT_DIR = Path(r"C:\Users\Ariel\chess-trainer\public\data\lichess\mate_in_1\anastasia_fixed")

OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def find_mate_after_move(fen, premove):
    board = chess.Board(fen)

    try:
        move = chess.Move.from_uci(premove)
    except:
        return None

    if move not in board.legal_moves:
        return None

    board.push(move)

    mates = []

    for m in board.legal_moves:
        test = board.copy()
        test.push(m)
        if test.is_checkmate():
            mates.append(m.uci())

    if len(mates) == 1:
        return mates[0]

    return None


for file in INPUT_DIR.glob("chunk_*.json"):
    print("Processing", file.name)

    data = json.loads(file.read_text(encoding="utf-8"))
    new_data = []

    for puzzle in data:
        fen = puzzle["fen"]

        # original single move stored
        premove = None

        if isinstance(puzzle.get("moves"), list):
            premove = puzzle["moves"][0]
        elif isinstance(puzzle.get("solution"), list):
            premove = puzzle["solution"][0]
        elif isinstance(puzzle.get("solution"), str):
            premove = puzzle["solution"]

        if not premove:
            new_data.append(puzzle)
            continue

        mate = find_mate_after_move(fen, premove)

        if mate is None:
            new_data.append(puzzle)
            continue

        puzzle["preMove"] = premove
        puzzle["solution"] = mate
        puzzle["moves"] = [premove, mate]

        new_data.append(puzzle)

    out = OUTPUT_DIR / file.name
    out.write_text(json.dumps(new_data, indent=2), encoding="utf-8")

print("DONE")