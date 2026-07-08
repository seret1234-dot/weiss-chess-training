# Weiss Chess Trainer — New Puzzle Page / Refactor Notes

Use this file before starting a new puzzle trainer so we do not spend an hour rediscovering the structure.

## Current refactored idea

New puzzle pages should be small config entries, not large copied trainer files.

The shared structure should be:

- shared trainer UI/logic: `PatternMateTrainer`
- small page wrapper/config: `createPatternMatePage(...)`
- route configs generated from page configs
- catalog entry added to `trainerCatalog.ts` / `trainingCatalog.ts` if the trainer should appear in menus or Auto mode
- puzzle data stored under `public/data/pattern-mates/...`
- each trainer uses:
  - `title`
  - `manifestPath`
  - `progressKey`
  - `allowChunkNavigation`

## Goal for adding a new puzzle page

Adding a new page should mostly mean:

1. Generate puzzle data.
2. Add one config entry.
3. Add one catalog/training entry if needed.
4. Test.
5. Commit only the relevant files.

Do not copy/paste a whole trainer unless it is temporary.

## Data format needed

For each theme and mate distance we need:

```txt
public/data/pattern-mates/<theme>/<mate-distance>/manifest.json
public/data/pattern-mates/<theme>/<mate-distance>/chunk-001.json
public/data/pattern-mates/<theme>/<mate-distance>/chunk-002.json
...
```

Example:

```txt
public/data/pattern-mates/anastasia/mate-in-1/manifest.json
public/data/pattern-mates/anastasia/mate-in-1/chunk-001.json

public/data/pattern-mates/anastasia/mate-in-2/manifest.json
public/data/pattern-mates/anastasia/mate-in-2/chunk-001.json
```

Each chunk should normally contain about 30 puzzles, sorted from easy to hard.

## What to send/upload before making the next page

Send one real existing example manifest and one real existing chunk file.

Most useful examples:

```txt
public/data/pattern-mates/anastasia/mate-in-1/manifest.json
public/data/pattern-mates/anastasia/mate-in-1/chunk-001.json

public/data/pattern-mates/anastasia/mate-in-2/manifest.json
public/data/pattern-mates/anastasia/mate-in-2/chunk-001.json
```

Also send the generator script if it exists, probably named something like:

```txt
scripts/generate_anastasia...
scripts/generate_pattern_mates...
```

Also tell the exact path of the Lichess puzzle CSV, for example:

```txt
C:\Users\Ariel\chess-trainer\data\lichess_db_puzzle.csv
```

## Commands to find the existing files

Run from the repo root:

```powershell
cd C:\Users\Ariel\chess-trainer
```

Find generator/data references:

```powershell
Get-ChildItem -Recurse -Include "*.py","*.ts","*.js","*.cjs" |
  Select-String -Pattern "anastasia|lichess|mateIn|pattern-mates|chunk-001|manifest" |
  Select-Object Path, LineNumber, Line
```

List Anastasia data files:

```powershell
Get-ChildItem public\data\pattern-mates\anastasia -Recurse |
  Select-Object FullName, Length
```

Find route/page config files:

```powershell
Get-ChildItem src -Recurse -Include "*.ts","*.tsx" |
  Select-String -Pattern "createPatternMatePage|patternMateRoutes|pageConfigs|PatternMateTrainer|manifestPath|progressKey" |
  Select-Object Path, LineNumber, Line
```

Find trainer catalog entries:

```powershell
Get-ChildItem src -Recurse -Include "*Catalog*.ts","*catalog*.ts","*.ts" |
  Select-String -Pattern "trainerCatalog|trainingCatalog|Auto|anastasia|pattern mate|PatternMate" |
  Select-Object Path, LineNumber, Line
```

## Standard procedure for a new puzzle page

### 1. Choose theme and distance

Examples:

```txt
anastasia mate-in-3
backRank mate-in-2
smothered mate-in-3
boden mate-in-2
arabian mate-in-1
dovetail mate-in-2
epaulette mate-in-2
```

### 2. Count puzzles first

Use Lichess CSV and filter by:

- theme tag
- mate distance, for example `mateIn1`, `mateIn2`, `mateIn3`
- rating range if needed

Do not create files before confirming there are enough puzzles.

### 3. Sort and split

Sort by rating from easiest to hardest.

Split into chunks of about 30 puzzles:

```txt
chunk-001.json = easiest 30
chunk-002.json = next 30
chunk-003.json = next 30
```

### 4. Generate data files

Create:

```txt
manifest.json
chunk-001.json
chunk-002.json
...
```

Each puzzle should include at least:

- id
- fen
- moves/solution
- rating
- themes
- source info if available

Use the exact existing format from a previous chunk.

### 5. Add config/page entry

Add a small config entry using the shared trainer system.

Expected shape is something like:

```ts
createPatternMatePage({
  title: 'Anastasia Mate in 3',
  manifestPath: '/data/pattern-mates/anastasia/mate-in-3/manifest.json',
  progressKey: 'pattern-mate-anastasia-mate-in-3',
  allowChunkNavigation: true,
})
```

Use the exact existing structure from mate-in-1 or mate-in-2.

### 6. Add catalog entry if needed

Add to `trainerCatalog.ts` / `trainingCatalog.ts` if it should appear in:

- training menu
- Auto mode
- progression
- dashboard/cards

Use existing Anastasia entries as the model.

### 7. Test

Run:

```powershell
npm run build
```

Manual test:

- page opens
- board shows the right FEN
- first puzzle works
- correct move feedback works
- wrong move feedback works
- next puzzle works
- chunk progression works
- restart progression works
- Auto mode can find it if catalog entry was added
- no unrelated pages broke

### 8. Commit only relevant files

Check status:

```powershell
git status
```

Stage only relevant files, for example:

```powershell
git add public/data/pattern-mates/anastasia/mate-in-3
git add src/.../pageConfigs.ts
git add src/.../patternMateRoutes.ts
git add src/trainerCatalog.ts
git commit -m "Add Anastasia mate in 3 trainer"
```

Do not add random backup files or old scripts.

## Important warnings

- Do not use `git add .`.
- Do not commit `.bak`, `.backup`, temporary scripts, or broken copies.
- Do not refactor and add many pages in the same commit unless necessary.
- Do one theme/mate-distance at a time.
- Keep puzzle pools small and chunked.
- If a patch touches many unrelated files, stop and inspect before committing.

## Short prompt to continue later

Paste this when starting the next new page:

```txt
Use docs/new-puzzle-page-procedure.md. Create the next puzzle page using the shared PatternMateTrainer/refactored structure. First inspect existing manifest/chunk examples and route/catalog configs. Then generate chunked puzzle data from the Lichess CSV, add only the small config/catalog entries needed, test with npm run build, and commit only the relevant files.
```

## What I need from Ariel next

To make the next page quickly, provide:

1. Which page/theme:
   - example: `Anastasia mate in 3`

2. Exact Lichess CSV path:
   - example: `C:\Users\Ariel\chess-trainer\data\lichess_db_puzzle.csv`

3. Existing example files:
   - `public/data/pattern-mates/anastasia/mate-in-1/manifest.json`
   - `public/data/pattern-mates/anastasia/mate-in-1/chunk-001.json`

4. Existing generator script if available:
   - example: `scripts/generate_pattern_mates.cjs`

5. Current route/config files if the names are not known:
   - file containing `createPatternMatePage`
   - file containing `patternMateRoutes`
   - trainer catalog file
