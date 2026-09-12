import assert from 'node:assert/strict'
import {
  createHierarchyNavigationState,
  getHierarchyBackAction,
} from '../src/navigation/hierarchicalBack.mjs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

class RouterHistory {
  constructor(pathname) {
    this.entries = [{ pathname, state: null }]
    this.index = 0
    this.actions = []
  }

  get current() {
    return this.entries[this.index]
  }

  forward(pathname) {
    this.entries.splice(this.index + 1)
    this.entries.push({
      pathname,
      state: createHierarchyNavigationState(this.current.pathname),
    })
    this.index += 1
    this.actions.push({ type: 'PUSH', pathname })
  }

  backToParent(expectedParentPath) {
    const action = getHierarchyBackAction({
      expectedParentPath,
      locationState: this.current.state,
    })

    if (action.type === 'POP') {
      assert.ok(this.index > 0, 'A normal in-app child must have a previous entry to pop')
      this.index -= 1
      this.actions.push({ type: 'POP', pathname: this.current.pathname })
    } else {
      this.entries[this.index] = { pathname: action.target, state: null }
      this.actions.push({ type: 'REPLACE', pathname: action.target })
    }
    return action.type
  }
}

function legacyCycle() {
  const history = new RouterHistory('/')
  history.forward('/mates')
  history.forward('/mates/m1')
  history.forward('/mates/m1/kill-box')
  // The retired page-level Back used window.location.assign(parent), which PUSHed.
  history.forward('/mates/m1')
  history.index -= 1 // Browser/global Back exposes the family page again.
  history.actions.push({ type: 'POP', pathname: history.current.pathname })
  history.forward('/mates/m1')
  history.index -= 1
  history.actions.push({ type: 'POP', pathname: history.current.pathname })
  return history.actions.map(({ type, pathname }) => `${type}:${pathname}`)
}

const reproducedLegacyLoop = legacyCycle()
assert.deepEqual(reproducedLegacyLoop, [
  'PUSH:/mates',
  'PUSH:/mates/m1',
  'PUSH:/mates/m1/kill-box',
  'PUSH:/mates/m1',
  'POP:/mates/m1/kill-box',
  'PUSH:/mates/m1',
  'POP:/mates/m1/kill-box',
])

const subpatterns = ['adjacent-rook', 'rook-rail', 'queen-fence']
for (const distance of [1, 2, 3, 4, 5]) {
  const level = `/mates/m${distance}`
  for (const subpattern of subpatterns) {
    const history = new RouterHistory('/')
    history.forward('/mates')
    history.forward(level)
    history.forward(`${level}/kill-box`)
    history.forward(`${level}/kill-box-${subpattern}`)

    assert.equal(history.backToParent(`${level}/kill-box`), 'POP')
    assert.equal(history.current.pathname, `${level}/kill-box`)
    assert.equal(history.backToParent(level), 'POP')
    assert.equal(history.current.pathname, level)
    assert.equal(history.backToParent('/mates'), 'POP')
    assert.equal(history.current.pathname, '/mates')
    assert.equal(history.backToParent('/'), 'POP')
    assert.equal(history.current.pathname, '/')
    assert.equal(history.entries.some((entry) => entry.pathname.startsWith('/mates')), true)
    assert.equal(history.index, 0, 'The normal Back sequence must end at Home without a cyclic re-entry')
  }

  const directFamily = new RouterHistory(`${level}/kill-box`)
  assert.equal(directFamily.backToParent(level), 'REPLACE')
  assert.equal(directFamily.current.pathname, level)
  assert.equal(directFamily.entries.length, 1, 'Deep-link fallback must replace rather than push')

  for (const subpattern of subpatterns) {
    const directTrainer = new RouterHistory(`${level}/kill-box-${subpattern}`)
    assert.equal(directTrainer.backToParent(`${level}/kill-box`), 'REPLACE')
    assert.equal(directTrainer.current.pathname, `${level}/kill-box`)
    assert.equal(directTrainer.entries.length, 1, 'Direct subtype fallback must replace rather than push')
  }
}

const landingPage = await readFile(resolve(process.cwd(), 'src/LandingPage.tsx'), 'utf8')
assert.match(landingPage, /createHierarchyNavigationState\('\/'\)/, 'The Home Mates card must mark Home as its hierarchy parent')
assert.match(landingPage, /item\.path === '\/mates'/, 'Only the Mates route needs the explicit Home hierarchy marker')

console.log(JSON.stringify({
  legacyLoop: reproducedLegacyLoop,
  normalBack: ['trainer', 'family', 'mate-distance', 'mates', 'home'],
  directEntry: 'REPLACE',
  levelsVerified: 5,
  subpatternsVerified: subpatterns.length,
}))
