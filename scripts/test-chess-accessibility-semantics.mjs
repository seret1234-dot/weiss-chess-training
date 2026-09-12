import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  buildBoardAccessibilityDescription,
  describeBoardSquare,
  isDecorativeTransitionBoard,
} from '../src/components/chess/boardAccessibility.mjs'

const root = process.cwd()
const read = (path) => readFile(join(root, path), 'utf8')

const start = buildBoardAccessibilityDescription({
  id: 'pattern-tactics-board',
  position: 'start',
  orientation: 'white',
  showCoordinates: true,
})
assert.equal(start.label, 'Pattern Tactics Board chessboard')
assert.match(start.description, /Board orientation: White at bottom\./)
assert.match(start.description, /White to move\./)
assert.match(start.description, /White: king e1;/)
assert.match(start.description, /Black: king e8;/)
assert.match(start.description, /Visual coordinates are shown; square names remain available/)
assert.ok(start.description.length < 700, 'board description stays concise')

const black = buildBoardAccessibilityDescription({
  id: 'master-puzzle',
  position: '8/8/8/8/8/8/4k3/4K3 b - - 0 1',
  orientation: 'black',
  showCoordinates: false,
})
assert.match(black.description, /Board orientation: Black at bottom\./)
assert.match(black.description, /Black to move\./)
assert.match(black.description, /White: king e1\./)
assert.match(black.description, /Black: king e2\./)
assert.match(black.description, /Visual coordinates are hidden; square names remain available/)

const selected = buildBoardAccessibilityDescription({
  id: 'safe-puzzle-board',
  title: 'Puzzle practice',
  position: '8/8/8/8/4P3/8/8/4K2k w - - 0 1',
  orientation: 'white',
  showCoordinates: false,
  selectedSquare: 'e4',
  currentMove: 'Ply 0 of 2',
  interactionDescription: 'Use Keyboard move controls below the board.',
  expectedMove: 'e4e5',
  solution: ['e4e5'],
})
assert.equal(selected.label, 'Puzzle practice chessboard')
assert.match(selected.description, /Selected square: e4, White pawn, selected\./)
assert.match(selected.description, /Current move: Ply 0 of 2\./)
assert.match(selected.description, /Use Keyboard move controls below the board\./)
assert.doesNotMatch(selected.description, /e4e5|expected move|solution/i, 'unknown solution fields are never exposed')
assert.equal(describeBoardSquare('g1', 'start'), 'g1, White knight')
assert.equal(describeBoardSquare('e4', { e4: 'wP' }, { selected: true }), 'e4, White pawn, selected')

const setup = buildBoardAccessibilityDescription({
  id: 'setup-board',
  position: { e1: 'wK', e8: 'bK', d1: 'wQ' },
  orientation: 'white',
  showCoordinates: true,
})
assert.match(setup.description, /White: king e1; queen d1\./)
assert.match(setup.description, /Black: king e8\./)
assert.doesNotMatch(setup.description, /to move/, 'object-only setup boards do not invent side to move')
assert.equal(isDecorativeTransitionBoard('mate-transition-cover-board'), true)
assert.equal(isDecorativeTransitionBoard('mate-board'), false)

const [themedBoard, masterGames, analyze, opening, freePlay, playComputer, setupPosition, imagePositionPanel, patternTactic, patternMate, promotion, floating, pricing, appRouter, directDuplicate] = await Promise.all([
  read('src/theme/ThemedChessboard.tsx'),
  read('src/MasterGamesPage.tsx'),
  read('src/pages/analyze/AnalyzeBoardPage.tsx'),
  read('src/OpeningTrainerPage.tsx'),
  read('src/FreeLinePlayPage.tsx'),
  read('src/pages/PlayComputerPage.tsx'),
  read('src/pages/analyze/SetupPositionPage.tsx'),
  read('src/pages/analyze/ImageToPositionPanel.tsx'),
  read('src/trainers/patternTactic/PatternTacticTrainer.tsx'),
  read('src/trainers/patternMate/PatternMateTrainer.tsx'),
  read('src/components/chess/PromotionChooser.tsx'),
  read('src/components/GlobalFloatingPlay.tsx'),
  read('src/PricingPage.tsx'),
  read('src/AppRouter.tsx'),
  read('src/duplicate/AnastasiaMatePage.tsx'),
])

assert.match(themedBoard, /role=\{decorative \? undefined : "group"\}/)
assert.match(themedBoard, /aria-describedby=\{decorative \? undefined : descriptionId\}/)
assert.match(themedBoard, /aria-hidden=\{decorative \|\| undefined\}/)
assert.match(themedBoard, /orientationAnnouncement/)
assert.match(themedBoard, /role="status" aria-live="polite"/, 'only deliberate orientation changes use a live region')
assert.match(themedBoard, /accessibilitySelectedSquare/)
assert.match(themedBoard, /accessibilityCurrentMove/)
assert.match(themedBoard, /accessibilityInteraction/)
assert.match(masterGames, /role="list"[\s\S]{0,120}Full master game move list/)
assert.match(masterGames, /White: \$\{row\.white\}/)
assert.match(masterGames, /Black: \$\{row\.black\}/)
assert.match(analyze, /role="list"[\s\S]{0,100}Analyzed game moves/)
assert.match(analyze, /aria-current=\{currentPly === white\?\.ply \? "step"/)
assert.match(opening, /role="list"[\s\S]{0,120}Full opening line/)
assert.match(patternTactic, /<AccessibleMoveInput[\s\S]*?onSquareClick=\{onSquareClick\}[\s\S]*?\/>/)
assert.match(patternMate, /<AccessibleMoveInput[\s\S]*?onSquareClick=\{onSquareClick\}[\s\S]*?\/>/)
assert.match(patternTactic, /accessibilitySelectedSquare=\{selectedSquare\}/)
assert.match(patternMate, /accessibilitySelectedSquare=\{selectedSquare\}/)
for (const [name, source] of [['Pattern Tactics', patternTactic], ['Pattern Mates', patternMate]]) {
  const boardCall = source.match(/<ThemedChessboard[\s\S]*?\/>/)?.[0] || ''
  assert.ok(boardCall, `${name} renders the shared board`)
  assert.doesNotMatch(boardCall, /expected|solution|hintMoveUci|correctSquare/i, `${name} board ARIA props do not expose solution evidence`)
}
assert.match(masterGames, /accessibilityTitle="Master Games training"/)
assert.match(freePlay, /accessibilityTitle=\{line\.kind === 'opening'/)
assert.match(playComputer, /accessibilityTitle="Play Computer"/)
assert.match(analyze, /accessibilityTitle=\{isSetupPositionOpen/)
assert.match(setupPosition, /role="grid"/)
assert.match(setupPosition, /tabIndex=\{0\}/)
assert.match(setupPosition, /aria-activedescendant=/)
assert.match(setupPosition, /role="gridcell"/)
assert.match(setupPosition, /onKeyDown=\{handleSetupBoardKeyDown\}/)
assert.doesNotMatch(setupPosition, /tabIndex=\{0\}[\s\S]{0,250}role="gridcell"/, 'individual setup squares are not added to Tab order')
assert.match(imagePositionPanel, /role="dialog"/)
assert.match(imagePositionPanel, /aria-modal="true"/)
assert.match(imagePositionPanel, /role="grid"/)
assert.match(imagePositionPanel, /role="gridcell"/)
assert.match(imagePositionPanel, /tabIndex=\{activeSquare === square \? 0 : -1\}/)
assert.match(imagePositionPanel, /handleSquareKeyDown/)
assert.doesNotMatch(appRouter, /duplicate\/AnastasiaMatePage/, 'inactive direct react-chessboard duplicate is not routed')
assert.match(directDuplicate, /react-chessboard/, 'the only direct legacy board remains isolated in duplicate/')
assert.match(promotion, /aria-modal="true"/)
assert.match(promotion, /aria-labelledby=\{titleId\}/)
assert.match(promotion, /event\.key === 'Escape'/)
assert.match(promotion, /firstChoiceRef\.current\?\.focus/)
assert.match(promotion, /returnFocusTo\?\.focus/)
assert.match(floating, /aria-expanded=\{desktopMenuExpanded\}/)
assert.match(floating, /aria-pressed=\{showCoordinates\}/)
assert.match(floating, /aria-label=\{`Coordinates \$\{showCoordinates \? "on" : "off"\}/)
assert.match(pricing, /role="status"/)
assert.match(pricing, /role="alert"/)

console.log('Chess accessibility semantics checks passed without changing chess behavior.')
