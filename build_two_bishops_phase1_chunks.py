import json
import chess

SHORT_START_FEN = "4k3/8/3KBB2/8/8/8/8/8 w - - 0 1"
LONG_START_FEN = "5k2/8/3KBB2/8/8/8/8/8 w - - 0 1"

LINES = [
    {
        "id": "short_d8",
        "start_fen": SHORT_START_FEN,
        "moves": [
            "Bg7", "Kd8",
            "Bf7", "Kc8",
            "Kc6", "Kd8",
            "Bf6+", "Kc8",
            "Be6+", "Kb8",
            "Kb6", "Ka8",
            "Ka6", "Kb8",
            "Be5+", "Ka8",
            "Bd5#",
        ],
    },
    {
        "id": "short_b8_c8_c8",
        "start_fen": SHORT_START_FEN,
        "moves": [
            "Bg7", "Kd8",
            "Bf7", "Kc8",
            "Kc6", "Kb8",
            "Bd4", "Kc8",
            "Bf6", "Kb8",
            "Kb6", "Kc8",
            "Be6+", "Kb8",
            "Be5+", "Ka8",
            "Bd5#",
        ],
    },
    {
        "id": "short_b8_c8_a8",
        "start_fen": SHORT_START_FEN,
        "moves": [
            "Bg7", "Kd8",
            "Bf7", "Kc8",
            "Kc6", "Kb8",
            "Bd4", "Kc8",
            "Bf6", "Kb8",
            "Kb6", "Ka8",
            "Be6", "Kb8",
            "Be5+", "Ka8",
            "Bd5#",
        ],
    },
    {
        "id": "short_b8_a8",
        "start_fen": SHORT_START_FEN,
        "moves": [
            "Bg7", "Kd8",
            "Bf7", "Kc8",
            "Kc6", "Kb8",
            "Bd4", "Ka8",
            "Kb6", "Kb8",
            "Be6", "Ka8",
            "Ka6", "Kb8",
            "Be5+", "Ka8",
            "Bd5#",
        ],
    },
    {
        "id": "long_d8",
        "start_fen": LONG_START_FEN,
        "moves": [
            "Bc3", "Ke8",
            "Bg7", "Kd8",
            "Bf7", "Kc8",
            "Kc6", "Kd8",
            "Bf6+", "Kc8",
            "Be6+", "Kb8",
            "Kb6", "Ka8",
            "Ka6", "Kb8",
            "Be5+", "Ka8",
            "Bd5#",
        ],
    },
    {
        "id": "long_b8_c8_c8",
        "start_fen": LONG_START_FEN,
        "moves": [
            "Bd4", "Ke8",
            "Bg7", "Kd8",
            "Bf7", "Kc8",
            "Kc6", "Kb8",
            "Bd4", "Kc8",
            "Bf6", "Kb8",
            "Kb6", "Kc8",
            "Be6+", "Kb8",
            "Be5+", "Ka8",
            "Bd5#",
        ],
    },
    {
        "id": "long_b8_c8_a8",
        "start_fen": LONG_START_FEN,
        "moves": [
            "Bb2", "Ke8",
            "Bg7", "Kd8",
            "Bf7", "Kc8",
            "Kc6", "Kb8",
            "Bd4", "Kc8",
            "Bf6", "Kb8",
            "Kb6", "Ka8",
            "Be6", "Kb8",
            "Be5+", "Ka8",
            "Bd5#",
        ],
    },
    {
        "id": "long_b8_a8",
        "start_fen": LONG_START_FEN,
        "moves": [
            "Bb2", "Ke8",
            "Bg7", "Kd8",
            "Bf7", "Kc8",
            "Kc6", "Kb8",
            "Bd4", "Ka8",
            "Kb6", "Kb8",
            "Be6", "Ka8",
            "Ka6", "Kb8",
            "Be5+", "Ka8",
            "Bd5#",
        ],
    },
]


def play_line(start_fen: str, san_moves: list[str]) -> list[dict]:
    board = chess.Board(start_fen)
    white_positions = []

    for ply_index, san in enumerate(san_moves):
        if board.turn == chess.WHITE:
            white_positions.append(
                {
                    "fen": board.fen(),
                    "move": san,
                    "ply_index": ply_index,
                }
            )
        board.push_san(san)

    return white_positions


def build_phase1_chunks():
    parsed_lines = []

    for line_no, line in enumerate(LINES, start=1):
        white_positions = play_line(line["start_fen"], line["moves"])
        parsed_lines.append(
            {
                "line_number": line_no,
                "line_id": line["id"],
                "start_fen": line["start_fen"],
                "moves": line["moves"],
                "white_positions": white_positions,
            }
        )

    max_white_len = max(len(line["white_positions"]) for line in parsed_lines)
    chunks = []

    for distance_from_mate in range(1, max_white_len + 1):
        positions = []

        for line in parsed_lines:
            white_positions = line["white_positions"]
            idx = len(white_positions) - distance_from_mate
            if idx >= 0:
                pos = white_positions[idx]
                positions.append(
                    {
                        "line_number": line["line_number"],
                        "line_id": line["line_id"],
                        "distance_from_mate": distance_from_mate,
                        "fen": pos["fen"],
                        "move": pos["move"],
                        "start_fen": line["start_fen"],
                    }
                )

        if positions:
            chunks.append(
                {
                    "chunk_id": f"phase1_m{distance_from_mate}",
                    "label": f"Mate in {distance_from_mate}",
                    "distance_from_mate": distance_from_mate,
                    "positions": positions,
                }
            )

    chunks.append(
        {
            "chunk_id": "phase1_full_lines",
            "label": "Phase 1 full lines",
            "lines": [
                {
                    "line_number": line["line_number"],
                    "line_id": line["line_id"],
                    "start_fen": line["start_fen"],
                    "moves": line["moves"],
                }
                for line in parsed_lines
            ],
        }
    )

    return {
        "phase": 1,
        "line_count": len(parsed_lines),
        "chunks": chunks,
    }


def main():
    data = build_phase1_chunks()
    output_path = "two_bishops_phase1_chunks.json"

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)

    print(f"Created {output_path}")
    print(f"Lines: {data['line_count']}")
    print(f"Chunks: {len(data['chunks'])}")
    for chunk in data["chunks"]:
        if "positions" in chunk:
            print(f"  {chunk['chunk_id']}: {len(chunk['positions'])} positions")
        else:
            print(f"  {chunk['chunk_id']}: {len(chunk['lines'])} lines")


if __name__ == "__main__":
    main()