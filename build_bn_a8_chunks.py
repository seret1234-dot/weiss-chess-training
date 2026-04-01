# build_bn_a8_chunks.py
import json
from pathlib import Path

import chess
import chess.engine

ENGINE_PATH = r"C:\Users\Ariel\chess-trainer\stockfish-windows-x86-64-avx2\stockfish\stockfish-windows-x86-64-avx2.exe"
OUT_ROOT = Path(r"C:\Users\Ariel\chess-trainer\public\data\lichess\bn_v3")
CHUNK_SIZE = 30


def is_light_square(square: chess.Square) -> bool:
    return (chess.square_file(square) + chess.square_rank(square)) % 2 == 1


def write_json(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def build_progression(theme_chunks: dict[str, list[str]]) -> dict:
    order = [f"mate_{i}" for i in range(1, 21) if theme_chunks.get(f"mate_{i}")]
    themes = {theme: {"chunkFiles": files} for theme, files in theme_chunks.items() if files}

    return {
        "name": "BN Trainer a8 light bishop",
        "chunkSize": CHUNK_SIZE,
        "basePath": "chunks",
        "masteryFastSolves": 30,
        "maxSecondsPerMove": 3,
        "order": order,
        "themes": themes,
        "virtualThemes": {},
    }


def generate():
    print("Starting engine...")
    engine = chess.engine.SimpleEngine.popen_uci(ENGINE_PATH)
    engine.configure({"Threads": 2})
    print("Engine ready")

    buckets = {i: [] for i in range(1, 21)}

    checked = 0
    kept = 0

    for wk in chess.SQUARES:
        for wb in chess.SQUARES:

            # only light square bishop
            if not is_light_square(wb):
                continue

            for wn in chess.SQUARES:

                bk = chess.A8

                # unique squares
                if len({wk, wb, wn, bk}) != 4:
                    continue

                checked += 1

                if checked % 50 == 0:
                    print(f"checked={checked} kept={kept}")

                board = chess.Board(None)
                board.set_piece_at(wk, chess.Piece(chess.KING, chess.WHITE))
                board.set_piece_at(wb, chess.Piece(chess.BISHOP, chess.WHITE))
                board.set_piece_at(wn, chess.Piece(chess.KNIGHT, chess.WHITE))
                board.set_piece_at(bk, chess.Piece(chess.KING, chess.BLACK))
                board.turn = chess.WHITE

                if not board.is_valid():
                    continue

                try:
                    info = engine.analyse(board, chess.engine.Limit(depth=18))
                except:
                    continue

                score = info["score"].white()

                if not score.is_mate():
                    continue

                mate = abs(score.mate())

                if mate < 1 or mate > 20:
                    continue

                allowed = []

                for move in board.legal_moves:
                    board.push(move)

                    try:
                        info2 = engine.analyse(board, chess.engine.Limit(depth=14))
                    except:
                        board.pop()
                        continue

                    score2 = info2["score"].white()
                    board.pop()

                    if score2.is_mate():
                        m2 = abs(score2.mate())
                        if m2 == mate - 1:
                            allowed.append(move.uci())

                if not allowed:
                    continue

                kept += 1

                buckets[mate].append(
                    {
                        "fen": board.fen(),
                        "mateDistance": mate,
                        "allowedMoves": allowed,
                        "target": "a8",
                        "bishopColor": "light"
                    }
                )

    engine.quit()

    print("Writing files...")

    chunks_dir = OUT_ROOT / "chunks"
    chunks_dir.mkdir(parents=True, exist_ok=True)

    theme_chunks = {}

    for mate in range(1, 21):
        items = buckets[mate]

        print(f"mate_{mate}: {len(items)}")

        files = []

        for i in range(0, len(items), CHUNK_SIZE):
            chunk = items[i:i + CHUNK_SIZE]
            filename = f"mate_{mate}_chunk_{i//CHUNK_SIZE+1:03d}.json"

            write_json(chunks_dir / filename, chunk)
            files.append(filename)

        if files:
            theme_chunks[f"mate_{mate}"] = files

    progression = build_progression(theme_chunks)
    write_json(OUT_ROOT / "bn_v3_progression.json", progression)

    print("DONE")


if __name__ == "__main__":
    generate()