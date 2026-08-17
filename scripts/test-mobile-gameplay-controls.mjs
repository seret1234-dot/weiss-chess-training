import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFileSync(path.join(repo, relativePath), 'utf8')

const dockCss = read('src/context/HintActionContext.css')
assert.match(
  dockCss,
  /padding-bottom:\s*calc\(24px \+ env\(safe-area-inset-bottom\)\) !important/,
  'shared mobile gameplay scroll roots must reserve an end gutter above the dock',
)

const themedBoard = read('src/theme/ThemedChessboard.tsx')
assert.match(themedBoard, /autoPromoteToQueen=\{false\}/)
assert.match(themedBoard, /onPromotionPieceSelect=/)
assert.match(themedBoard, /animationDuration=\{boardProps\.animationDuration \?\? 220\}/)

const trainerShell = read('src/components/trainer/TrainerShell.tsx')
assert.match(trainerShell, /<PromotionChooser/)
assert.match(trainerShell, /onPieceDrop\?\.\(pending\.sourceSquare, pending\.targetSquare, promotion\)/)

const playComputer = read('src/pages/PlayComputerPage.tsx')
assert.match(playComputer, /<PromotionChooser/)
assert.match(playComputer, /setTimeout\(makeEngineMove, 240\)/)
assert.match(playComputer, /animationDuration=\{220\}/)
assert.doesNotMatch(playComputer, /if \(!piece\) return 'q'/)

for (const trainerPath of [
  'src/trainers/patternTactic/PatternTacticTrainer.tsx',
  'src/trainers/patternMate/PatternMateTrainer.tsx',
  'src/FreeLinePlayPage.tsx',
]) {
  const trainer = read(trainerPath)
  assert.match(trainer, /<PromotionChooser/)
  assert.doesNotMatch(trainer, /window\.prompt\(\s*'Promote to q, r, b, or n:'/)
}

const srcRoot = path.join(repo, 'src')
const stack = [srcRoot]
const hardQueenMoves = []

while (stack.length > 0) {
  const current = stack.pop()
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const target = path.join(current, entry.name)
    if (entry.isDirectory()) {
      stack.push(target)
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      const source = fs.readFileSync(target, 'utf8')
      if (/promotion:\s*['\"]q['\"]/.test(source)) hardQueenMoves.push(path.relative(repo, target))
    }
  }
}

assert.deepEqual(hardQueenMoves, [], 'human move handlers must not hard-code queen promotion')
console.log('Mobile gameplay controls test passed.')
