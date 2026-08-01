# Pattern Tactics M1–M4 semantic correctness audit

Read-only audit; source and learner records are replayed independently. Tier C results are **manual-review candidates**, not assertions of semantic failure.

- Source: 198 courses / 58544 records
- Learner: 198 courses / 28560 records

## Validator coverage

| Theme | Confidence tier |
|---|---|
| Advanced Pawn | C |
| Attacking F2 F7 | B |
| Bishop Fork | A |
| Bishop Pin | A |
| Bishop Sacrifice | C |
| Bishop Skewer | A |
| Bishop Xray | B |
| Clearance | C |
| Clearance Sacrifice | C |
| Decoy Attraction | C |
| Decoy Deflection | C |
| Defense | C |
| Deflection | C |
| Discovered Attack | A |
| Discovered Check | A |
| Double Check | A |
| En Passant | A |
| Hanging Piece | B |
| Interference | C |
| Interference Sacrifice | C |
| King Fork | A |
| King Sacrifice | C |
| Kingside Attack | C |
| Knight Fork | A |
| Knight Sacrifice | C |
| Knight Underpromotion | A |
| Other Pin | B |
| Other Skewer | B |
| Other Xray | B |
| Pawn Fork | A |
| Pawn Sacrifice | C |
| Promotion | A |
| Queen Fork | A |
| Queen Pin | A |
| Queen Sacrifice | C |
| Queen Skewer | A |
| Queen Xray | B |
| Queenside Attack | C |
| Quiet Move | C |
| Remove The Defender | B |
| Rook Fork | A |
| Rook Pin | A |
| Rook Sacrifice | C |
| Rook Skewer | A |
| Rook Xray | B |
| Trapped Piece | B |
| Underpromotion | A |
| Vulnerable King | C |
| Zugzwang | C |
| Zwischenzug | C |

## Full course table

| Dataset | Theme | Stage | Records | Valid | Weak | Ambiguous | Misclassified | Broken | False-positive % | Tier |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| source | Advanced Pawn | M1 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Advanced Pawn | M1 | 100 | 0 | 0 | 100 | 0 | 0 | 0% | C |
| source | Advanced Pawn | M2 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Advanced Pawn | M2 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Advanced Pawn | M3 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Advanced Pawn | M3 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Advanced Pawn | M4 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Advanced Pawn | M4 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Attacking F2 F7 | M1 | 300 | 0 | 259 | 41 | 0 | 0 | 0% | B |
| learner | Attacking F2 F7 | M1 | 100 | 0 | 85 | 15 | 0 | 0 | 0% | B |
| source | Attacking F2 F7 | M2 | 300 | 0 | 273 | 27 | 0 | 0 | 0% | B |
| learner | Attacking F2 F7 | M2 | 160 | 0 | 146 | 14 | 0 | 0 | 0% | B |
| source | Attacking F2 F7 | M3 | 300 | 0 | 259 | 41 | 0 | 0 | 0% | B |
| learner | Attacking F2 F7 | M3 | 160 | 0 | 138 | 22 | 0 | 0 | 0% | B |
| source | Attacking F2 F7 | M4 | 300 | 0 | 234 | 66 | 0 | 0 | 0% | B |
| learner | Attacking F2 F7 | M4 | 160 | 0 | 122 | 38 | 0 | 0 | 0% | B |
| source | Bishop Fork | M1 | 300 | 147 | 0 | 0 | 153 | 0 | 51% | A |
| learner | Bishop Fork | M1 | 100 | 50 | 0 | 0 | 50 | 0 | 50% | A |
| source | Bishop Fork | M2 | 300 | 300 | 0 | 0 | 0 | 0 | 0% | A |
| learner | Bishop Fork | M2 | 160 | 160 | 0 | 0 | 0 | 0 | 0% | A |
| source | Bishop Fork | M3 | 300 | 104 | 0 | 0 | 196 | 0 | 65.33% | A |
| learner | Bishop Fork | M3 | 160 | 54 | 0 | 0 | 106 | 0 | 66.25% | A |
| source | Bishop Fork | M4 | 300 | 67 | 0 | 0 | 233 | 0 | 77.67% | A |
| learner | Bishop Fork | M4 | 160 | 35 | 0 | 0 | 125 | 0 | 78.13% | A |
| source | Bishop Pin | M1 | 300 | 142 | 0 | 0 | 158 | 0 | 52.67% | A |
| learner | Bishop Pin | M1 | 100 | 49 | 0 | 0 | 51 | 0 | 51% | A |
| source | Bishop Pin | M2 | 300 | 226 | 0 | 0 | 74 | 0 | 24.67% | A |
| learner | Bishop Pin | M2 | 160 | 113 | 0 | 0 | 47 | 0 | 29.38% | A |
| source | Bishop Pin | M3 | 300 | 146 | 0 | 0 | 154 | 0 | 51.33% | A |
| learner | Bishop Pin | M3 | 160 | 76 | 0 | 0 | 84 | 0 | 52.5% | A |
| source | Bishop Pin | M4 | 300 | 81 | 0 | 0 | 219 | 0 | 73% | A |
| learner | Bishop Pin | M4 | 160 | 45 | 0 | 0 | 115 | 0 | 71.88% | A |
| source | Bishop Sacrifice | M1 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Bishop Sacrifice | M1 | 100 | 0 | 0 | 100 | 0 | 0 | 0% | C |
| source | Bishop Sacrifice | M2 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Bishop Sacrifice | M2 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Bishop Sacrifice | M3 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Bishop Sacrifice | M3 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Bishop Sacrifice | M4 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Bishop Sacrifice | M4 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Bishop Skewer | M1 | 300 | 166 | 0 | 0 | 134 | 0 | 44.67% | A |
| learner | Bishop Skewer | M1 | 100 | 52 | 0 | 0 | 48 | 0 | 48% | A |
| source | Bishop Skewer | M2 | 300 | 293 | 0 | 0 | 7 | 0 | 2.33% | A |
| learner | Bishop Skewer | M2 | 160 | 156 | 0 | 0 | 4 | 0 | 2.5% | A |
| source | Bishop Skewer | M3 | 300 | 125 | 0 | 0 | 175 | 0 | 58.33% | A |
| learner | Bishop Skewer | M3 | 160 | 75 | 0 | 0 | 85 | 0 | 53.13% | A |
| source | Bishop Skewer | M4 | 300 | 77 | 0 | 0 | 223 | 0 | 74.33% | A |
| learner | Bishop Skewer | M4 | 160 | 36 | 0 | 0 | 124 | 0 | 77.5% | A |
| source | Bishop Xray | M1 | 300 | 0 | 177 | 123 | 0 | 0 | 0% | B |
| learner | Bishop Xray | M1 | 100 | 0 | 57 | 43 | 0 | 0 | 0% | B |
| source | Bishop Xray | M2 | 195 | 0 | 127 | 68 | 0 | 0 | 0% | B |
| learner | Bishop Xray | M2 | 160 | 0 | 105 | 55 | 0 | 0 | 0% | B |
| source | Bishop Xray | M3 | 300 | 0 | 175 | 125 | 0 | 0 | 0% | B |
| learner | Bishop Xray | M3 | 160 | 0 | 90 | 70 | 0 | 0 | 0% | B |
| source | Bishop Xray | M4 | 174 | 0 | 104 | 70 | 0 | 0 | 0% | B |
| learner | Bishop Xray | M4 | 160 | 0 | 97 | 63 | 0 | 0 | 0% | B |
| source | Clearance | M1 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Clearance | M1 | 100 | 0 | 0 | 100 | 0 | 0 | 0% | C |
| source | Clearance | M2 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Clearance | M2 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Clearance | M3 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Clearance | M3 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Clearance | M4 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Clearance | M4 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Clearance Sacrifice | M1 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Clearance Sacrifice | M1 | 100 | 0 | 0 | 100 | 0 | 0 | 0% | C |
| source | Clearance Sacrifice | M2 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Clearance Sacrifice | M2 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Clearance Sacrifice | M3 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Clearance Sacrifice | M3 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Clearance Sacrifice | M4 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Clearance Sacrifice | M4 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Decoy Attraction | M1 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Decoy Attraction | M1 | 100 | 0 | 0 | 100 | 0 | 0 | 0% | C |
| source | Decoy Attraction | M2 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Decoy Attraction | M2 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Decoy Attraction | M3 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Decoy Attraction | M3 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Decoy Attraction | M4 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Decoy Attraction | M4 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Decoy Deflection | M1 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Decoy Deflection | M1 | 100 | 0 | 0 | 100 | 0 | 0 | 0% | C |
| source | Decoy Deflection | M2 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Decoy Deflection | M2 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Decoy Deflection | M3 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Decoy Deflection | M3 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Decoy Deflection | M4 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Decoy Deflection | M4 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Defense | M1 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Defense | M1 | 100 | 0 | 0 | 100 | 0 | 0 | 0% | C |
| source | Defense | M2 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Defense | M2 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Defense | M3 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Defense | M3 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Defense | M4 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Defense | M4 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Deflection | M1 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Deflection | M1 | 100 | 0 | 0 | 100 | 0 | 0 | 0% | C |
| source | Deflection | M2 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Deflection | M2 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Deflection | M3 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Deflection | M3 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Deflection | M4 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Deflection | M4 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Discovered Attack | M1 | 300 | 141 | 0 | 0 | 159 | 0 | 53% | A |
| learner | Discovered Attack | M1 | 100 | 53 | 0 | 0 | 47 | 0 | 47% | A |
| source | Discovered Attack | M2 | 300 | 265 | 0 | 0 | 35 | 0 | 11.67% | A |
| learner | Discovered Attack | M2 | 160 | 143 | 0 | 0 | 17 | 0 | 10.63% | A |
| source | Discovered Attack | M3 | 300 | 126 | 0 | 0 | 174 | 0 | 58% | A |
| learner | Discovered Attack | M3 | 160 | 63 | 0 | 0 | 97 | 0 | 60.62% | A |
| source | Discovered Attack | M4 | 300 | 92 | 0 | 0 | 208 | 0 | 69.33% | A |
| learner | Discovered Attack | M4 | 160 | 53 | 0 | 0 | 107 | 0 | 66.88% | A |
| source | Discovered Check | M1 | 300 | 120 | 0 | 0 | 180 | 0 | 60% | A |
| learner | Discovered Check | M1 | 100 | 44 | 0 | 0 | 56 | 0 | 56% | A |
| source | Discovered Check | M2 | 300 | 201 | 0 | 0 | 99 | 0 | 33% | A |
| learner | Discovered Check | M2 | 160 | 98 | 0 | 0 | 62 | 0 | 38.75% | A |
| source | Discovered Check | M3 | 300 | 94 | 0 | 0 | 206 | 0 | 68.67% | A |
| learner | Discovered Check | M3 | 160 | 45 | 0 | 0 | 115 | 0 | 71.88% | A |
| source | Discovered Check | M4 | 300 | 73 | 0 | 0 | 227 | 0 | 75.67% | A |
| learner | Discovered Check | M4 | 160 | 38 | 0 | 0 | 122 | 0 | 76.25% | A |
| source | Double Check | M1 | 300 | 121 | 0 | 0 | 179 | 0 | 59.67% | A |
| learner | Double Check | M1 | 100 | 41 | 0 | 0 | 59 | 0 | 59% | A |
| source | Double Check | M2 | 300 | 186 | 0 | 0 | 114 | 0 | 38% | A |
| learner | Double Check | M2 | 160 | 98 | 0 | 0 | 62 | 0 | 38.75% | A |
| source | Double Check | M3 | 300 | 108 | 0 | 0 | 192 | 0 | 64% | A |
| learner | Double Check | M3 | 160 | 64 | 0 | 0 | 96 | 0 | 60% | A |
| source | Double Check | M4 | 300 | 95 | 0 | 0 | 205 | 0 | 68.33% | A |
| learner | Double Check | M4 | 160 | 46 | 0 | 0 | 114 | 0 | 71.25% | A |
| source | En Passant | M1 | 300 | 124 | 0 | 0 | 176 | 0 | 58.67% | A |
| learner | En Passant | M1 | 100 | 47 | 0 | 0 | 53 | 0 | 53% | A |
| source | En Passant | M2 | 300 | 300 | 0 | 0 | 0 | 0 | 0% | A |
| learner | En Passant | M2 | 160 | 160 | 0 | 0 | 0 | 0 | 0% | A |
| source | En Passant | M3 | 300 | 300 | 0 | 0 | 0 | 0 | 0% | A |
| learner | En Passant | M3 | 160 | 160 | 0 | 0 | 0 | 0 | 0% | A |
| source | En Passant | M4 | 300 | 300 | 0 | 0 | 0 | 0 | 0% | A |
| learner | En Passant | M4 | 160 | 160 | 0 | 0 | 0 | 0 | 0% | A |
| source | Hanging Piece | M1 | 300 | 0 | 83 | 217 | 0 | 0 | 0% | B |
| learner | Hanging Piece | M1 | 100 | 0 | 25 | 75 | 0 | 0 | 0% | B |
| source | Hanging Piece | M2 | 300 | 0 | 88 | 212 | 0 | 0 | 0% | B |
| learner | Hanging Piece | M2 | 160 | 0 | 44 | 116 | 0 | 0 | 0% | B |
| source | Hanging Piece | M3 | 300 | 0 | 81 | 219 | 0 | 0 | 0% | B |
| learner | Hanging Piece | M3 | 160 | 0 | 57 | 103 | 0 | 0 | 0% | B |
| source | Hanging Piece | M4 | 300 | 0 | 117 | 183 | 0 | 0 | 0% | B |
| learner | Hanging Piece | M4 | 160 | 0 | 64 | 96 | 0 | 0 | 0% | B |
| source | Interference | M1 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Interference | M1 | 100 | 0 | 0 | 100 | 0 | 0 | 0% | C |
| source | Interference | M2 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Interference | M2 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Interference | M3 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Interference | M3 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Interference | M4 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Interference | M4 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Interference Sacrifice | M1 | 161 | 0 | 0 | 161 | 0 | 0 | 0% | C |
| learner | Interference Sacrifice | M1 | 100 | 0 | 0 | 100 | 0 | 0 | 0% | C |
| source | Interference Sacrifice | M2 | 56 | 0 | 0 | 56 | 0 | 0 | 0% | C |
| learner | Interference Sacrifice | M2 | 40 | 0 | 0 | 40 | 0 | 0 | 0% | C |
| source | Interference Sacrifice | M3 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Interference Sacrifice | M3 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Interference Sacrifice | M4 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Interference Sacrifice | M4 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | King Fork | M1 | 208 | 88 | 0 | 0 | 120 | 0 | 57.69% | A |
| learner | King Fork | M1 | 100 | 49 | 0 | 0 | 51 | 0 | 51% | A |
| source | King Fork | M3 | 300 | 8 | 0 | 0 | 292 | 0 | 97.33% | A |
| learner | King Fork | M3 | 160 | 4 | 0 | 0 | 156 | 0 | 97.5% | A |
| source | King Fork | M4 | 300 | 5 | 0 | 0 | 295 | 0 | 98.33% | A |
| learner | King Fork | M4 | 160 | 4 | 0 | 0 | 156 | 0 | 97.5% | A |
| source | King Sacrifice | M1 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | King Sacrifice | M1 | 100 | 0 | 0 | 100 | 0 | 0 | 0% | C |
| source | King Sacrifice | M2 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | King Sacrifice | M2 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | King Sacrifice | M3 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | King Sacrifice | M3 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | King Sacrifice | M4 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | King Sacrifice | M4 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Kingside Attack | M1 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Kingside Attack | M1 | 100 | 0 | 0 | 100 | 0 | 0 | 0% | C |
| source | Kingside Attack | M2 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Kingside Attack | M2 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Kingside Attack | M3 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Kingside Attack | M3 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Kingside Attack | M4 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Kingside Attack | M4 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Knight Fork | M1 | 300 | 182 | 0 | 0 | 118 | 0 | 39.33% | A |
| learner | Knight Fork | M1 | 100 | 60 | 0 | 0 | 40 | 0 | 40% | A |
| source | Knight Fork | M2 | 300 | 300 | 0 | 0 | 0 | 0 | 0% | A |
| learner | Knight Fork | M2 | 160 | 160 | 0 | 0 | 0 | 0 | 0% | A |
| source | Knight Fork | M3 | 300 | 163 | 0 | 0 | 137 | 0 | 45.67% | A |
| learner | Knight Fork | M3 | 160 | 77 | 0 | 0 | 83 | 0 | 51.88% | A |
| source | Knight Fork | M4 | 300 | 138 | 0 | 0 | 162 | 0 | 54% | A |
| learner | Knight Fork | M4 | 160 | 72 | 0 | 0 | 88 | 0 | 55% | A |
| source | Knight Sacrifice | M1 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Knight Sacrifice | M1 | 100 | 0 | 0 | 100 | 0 | 0 | 0% | C |
| source | Knight Sacrifice | M2 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Knight Sacrifice | M2 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Knight Sacrifice | M3 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Knight Sacrifice | M3 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Knight Sacrifice | M4 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Knight Sacrifice | M4 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Knight Underpromotion | M1 | 269 | 264 | 5 | 0 | 0 | 0 | 0% | A |
| learner | Knight Underpromotion | M1 | 100 | 99 | 1 | 0 | 0 | 0 | 0% | A |
| source | Knight Underpromotion | M2 | 244 | 239 | 3 | 0 | 2 | 0 | 0.82% | A |
| learner | Knight Underpromotion | M2 | 160 | 156 | 2 | 0 | 2 | 0 | 1.25% | A |
| source | Knight Underpromotion | M3 | 300 | 286 | 5 | 0 | 9 | 0 | 3% | A |
| learner | Knight Underpromotion | M3 | 160 | 154 | 2 | 0 | 4 | 0 | 2.5% | A |
| source | Knight Underpromotion | M4 | 300 | 267 | 10 | 0 | 23 | 0 | 7.67% | A |
| learner | Knight Underpromotion | M4 | 160 | 138 | 5 | 0 | 17 | 0 | 10.63% | A |
| source | Other Pin | M1 | 300 | 225 | 0 | 0 | 75 | 0 | 25% | B |
| learner | Other Pin | M1 | 100 | 71 | 0 | 0 | 29 | 0 | 29% | B |
| source | Other Pin | M2 | 300 | 275 | 0 | 0 | 25 | 0 | 8.33% | B |
| learner | Other Pin | M2 | 160 | 147 | 0 | 0 | 13 | 0 | 8.13% | B |
| source | Other Pin | M3 | 300 | 208 | 0 | 0 | 92 | 0 | 30.67% | B |
| learner | Other Pin | M3 | 160 | 106 | 0 | 0 | 54 | 0 | 33.75% | B |
| source | Other Pin | M4 | 300 | 185 | 0 | 0 | 115 | 0 | 38.33% | B |
| learner | Other Pin | M4 | 160 | 103 | 0 | 0 | 57 | 0 | 35.63% | B |
| source | Other Skewer | M1 | 300 | 102 | 0 | 0 | 198 | 0 | 66% | B |
| learner | Other Skewer | M1 | 100 | 33 | 0 | 0 | 67 | 0 | 67% | B |
| source | Other Skewer | M2 | 300 | 300 | 0 | 0 | 0 | 0 | 0% | B |
| learner | Other Skewer | M2 | 160 | 160 | 0 | 0 | 0 | 0 | 0% | B |
| source | Other Skewer | M3 | 300 | 28 | 0 | 0 | 272 | 0 | 90.67% | B |
| learner | Other Skewer | M3 | 160 | 14 | 0 | 0 | 146 | 0 | 91.25% | B |
| source | Other Skewer | M4 | 300 | 27 | 0 | 0 | 273 | 0 | 91% | B |
| learner | Other Skewer | M4 | 160 | 16 | 0 | 0 | 144 | 0 | 90% | B |
| source | Other Xray | M1 | 300 | 0 | 283 | 17 | 0 | 0 | 0% | B |
| learner | Other Xray | M1 | 100 | 0 | 95 | 5 | 0 | 0 | 0% | B |
| source | Other Xray | M2 | 300 | 0 | 300 | 0 | 0 | 0 | 0% | B |
| learner | Other Xray | M2 | 160 | 0 | 160 | 0 | 0 | 0 | 0% | B |
| source | Other Xray | M3 | 300 | 0 | 276 | 24 | 0 | 0 | 0% | B |
| learner | Other Xray | M3 | 160 | 0 | 149 | 11 | 0 | 0 | 0% | B |
| source | Other Xray | M4 | 289 | 0 | 253 | 36 | 0 | 0 | 0% | B |
| learner | Other Xray | M4 | 160 | 0 | 138 | 22 | 0 | 0 | 0% | B |
| source | Pawn Fork | M1 | 300 | 133 | 0 | 0 | 167 | 0 | 55.67% | A |
| learner | Pawn Fork | M1 | 100 | 47 | 0 | 0 | 53 | 0 | 53% | A |
| source | Pawn Fork | M2 | 300 | 296 | 0 | 0 | 4 | 0 | 1.33% | A |
| learner | Pawn Fork | M2 | 160 | 157 | 0 | 0 | 3 | 0 | 1.88% | A |
| source | Pawn Fork | M3 | 300 | 135 | 0 | 0 | 165 | 0 | 55% | A |
| learner | Pawn Fork | M3 | 160 | 71 | 0 | 0 | 89 | 0 | 55.63% | A |
| source | Pawn Fork | M4 | 300 | 83 | 0 | 0 | 217 | 0 | 72.33% | A |
| learner | Pawn Fork | M4 | 160 | 50 | 0 | 0 | 110 | 0 | 68.75% | A |
| source | Pawn Sacrifice | M1 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Pawn Sacrifice | M1 | 100 | 0 | 0 | 100 | 0 | 0 | 0% | C |
| source | Pawn Sacrifice | M2 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Pawn Sacrifice | M2 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Pawn Sacrifice | M3 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Pawn Sacrifice | M3 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Pawn Sacrifice | M4 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Pawn Sacrifice | M4 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Promotion | M1 | 300 | 47 | 0 | 0 | 253 | 0 | 84.33% | A |
| learner | Promotion | M1 | 100 | 18 | 0 | 0 | 82 | 0 | 82% | A |
| source | Promotion | M2 | 300 | 300 | 0 | 0 | 0 | 0 | 0% | A |
| learner | Promotion | M2 | 160 | 160 | 0 | 0 | 0 | 0 | 0% | A |
| source | Promotion | M3 | 300 | 300 | 0 | 0 | 0 | 0 | 0% | A |
| learner | Promotion | M3 | 160 | 160 | 0 | 0 | 0 | 0 | 0% | A |
| source | Promotion | M4 | 300 | 300 | 0 | 0 | 0 | 0 | 0% | A |
| learner | Promotion | M4 | 160 | 160 | 0 | 0 | 0 | 0 | 0% | A |
| source | Queen Fork | M1 | 300 | 189 | 0 | 0 | 111 | 0 | 37% | A |
| learner | Queen Fork | M1 | 100 | 67 | 0 | 0 | 33 | 0 | 33% | A |
| source | Queen Fork | M2 | 300 | 300 | 0 | 0 | 0 | 0 | 0% | A |
| learner | Queen Fork | M2 | 160 | 160 | 0 | 0 | 0 | 0 | 0% | A |
| source | Queen Fork | M3 | 300 | 167 | 0 | 0 | 133 | 0 | 44.33% | A |
| learner | Queen Fork | M3 | 160 | 94 | 0 | 0 | 66 | 0 | 41.25% | A |
| source | Queen Fork | M4 | 300 | 154 | 0 | 0 | 146 | 0 | 48.67% | A |
| learner | Queen Fork | M4 | 160 | 86 | 0 | 0 | 74 | 0 | 46.25% | A |
| source | Queen Pin | M1 | 300 | 109 | 0 | 0 | 191 | 0 | 63.67% | A |
| learner | Queen Pin | M1 | 100 | 41 | 0 | 0 | 59 | 0 | 59% | A |
| source | Queen Pin | M2 | 300 | 128 | 0 | 0 | 172 | 0 | 57.33% | A |
| learner | Queen Pin | M2 | 160 | 57 | 0 | 0 | 103 | 0 | 64.38% | A |
| source | Queen Pin | M3 | 300 | 117 | 0 | 0 | 183 | 0 | 61% | A |
| learner | Queen Pin | M3 | 160 | 60 | 0 | 0 | 100 | 0 | 62.5% | A |
| source | Queen Pin | M4 | 300 | 98 | 0 | 0 | 202 | 0 | 67.33% | A |
| learner | Queen Pin | M4 | 160 | 46 | 0 | 0 | 114 | 0 | 71.25% | A |
| source | Queen Sacrifice | M1 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Queen Sacrifice | M1 | 100 | 0 | 0 | 100 | 0 | 0 | 0% | C |
| source | Queen Sacrifice | M2 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Queen Sacrifice | M2 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Queen Sacrifice | M3 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Queen Sacrifice | M3 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Queen Sacrifice | M4 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Queen Sacrifice | M4 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Queen Skewer | M1 | 300 | 172 | 0 | 0 | 128 | 0 | 42.67% | A |
| learner | Queen Skewer | M1 | 100 | 53 | 0 | 0 | 47 | 0 | 47% | A |
| source | Queen Skewer | M2 | 300 | 297 | 0 | 0 | 3 | 0 | 1% | A |
| learner | Queen Skewer | M2 | 160 | 158 | 0 | 0 | 2 | 0 | 1.25% | A |
| source | Queen Skewer | M3 | 300 | 126 | 0 | 0 | 174 | 0 | 58% | A |
| learner | Queen Skewer | M3 | 160 | 72 | 0 | 0 | 88 | 0 | 55% | A |
| source | Queen Skewer | M4 | 300 | 87 | 0 | 0 | 213 | 0 | 71% | A |
| learner | Queen Skewer | M4 | 160 | 49 | 0 | 0 | 111 | 0 | 69.38% | A |
| source | Queen Xray | M1 | 300 | 0 | 278 | 22 | 0 | 0 | 0% | B |
| learner | Queen Xray | M1 | 100 | 0 | 94 | 6 | 0 | 0 | 0% | B |
| source | Queen Xray | M2 | 300 | 0 | 300 | 0 | 0 | 0 | 0% | B |
| learner | Queen Xray | M2 | 160 | 0 | 160 | 0 | 0 | 0 | 0% | B |
| source | Queen Xray | M3 | 300 | 0 | 260 | 40 | 0 | 0 | 0% | B |
| learner | Queen Xray | M3 | 160 | 0 | 136 | 24 | 0 | 0 | 0% | B |
| source | Queen Xray | M4 | 300 | 0 | 268 | 32 | 0 | 0 | 0% | B |
| learner | Queen Xray | M4 | 160 | 0 | 140 | 20 | 0 | 0 | 0% | B |
| source | Queenside Attack | M1 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Queenside Attack | M1 | 100 | 0 | 0 | 100 | 0 | 0 | 0% | C |
| source | Queenside Attack | M2 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Queenside Attack | M2 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Queenside Attack | M3 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Queenside Attack | M3 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Queenside Attack | M4 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Queenside Attack | M4 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Quiet Move | M1 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Quiet Move | M1 | 100 | 0 | 0 | 100 | 0 | 0 | 0% | C |
| source | Quiet Move | M2 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Quiet Move | M2 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Quiet Move | M3 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Quiet Move | M3 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Quiet Move | M4 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Quiet Move | M4 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Remove The Defender | M1 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | B |
| learner | Remove The Defender | M1 | 100 | 0 | 0 | 100 | 0 | 0 | 0% | B |
| source | Remove The Defender | M2 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | B |
| learner | Remove The Defender | M2 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | B |
| source | Remove The Defender | M3 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | B |
| learner | Remove The Defender | M3 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | B |
| source | Remove The Defender | M4 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | B |
| learner | Remove The Defender | M4 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | B |
| source | Rook Fork | M1 | 300 | 102 | 0 | 0 | 198 | 0 | 66% | A |
| learner | Rook Fork | M1 | 100 | 33 | 0 | 0 | 67 | 0 | 67% | A |
| source | Rook Fork | M2 | 300 | 300 | 0 | 0 | 0 | 0 | 0% | A |
| learner | Rook Fork | M2 | 160 | 160 | 0 | 0 | 0 | 0 | 0% | A |
| source | Rook Fork | M3 | 300 | 55 | 0 | 0 | 245 | 0 | 81.67% | A |
| learner | Rook Fork | M3 | 160 | 31 | 0 | 0 | 129 | 0 | 80.63% | A |
| source | Rook Fork | M4 | 300 | 73 | 0 | 0 | 227 | 0 | 75.67% | A |
| learner | Rook Fork | M4 | 160 | 42 | 0 | 0 | 118 | 0 | 73.75% | A |
| source | Rook Pin | M1 | 300 | 106 | 0 | 0 | 194 | 0 | 64.67% | A |
| learner | Rook Pin | M1 | 100 | 43 | 0 | 0 | 57 | 0 | 57% | A |
| source | Rook Pin | M2 | 300 | 178 | 0 | 0 | 122 | 0 | 40.67% | A |
| learner | Rook Pin | M2 | 160 | 94 | 0 | 0 | 66 | 0 | 41.25% | A |
| source | Rook Pin | M3 | 300 | 96 | 0 | 0 | 204 | 0 | 68% | A |
| learner | Rook Pin | M3 | 160 | 51 | 0 | 0 | 109 | 0 | 68.13% | A |
| source | Rook Pin | M4 | 300 | 86 | 0 | 0 | 214 | 0 | 71.33% | A |
| learner | Rook Pin | M4 | 160 | 48 | 0 | 0 | 112 | 0 | 70% | A |
| source | Rook Sacrifice | M1 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Rook Sacrifice | M1 | 100 | 0 | 0 | 100 | 0 | 0 | 0% | C |
| source | Rook Sacrifice | M2 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Rook Sacrifice | M2 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Rook Sacrifice | M3 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Rook Sacrifice | M3 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Rook Sacrifice | M4 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Rook Sacrifice | M4 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Rook Skewer | M1 | 300 | 179 | 0 | 0 | 121 | 0 | 40.33% | A |
| learner | Rook Skewer | M1 | 100 | 57 | 0 | 0 | 43 | 0 | 43% | A |
| source | Rook Skewer | M2 | 300 | 299 | 0 | 0 | 1 | 0 | 0.33% | A |
| learner | Rook Skewer | M2 | 160 | 160 | 0 | 0 | 0 | 0 | 0% | A |
| source | Rook Skewer | M3 | 300 | 115 | 0 | 0 | 185 | 0 | 61.67% | A |
| learner | Rook Skewer | M3 | 160 | 58 | 0 | 0 | 102 | 0 | 63.75% | A |
| source | Rook Skewer | M4 | 300 | 116 | 0 | 0 | 184 | 0 | 61.33% | A |
| learner | Rook Skewer | M4 | 160 | 65 | 0 | 0 | 95 | 0 | 59.38% | A |
| source | Rook Xray | M1 | 300 | 0 | 225 | 75 | 0 | 0 | 0% | B |
| learner | Rook Xray | M1 | 100 | 0 | 75 | 25 | 0 | 0 | 0% | B |
| source | Rook Xray | M2 | 300 | 0 | 209 | 91 | 0 | 0 | 0% | B |
| learner | Rook Xray | M2 | 160 | 0 | 117 | 43 | 0 | 0 | 0% | B |
| source | Rook Xray | M3 | 300 | 0 | 265 | 35 | 0 | 0 | 0% | B |
| learner | Rook Xray | M3 | 160 | 0 | 141 | 19 | 0 | 0 | 0% | B |
| source | Rook Xray | M4 | 300 | 0 | 222 | 78 | 0 | 0 | 0% | B |
| learner | Rook Xray | M4 | 160 | 0 | 117 | 43 | 0 | 0 | 0% | B |
| source | Trapped Piece | M1 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | B |
| learner | Trapped Piece | M1 | 100 | 0 | 0 | 100 | 0 | 0 | 0% | B |
| source | Trapped Piece | M2 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | B |
| learner | Trapped Piece | M2 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | B |
| source | Trapped Piece | M3 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | B |
| learner | Trapped Piece | M3 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | B |
| source | Trapped Piece | M4 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | B |
| learner | Trapped Piece | M4 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | B |
| source | Underpromotion | M1 | 300 | 88 | 1 | 0 | 211 | 0 | 70.33% | A |
| learner | Underpromotion | M1 | 100 | 30 | 0 | 0 | 70 | 0 | 70% | A |
| source | Underpromotion | M2 | 248 | 242 | 4 | 0 | 2 | 0 | 0.81% | A |
| learner | Underpromotion | M2 | 160 | 155 | 3 | 0 | 2 | 0 | 1.25% | A |
| source | Underpromotion | M3 | 300 | 289 | 5 | 0 | 6 | 0 | 2% | A |
| learner | Underpromotion | M3 | 160 | 154 | 2 | 0 | 4 | 0 | 2.5% | A |
| source | Underpromotion | M4 | 300 | 267 | 11 | 0 | 22 | 0 | 7.33% | A |
| learner | Underpromotion | M4 | 160 | 138 | 6 | 0 | 16 | 0 | 10% | A |
| source | Vulnerable King | M1 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Vulnerable King | M1 | 100 | 0 | 0 | 100 | 0 | 0 | 0% | C |
| source | Vulnerable King | M3 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Vulnerable King | M3 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Vulnerable King | M4 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Vulnerable King | M4 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Zugzwang | M1 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Zugzwang | M1 | 100 | 0 | 0 | 100 | 0 | 0 | 0% | C |
| source | Zugzwang | M2 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Zugzwang | M2 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Zugzwang | M3 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Zugzwang | M3 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Zugzwang | M4 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Zugzwang | M4 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Zwischenzug | M1 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Zwischenzug | M1 | 100 | 0 | 0 | 100 | 0 | 0 | 0% | C |
| source | Zwischenzug | M2 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Zwischenzug | M2 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Zwischenzug | M3 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Zwischenzug | M3 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |
| source | Zwischenzug | M4 | 300 | 0 | 0 | 300 | 0 | 0 | 0% | C |
| learner | Zwischenzug | M4 | 160 | 0 | 0 | 160 | 0 | 0 | 0% | C |

## 30 highest-priority collections

| Rank | Dataset | Theme | Stage | False-positive % | Ambiguous |
|---:|---|---|---:|---:|---:|
| 1 | source | King Fork | M4 | 98.33% | 0 |
| 2 | learner | King Fork | M3 | 97.5% | 0 |
| 3 | learner | King Fork | M4 | 97.5% | 0 |
| 4 | source | King Fork | M3 | 97.33% | 0 |
| 5 | learner | Other Skewer | M3 | 91.25% | 0 |
| 6 | source | Other Skewer | M4 | 91% | 0 |
| 7 | source | Other Skewer | M3 | 90.67% | 0 |
| 8 | learner | Other Skewer | M4 | 90% | 0 |
| 9 | source | Promotion | M1 | 84.33% | 0 |
| 10 | learner | Promotion | M1 | 82% | 0 |
| 11 | source | Rook Fork | M3 | 81.67% | 0 |
| 12 | learner | Rook Fork | M3 | 80.63% | 0 |
| 13 | learner | Bishop Fork | M4 | 78.13% | 0 |
| 14 | source | Bishop Fork | M4 | 77.67% | 0 |
| 15 | learner | Bishop Skewer | M4 | 77.5% | 0 |
| 16 | learner | Discovered Check | M4 | 76.25% | 0 |
| 17 | source | Discovered Check | M4 | 75.67% | 0 |
| 18 | source | Rook Fork | M4 | 75.67% | 0 |
| 19 | source | Bishop Skewer | M4 | 74.33% | 0 |
| 20 | learner | Rook Fork | M4 | 73.75% | 0 |
| 21 | source | Bishop Pin | M4 | 73% | 0 |
| 22 | source | Pawn Fork | M4 | 72.33% | 0 |
| 23 | learner | Bishop Pin | M4 | 71.88% | 0 |
| 24 | learner | Discovered Check | M3 | 71.88% | 0 |
| 25 | source | Rook Pin | M4 | 71.33% | 0 |
| 26 | learner | Double Check | M4 | 71.25% | 0 |
| 27 | learner | Queen Pin | M4 | 71.25% | 0 |
| 28 | source | Queen Skewer | M4 | 71% | 0 |
| 29 | source | Underpromotion | M1 | 70.33% | 0 |
| 30 | learner | Rook Pin | M4 | 70% | 0 |

## Failure examples

### MISCLASSIFIED

- **zGi77** — [/tactics/m1/bishop-fork](/tactics/m1/bishop-fork); source 2/6; FEN `r5k1/pp3ppp/3p4/4p3/2B1P1R1/3P1n2/PPP2b1P/2K2R2 b - -`; line `f2e3`; declared **bishop-fork**, detected **ordinary-attack**. moving piece does not attack two surviving meaningful enemy targets after the move; captured destination is excluded
- **zegkH** — [/tactics/m1/bishop-fork](/tactics/m1/bishop-fork); source 2/8; FEN `5nk1/2q3p1/3b3p/ppp5/3pn3/1P1R1B2/PBP3PP/5QK1 b - -`; line `d6h2`; declared **bishop-fork**, detected **ordinary-attack**. moving piece does not attack two surviving meaningful enemy targets after the move; captured destination is excluded
- **w2RsQ** — [/tactics/m1/bishop-fork](/tactics/m1/bishop-fork); source 2/14; FEN `k2r1b2/8/p4Qp1/1p6/2p2B2/3P1qP1/PPP4P/R5K1 b - -`; line `f8c5`; declared **bishop-fork**, detected **ordinary-attack**. moving piece does not attack two surviving meaningful enemy targets after the move; captured destination is excluded
- **zkIk8** — [/tactics/m1/bishop-fork](/tactics/m1/bishop-fork); source 2/23; FEN `r4k1r/p4p2/bp2pNpP/4P1N1/3q1P2/3Pn3/PP1Q2P1/1K2R2R b - -`; line `a6d3`; declared **bishop-fork**, detected **ordinary-attack**. moving piece does not attack two surviving meaningful enemy targets after the move; captured destination is excluded
- **zEmOe** — [/tactics/m1/bishop-fork](/tactics/m1/bishop-fork); source 2/27; FEN `5rk1/1b2q1b1/p2pp1Bp/2p5/2Pn3N/P7/1P1B2PP/1Q5K w - -`; line `g6h7`; declared **bishop-fork**, detected **ordinary-attack**. moving piece does not attack two surviving meaningful enemy targets after the move; captured destination is excluded
- **y6UKv** — [/tactics/m1/bishop-fork](/tactics/m1/bishop-fork); source 2/28; FEN `rn1qkb1r/p3pppp/b4n2/1B6/3P4/2N1P3/P4PPP/R1BQK1NR b KQkq -`; line `a6b5`; declared **bishop-fork**, detected **ordinary-attack**. moving piece does not attack two surviving meaningful enemy targets after the move; captured destination is excluded
- **k9nea** — [/tactics/m1/bishop-fork](/tactics/m1/bishop-fork); source 3/7; FEN `1k1r4/ppq2ppp/2p5/3bP3/6PP/5P2/PPPQ4/1K1R1B1R b - -`; line `d5a2`; declared **bishop-fork**, detected **ordinary-attack**. moving piece does not attack two surviving meaningful enemy targets after the move; captured destination is excluded
- **ylr3K** — [/tactics/m1/bishop-fork](/tactics/m1/bishop-fork); source 3/8; FEN `r3kbnr/ppp2ppp/2n5/1B6/3q4/5QN1/PPP4P/R1B1K2R w KQkq -`; line `b5c6`; declared **bishop-fork**, detected **ordinary-attack**. moving piece does not attack two surviving meaningful enemy targets after the move; captured destination is excluded
- **yqU4Z** — [/tactics/m1/bishop-fork](/tactics/m1/bishop-fork); source 3/9; FEN `7B/2n2b2/8/8/pk2N1P1/1p6/1K5P/8 w - -`; line `h8c3`; declared **bishop-fork**, detected **ordinary-attack**. moving piece does not attack two surviving meaningful enemy targets after the move; captured destination is excluded
- **ytcbY** — [/tactics/m1/bishop-fork](/tactics/m1/bishop-fork); source 3/10; FEN `8/5k2/7R/6B1/5p2/5P1P/2r3bK/8 b - -`; line `g2f3`; declared **bishop-fork**, detected **ordinary-attack**. moving piece does not attack two surviving meaningful enemy targets after the move; captured destination is excluded
- **zifvW** — [/tactics/m1/bishop-fork](/tactics/m1/bishop-fork); source 3/15; FEN `r2q1rk1/pp2ppbp/3p2pB/8/4b3/8/PPPQBPPP/R4RK1 w - -`; line `h6g7`; declared **bishop-fork**, detected **ordinary-attack**. moving piece does not attack two surviving meaningful enemy targets after the move; captured destination is excluded
- **vLNUm** — [/tactics/m1/bishop-fork](/tactics/m1/bishop-fork); source 3/16; FEN `3r4/1p4k1/p4bp1/2Ppp3/2b5/1P1RPNP1/P2K3P/5R2 b - -`; line `c4d3`; declared **bishop-fork**, detected **ordinary-attack**. moving piece does not attack two surviving meaningful enemy targets after the move; captured destination is excluded

### BROKEN / ILLEGAL


### VALID BUT WEAK

- **x7f6n** — [/tactics/m1/attacking-f2-f7](/tactics/m1/attacking-f2-f7); source 1/0; FEN `rnb1kbnr/ppp2pp1/3p3p/4p1qQ/2B1P3/3P4/PPP2PPP/RN2K1NR w KQkq -`; line `h5f7`; declared **attacking-f2-f7**, detected **f2-f7**. tactical move directly attacks or captures the named f-pawn square
- **c4rhO** — [/tactics/m1/attacking-f2-f7](/tactics/m1/attacking-f2-f7); source 1/1; FEN `r1bqk2r/pppp1ppp/5P2/8/6n1/4b1Q1/PPP2PPP/RN2KBNR b KQkq -`; line `e3f2`; declared **attacking-f2-f7**, detected **f2-f7**. tactical move directly attacks or captures the named f-pawn square
- **RO7Nv** — [/tactics/m1/attacking-f2-f7](/tactics/m1/attacking-f2-f7); source 1/2; FEN `r1b1k2r/pp1p1p2/1q2p1p1/1N2N2p/1P2Q1n1/8/P1P2PPP/2R1KB1R b Kkq -`; line `b6f2`; declared **attacking-f2-f7**, detected **f2-f7**. tactical move directly attacks or captures the named f-pawn square
- **wbjTT** — [/tactics/m1/attacking-f2-f7](/tactics/m1/attacking-f2-f7); source 1/3; FEN `rn2k2r/pp3ppp/2p3n1/2b1Pb2/8/2PB1NB1/PP3NPP/R3K2R b KQkq -`; line `c5f2`; declared **attacking-f2-f7**, detected **f2-f7**. tactical move directly attacks or captures the named f-pawn square
- **zPOzu** — [/tactics/m1/attacking-f2-f7](/tactics/m1/attacking-f2-f7); source 1/4; FEN `rnbqk2r/ppp2ppp/4pn2/2bp4/1PP5/P6P/2QPPPP1/RNB1KBNR b KQkq -`; line `c5f2`; declared **attacking-f2-f7**, detected **f2-f7**. tactical move directly attacks or captures the named f-pawn square
- **xfvnp** — [/tactics/m1/attacking-f2-f7](/tactics/m1/attacking-f2-f7); source 1/5; FEN `r3kbnr/pp1n1q1p/2p5/4p1pQ/4P3/2N1B3/PPP2PPP/3RK2R w Kkq -`; line `h5f7`; declared **attacking-f2-f7**, detected **f2-f7**. tactical move directly attacks or captures the named f-pawn square
- **x3v92** — [/tactics/m1/attacking-f2-f7](/tactics/m1/attacking-f2-f7); source 1/7; FEN `rnb1k1nr/pppp1p1p/8/7q/2BPP3/5RP1/PPP5/RN1Q2K1 w kq -`; line `c4f7`; declared **attacking-f2-f7**, detected **f2-f7**. tactical move directly attacks or captures the named f-pawn square
- **yJn5j** — [/tactics/m1/attacking-f2-f7](/tactics/m1/attacking-f2-f7); source 1/8; FEN `2k4r/1b1qbQ2/pp1p3p/2pP4/4P3/2N5/PPP3PP/R3K2R b KQ -`; line `e7h4`; declared **attacking-f2-f7**, detected **f2-f7**. tactical move directly attacks or captures the named f-pawn square
- **z0KUW** — [/tactics/m1/attacking-f2-f7](/tactics/m1/attacking-f2-f7); source 1/9; FEN `r1b1k2r/pp1ppn1p/2n1Pppb/q7/2P2Q1P/2P5/PB3PP1/1R2KBNR w Kkq -`; line `e6f7`; declared **attacking-f2-f7**, detected **f2-f7**. tactical move directly attacks or captures the named f-pawn square
- **iaCGM** — [/tactics/m1/attacking-f2-f7](/tactics/m1/attacking-f2-f7); source 1/10; FEN `r2q2k1/p3rp1p/1p3Bp1/2b5/7P/P2BpP2/2QP1P2/R3K2R b KQ -`; line `e3f2`; declared **attacking-f2-f7**, detected **f2-f7**. tactical move directly attacks or captures the named f-pawn square
- **oXBbt** — [/tactics/m1/attacking-f2-f7](/tactics/m1/attacking-f2-f7); source 1/11; FEN `3b4/pp1k1r1p/3p4/2p1P3/2P5/3P2P1/PP4KP/4R3 w - -`; line `e5e6`; declared **attacking-f2-f7**, detected **f2-f7**. tactical move directly attacks or captures the named f-pawn square
- **tiHuy** — [/tactics/m1/attacking-f2-f7](/tactics/m1/attacking-f2-f7); source 1/12; FEN `r1b1k2r/ppp1nppp/8/6Nq/2Bp2n1/8/PPP1KPP1/RN1QR3 w kq -`; line `c4f7`; declared **attacking-f2-f7**, detected **f2-f7**. tactical move directly attacks or captures the named f-pawn square

### AMBIGUOUS

- **yAA82** — [/tactics/m1/advanced-pawn](/tactics/m1/advanced-pawn); source 1/0; FEN `2N1k3/4P1p1/2N4p/5K1P/8/2n3P1/8/q7 w - -`; line `c8d6`; declared **advanced-pawn**, detected **manual-review**. theme requires chess-aware interpretation beyond legal-line replay
- **z7Ijv** — [/tactics/m1/advanced-pawn](/tactics/m1/advanced-pawn); source 1/1; FEN `8/8/8/5p1K/7P/6k1/8/8 b - -`; line `f5f4`; declared **advanced-pawn**, detected **manual-review**. theme requires chess-aware interpretation beyond legal-line replay
- **kDI8B** — [/tactics/m1/advanced-pawn](/tactics/m1/advanced-pawn); source 1/2; FEN `8/2p3P1/1p6/4p3/2k5/2b2P2/p5K1/8 w - -`; line `g7g8q`; declared **advanced-pawn**, detected **manual-review**. theme requires chess-aware interpretation beyond legal-line replay
- **M5DkT** — [/tactics/m1/advanced-pawn](/tactics/m1/advanced-pawn); source 1/3; FEN `8/8/p7/1p6/1P6/2K5/3p1Q2/2k5 b - -`; line `d2d1n`; declared **advanced-pawn**, detected **manual-review**. theme requires chess-aware interpretation beyond legal-line replay
- **uA3K8** — [/tactics/m1/advanced-pawn](/tactics/m1/advanced-pawn); source 1/4; FEN `4N3/1p3P1k/4N1qb/p1pP4/2P1p3/5P2/PP3K2/8 w - -`; line `f7f8n`; declared **advanced-pawn**, detected **manual-review**. theme requires chess-aware interpretation beyond legal-line replay
- **PY9DB** — [/tactics/m1/advanced-pawn](/tactics/m1/advanced-pawn); source 1/5; FEN `8/1k5K/6p1/PB1p1b2/3P4/8/8/8 b - -`; line `g6g5`; declared **advanced-pawn**, detected **manual-review**. theme requires chess-aware interpretation beyond legal-line replay
- **xtMuu** — [/tactics/m1/advanced-pawn](/tactics/m1/advanced-pawn); source 1/6; FEN `8/8/1K6/P2p4/3P1p2/8/4k3/8 w - -`; line `a5a6`; declared **advanced-pawn**, detected **manual-review**. theme requires chess-aware interpretation beyond legal-line replay
- **wgbKj** — [/tactics/m1/advanced-pawn](/tactics/m1/advanced-pawn); source 1/7; FEN `8/7p/2p5/8/1P2k1p1/2K3P1/7P/8 w - -`; line `c3c4`; declared **advanced-pawn**, detected **manual-review**. theme requires chess-aware interpretation beyond legal-line replay
- **yCR12** — [/tactics/m1/advanced-pawn](/tactics/m1/advanced-pawn); source 1/8; FEN `8/8/3P2k1/5p2/1Pp5/2K4p/4r2B/8 w - -`; line `d6d7`; declared **advanced-pawn**, detected **manual-review**. theme requires chess-aware interpretation beyond legal-line replay
- **zwasE** — [/tactics/m1/advanced-pawn](/tactics/m1/advanced-pawn); source 1/9; FEN `8/8/4p3/p2P1p2/P1K4k/2P5/8/8 b - -`; line `e6d5`; declared **advanced-pawn**, detected **manual-review**. theme requires chess-aware interpretation beyond legal-line replay
- **oeiTL** — [/tactics/m1/advanced-pawn](/tactics/m1/advanced-pawn); source 1/10; FEN `7R/p7/8/3K4/PkP5/1q6/8/8 w - -`; line `h8b8`; declared **advanced-pawn**, detected **manual-review**. theme requires chess-aware interpretation beyond legal-line replay
- **zyiyW** — [/tactics/m1/advanced-pawn](/tactics/m1/advanced-pawn); source 1/11; FEN `6r1/3k2P1/3P1P2/1p4p1/7p/8/5K2/8 w - -`; line `f6f7`; declared **advanced-pawn**, detected **manual-review**. theme requires chess-aware interpretation beyond legal-line replay

## Cross-theme confusion matrix

| Dataset | Declared | Detected | Count |
|---|---|---|---:|
| source | advanced-pawn | manual-review | 1200 |
| source | clearance | manual-review | 1200 |
| source | decoy-attraction | manual-review | 1200 |
| source | decoy-deflection | manual-review | 1200 |
| source | defense | manual-review | 1200 |
| source | deflection | manual-review | 1200 |
| source | interference | manual-review | 1200 |
| source | kingside-attack | manual-review | 1200 |
| source | pawn-sacrifice | unknown | 1200 |
| source | queenside-attack | manual-review | 1200 |
| source | quiet-move | manual-review | 1200 |
| source | remove-the-defender | manual-review | 1200 |
| source | rook-sacrifice | manual-review | 1200 |
| source | trapped-piece | manual-review | 1200 |
| source | zugzwang | manual-review | 1200 |
| source | zwischenzug | manual-review | 1200 |
| source | other-xray | xray | 1112 |
| source | queen-xray | xray | 1106 |
| source | knight-underpromotion | underpromotion | 1079 |
| source | attacking-f2-f7 | f2-f7 | 1025 |
| source | en-passant | en-passant | 1024 |
| source | king-sacrifice | candidate-sacrifice | 986 |
| source | promotion | promotion | 947 |
| source | rook-xray | xray | 921 |
| source | underpromotion | underpromotion | 907 |
| source | vulnerable-king | manual-review | 900 |
| source | hanging-piece | contested-piece | 830 |
| source | bishop-sacrifice | unknown | 823 |
| source | interference-sacrifice | manual-review | 817 |
| source | queen-fork | fork | 810 |
| source | other-pin | absolute-pin | 786 |
| source | knight-fork | fork | 783 |
| source | queen-pin | ordinary-attack | 748 |
| source | queen-sacrifice | unknown | 745 |
| source | other-skewer | ordinary-attack | 743 |
| source | clearance-sacrifice | unknown | 737 |
| source | rook-pin | ordinary-attack | 734 |
| source | discovered-check | ordinary-check | 712 |
| source | rook-skewer | skewer | 709 |
| source | king-fork | ordinary-attack | 707 |
| source | queen-skewer | skewer | 682 |
| source | knight-sacrifice | candidate-sacrifice | 673 |
| source | rook-fork | ordinary-attack | 670 |
| source | bishop-skewer | skewer | 661 |
| source | pawn-fork | fork | 647 |
| source | discovered-attack | discovered-attack | 624 |
| source | bishop-fork | fork | 618 |
| source | bishop-pin | ordinary-attack | 605 |
| source | bishop-xray | xray | 583 |
| source | bishop-fork | ordinary-attack | 582 |
| learner | advanced-pawn | manual-review | 580 |
| learner | clearance | manual-review | 580 |
| learner | decoy-attraction | manual-review | 580 |
| learner | decoy-deflection | manual-review | 580 |
| learner | defense | manual-review | 580 |
| learner | deflection | manual-review | 580 |
| learner | interference | manual-review | 580 |
| learner | kingside-attack | manual-review | 580 |
| learner | pawn-sacrifice | unknown | 580 |
| learner | queenside-attack | manual-review | 580 |
| learner | quiet-move | manual-review | 580 |
| learner | remove-the-defender | manual-review | 580 |
| learner | rook-sacrifice | manual-review | 580 |
| learner | trapped-piece | manual-review | 580 |
| learner | zugzwang | manual-review | 580 |
| learner | zwischenzug | manual-review | 580 |
| source | discovered-attack | ordinary-move | 576 |
| learner | knight-underpromotion | underpromotion | 557 |
| learner | other-xray | xray | 542 |
| source | bishop-skewer | ordinary-attack | 539 |
| learner | queen-xray | xray | 530 |
| source | rook-fork | fork | 530 |
| learner | en-passant | en-passant | 527 |
| source | knight-sacrifice | unknown | 527 |
| source | queen-skewer | ordinary-attack | 518 |
| source | double-check | double-check | 510 |
| source | pawn-fork | ordinary-attack | 506 |
| learner | promotion | promotion | 498 |
| learner | attacking-f2-f7 | f2-f7 | 491 |
| source | rook-skewer | ordinary-attack | 491 |
| source | discovered-check | discovered-check | 488 |
| learner | underpromotion | underpromotion | 488 |
| source | bishop-pin | absolute-pin | 481 |
| learner | king-sacrifice | candidate-sacrifice | 480 |
| source | clearance-sacrifice | candidate-sacrifice | 463 |
| learner | interference-sacrifice | manual-review | 460 |
| source | other-skewer | skewer | 457 |
| source | queen-sacrifice | candidate-sacrifice | 455 |
| learner | rook-xray | xray | 450 |
| learner | vulnerable-king | manual-review | 420 |
| source | knight-fork | ordinary-attack | 417 |
| learner | queen-fork | fork | 407 |
| source | double-check | single-check | 405 |
| learner | bishop-sacrifice | unknown | 395 |
| learner | hanging-piece | contested-piece | 390 |
| source | queen-fork | ordinary-attack | 390 |
| source | bishop-xray | unknown | 386 |
| source | rook-pin | absolute-pin | 382 |
| source | bishop-sacrifice | candidate-sacrifice | 377 |
| learner | queen-pin | ordinary-attack | 376 |
| learner | other-pin | absolute-pin | 372 |
| source | hanging-piece | hanging-piece | 369 |
| learner | knight-fork | fork | 369 |
| learner | queen-sacrifice | unknown | 366 |
| learner | king-fork | ordinary-attack | 363 |
| learner | clearance-sacrifice | unknown | 358 |
| learner | other-skewer | ordinary-attack | 357 |
| learner | discovered-check | ordinary-check | 355 |
| learner | bishop-xray | xray | 349 |
| learner | rook-pin | ordinary-attack | 344 |
| learner | knight-sacrifice | candidate-sacrifice | 341 |
| learner | rook-skewer | skewer | 340 |
| learner | queen-skewer | skewer | 332 |
| learner | pawn-fork | fork | 325 |
| learner | bishop-skewer | skewer | 319 |
| learner | rook-fork | ordinary-attack | 314 |
| learner | discovered-attack | discovered-attack | 312 |
| source | other-pin | ordinary-attack | 307 |
| learner | bishop-fork | fork | 299 |
| learner | bishop-pin | ordinary-attack | 297 |
| source | double-check | non-check | 285 |
| learner | bishop-fork | ordinary-attack | 281 |
| source | rook-xray | unknown | 279 |
| learner | discovered-attack | ordinary-move | 268 |
| learner | rook-fork | fork | 266 |
| learner | bishop-skewer | ordinary-attack | 261 |
| source | promotion | non-promotion | 253 |
| source | queen-pin | relative-pin | 253 |
| learner | double-check | double-check | 249 |
| learner | queen-skewer | ordinary-attack | 248 |
| learner | rook-skewer | ordinary-attack | 240 |
| learner | knight-sacrifice | unknown | 239 |
| learner | pawn-fork | ordinary-attack | 236 |
| learner | bishop-pin | absolute-pin | 232 |
| learner | bishop-xray | unknown | 231 |
| learner | discovered-check | discovered-check | 225 |
| learner | other-skewer | skewer | 223 |
| learner | clearance-sacrifice | candidate-sacrifice | 222 |
| source | king-sacrifice | unknown | 214 |
| learner | queen-sacrifice | candidate-sacrifice | 214 |
| learner | knight-fork | ordinary-attack | 211 |
| source | underpromotion | non-promotion | 211 |
| learner | double-check | single-check | 204 |
| source | queen-pin | absolute-pin | 199 |
| learner | rook-pin | absolute-pin | 195 |
| learner | hanging-piece | hanging-piece | 190 |
| learner | bishop-sacrifice | candidate-sacrifice | 185 |
| source | en-passant | other | 176 |
| source | attacking-f2-f7 | attack | 175 |
| learner | queen-fork | ordinary-attack | 173 |
| learner | other-pin | ordinary-attack | 153 |
| learner | rook-xray | unknown | 130 |
| learner | double-check | non-check | 127 |
| learner | queen-pin | relative-pin | 116 |
| source | bishop-pin | relative-pin | 114 |
| source | other-pin | relative-pin | 107 |
| source | king-fork | fork | 101 |
| learner | king-sacrifice | unknown | 100 |
| source | queen-xray | unknown | 94 |
| learner | attacking-f2-f7 | attack | 89 |
| learner | queen-pin | absolute-pin | 88 |
| source | rook-pin | relative-pin | 84 |
| learner | promotion | non-promotion | 82 |
| source | other-xray | unknown | 77 |
| learner | underpromotion | non-promotion | 70 |
| learner | king-fork | fork | 57 |
| learner | other-pin | relative-pin | 55 |
| learner | en-passant | other | 53 |
| learner | bishop-pin | relative-pin | 51 |
| learner | queen-xray | unknown | 50 |
| source | pawn-fork | other | 47 |
| learner | rook-pin | relative-pin | 41 |
| learner | other-xray | unknown | 38 |
| source | knight-underpromotion | queen-promotion | 31 |
| source | underpromotion | queen-promotion | 30 |
| learner | underpromotion | queen-promotion | 22 |
| learner | knight-underpromotion | queen-promotion | 21 |
| learner | pawn-fork | other | 19 |
| source | knight-underpromotion | other-underpromotion | 3 |
| learner | knight-underpromotion | other-underpromotion | 2 |
| source | hanging-piece | unknown | 1 |

## Repair guidance

1. Repair all BROKEN / ILLEGAL source records first.
2. Manually review Tier A MISCLASSIFIED records next; these have strong structural counter-evidence.
3. Review VALID BUT WEAK and Tier B rows with line/material context before retaining them.
4. Treat Tier C AMBIGUOUS records as a curation queue, never as automatic deletions.
5. Rebuild learner overlays only from reviewed semantic decisions, preserving canonical identities and progress mappings.

Machine-readable per-record details: [audit-reports/pattern-tactic-semantic-audit.json](../../audit-reports/pattern-tactic-semantic-audit.json).
