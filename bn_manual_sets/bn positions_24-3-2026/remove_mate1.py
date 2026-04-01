import json

INPUT_JSON = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bk_d8_typical_300.json"
OUTPUT_JSON = r"C:\Users\Ariel\chess-trainer\bn_manual_sets\bn positions_24-3-2026\bk_d8_typical_no_mate1.json"

def main():
    with open(INPUT_JSON, "r", encoding="utf-8") as f:
        data = json.load(f)

    filtered = [x for x in data if x.get("mate_distance") != 1]

    counts = {}
    for x in filtered:
        md = x["mate_distance"]
        counts[md] = counts.get(md, 0) + 1

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(filtered, f, indent=2)

    print("=== FINISHED ===")
    print("Original:", len(data))
    print("After removing mate in 1:", len(filtered))
    print("Distribution:")
    for k in sorted(counts):
        print("mate in", k, ":", counts[k])

if __name__ == "__main__":
    main()