import json
import chess
import chess.engine
from collections import Counter

ENGINE_PATH = r"C:\Users\Ariel\chess-trainer\stockfish-windows-x86-64-avx2\stockfish\stockfish-windows-x86-64-avx2.exe"

FILES = [
    r"C:\Users\Ariel\chess-trainer\public\data\lichess\bn_v3\chunks\004_mate_2__bk_b8.json",
    r"C:\Users\Ariel\chess-trainer\public\data\lichess\bn_v3\chunks\007_mate_3__bk_b8.json",
]

MAX_PLIES = 24


def find_mate_square(fen, engine):
    board = chess.Board(fen)

    for _ in range(MAX_PLIES):
        if board.is_checkmate():
            return chess.square_name(board.king(chess.BLACK))

        result = engine.play(board, chess.engine.Limit(depth=18))
        board.push(result.move)

    if board.is_checkmate():
        return chess.square_name(board.king(chess.BLACK))

    return None


with chess.engine.SimpleEngine.popen_uci(ENGINE_PATH) as engine:
    for file in FILES:
        print("\nChecking:", file)

        with open(file) as f:
            data = json.load(f)

        counts = Counter()

        for pos in data:
            square = find_mate_square(pos["fen"], engine)
            counts[square] += 1

        print("Result:")
        for k, v in counts.items():
            print(k, ":", v)