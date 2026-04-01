import os
import json
import subprocess
import time
from collections import defaultdict

# =========================
# PATHS
# =========================
INPUT_FOLDER = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bn2\4"
OUTPUT_FOLDER = os.path.join(INPUT_FOLDER, "5")

ENGINE_PATH = r"C:\Users\Ariel\chess-trainer\stockfish-windows-x86-64-avx2\stockfish\stockfish-windows-x86-64-avx2.exe"

TARGET_FILES = [
    "bn_global_mates1_3_reduced.json",
    "bn_global_mates4_8_reduced.json",
    "bn_global_mates9_plus_reduced.json",
]

SEARCH_DEPTH = 18          # can raise to 20 if needed
WRITE_INDENT = 2
PRINT_EVERY = 100

os.makedirs(OUTPUT_FOLDER, exist_ok=True)


# =========================
# ENGINE
# =========================
class UCIEngine:
    def __init__(self, engine_path):
        self.p = subprocess.Popen(
            [engine_path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1,
        )
        self._send("uci")
        self._wait_for("uciok")
        self._send("isready")
        self._wait_for("readyok")

        # Conservative threads/hash so it stays stable
        self._send("setoption name Threads value 1")
        self._send("setoption name Hash value 128")
        self._send("isready")
        self._wait_for("readyok")

    def _send(self, cmd):
        self.p.stdin.write(cmd + "\n")
        self.p.stdin.flush()

    def _readline(self):
        return self.p.stdout.readline().strip()

    def _wait_for(self, token, timeout=30):
        start = time.time()
        while time.time() - start < timeout:
            line = self._readline()
            if token in line:
                return
        raise TimeoutError(f"Timed out waiting for {token}")

    def get_mate_distance(self, fen, depth=18):
        """
        Returns:
            int mate distance if Stockfish reports mate
            None if no mate score found
        """
        self._send(f"position fen {fen}")
        self._send(f"go depth {depth}")

        best_mate = None

        while True:
            line = self._readline()

            # Example:
            # info depth 18 score mate 3 ...
            # info depth 17 score cp 123 ...
            if " score mate " in line:
                try:
                    part = line.split(" score mate ", 1)[1]
                    mate_token = part.split()[0]
                    best_mate = int(mate_token)
                except Exception:
                    pass

            if line.startswith("bestmove"):
                break

        if best_mate is None:
            return None

        return abs(best_mate)

    def close(self):
        try:
            self._send("quit")
        except Exception:
            pass
        try:
            self.p.terminate()
        except Exception:
            pass


# =========================
# HELPERS
# =========================
def get_black_king_square_from_fen(fen):
    board = fen.split()[0]
    ranks = board.split("/")

    for r_index, rank in enumerate(ranks):
        file_index = 0
        for ch in rank:
            if ch.isdigit():
                file_index += int(ch)
            else:
                if ch == "k":
                    file_letter = "abcdefgh"[file_index]
                    rank_number = 8 - r_index
                    return f"{file_letter}{rank_number}"
                file_index += 1
    return "unknown"


def get_black_king_square(pos):
    bk = pos.get("black_king")
    if bk:
        return bk
    fen = pos.get("fen", "")
    return get_black_king_square_from_fen(fen)


# =========================
# MAIN
# =========================
def main():
    engine = UCIEngine(ENGINE_PATH)
    groups = defaultdict(list)

    total_positions = 0
    exact_mates = 0
    no_mates = 0

    try:
        for filename in TARGET_FILES:
            path = os.path.join(INPUT_FOLDER, filename)

            if not os.path.exists(path):
                print(f"[SKIP] missing file: {filename}")
                continue

            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)

            if not isinstance(data, list):
                print(f"[SKIP] not a list: {filename}")
                continue

            print(f"\n[LOAD] {filename}: {len(data)}")

            for i, pos in enumerate(data, start=1):
                if not isinstance(pos, dict):
                    continue

                fen = pos.get("fen")
                if not fen:
                    continue

                bk = get_black_king_square(pos)
                mate = engine.get_mate_distance(fen, depth=SEARCH_DEPTH)

                if mate is None:
                    key = f"no_mate__bk_{bk}"
                    no_mates += 1
                else:
                    key = f"mate_{mate}__bk_{bk}"
                    exact_mates += 1

                groups[key].append(pos)
                total_positions += 1

                if i % PRINT_EVERY == 0:
                    print(
                        f"  [{filename}] scanned {i}/{len(data)} | "
                        f"total={total_positions} | exact_mates={exact_mates} | no_mates={no_mates}"
                    )

        print("\n[WRITE PHASE]")
        written = 0
        for key in sorted(groups.keys()):
            out_path = os.path.join(OUTPUT_FOLDER, f"{key}.json")
            with open(out_path, "w", encoding="utf-8") as f:
                json.dump(groups[key], f, ensure_ascii=False, indent=WRITE_INDENT)
            written += 1
            print(f"[WRITE] {key}: {len(groups[key])}")

        print("\n=== FINISHED ===")
        print("positions scanned:", total_positions)
        print("exact mates found:", exact_mates)
        print("no mate found:", no_mates)
        print("files written:", written)
        print("output folder:", OUTPUT_FOLDER)

    finally:
        engine.close()


if __name__ == "__main__":
    main()