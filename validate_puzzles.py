import csv
import chess

INPUT_FILE = "theme_exports/mates/mateIn1.csv"
OUTPUT_FILE = "validated_mateIn1.csv"

def is_valid_mate_in_one(fen, moves):
    try:
        board = chess.Board(fen)
        move_list = moves.split(" ")

        if len(move_list) == 0:
            return False

        # play ALL moves
        for move_str in move_list:
            move = chess.Move.from_uci(move_str)
            if move not in board.legal_moves:
                return False
            board.push(move)

        # check final position is mate
        return board.is_checkmate()

    except:
        return False
    try:
        board = chess.Board(fen)
        move_list = moves.split(" ")

        if len(move_list) == 0:
            return False

        move = board.parse_uci(move_list[0])

        if move not in board.legal_moves:
            return False

        board.push(move)

        return board.is_checkmate()
    except:
        return False


with open(INPUT_FILE, newline="", encoding="utf-8") as infile, \
     open(OUTPUT_FILE, "w", newline="", encoding="utf-8") as outfile:

    reader = csv.DictReader(infile)
    writer = csv.DictWriter(outfile, fieldnames=reader.fieldnames)

    writer.writeheader()

    count = 0
    valid = 0

    for row in reader:
        count += 1

        if is_valid_mate_in_one(row["FEN"], row["Moves"]):
            writer.writerow(row)
            valid += 1

        if count % 10000 == 0:
            print(f"Checked {count} rows...")

print(f"Done. Valid puzzles: {valid}")