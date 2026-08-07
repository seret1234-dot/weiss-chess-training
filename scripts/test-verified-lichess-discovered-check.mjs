import assert from 'node:assert/strict'
import { Chess } from 'chess.js'
import { findDiscoveredCheck } from './lib/verified-lichess-discovered-check.mjs'

const move = (fen, uci) => {
  const before = new Chess(fen), after = new Chess(fen)
  const played = after.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || undefined })
  assert.ok(played, `fixture move ${uci} must be legal`)
  return { before, after, played }
}

// Bishop moves away from e2 and reveals the rook on e1 against e8.
{ const { before, after, played } = move('4k3/8/8/8/8/8/4B3/4R1K1 w - - 0 1', 'e2c4')
  const found = findDiscoveredCheck(before, after, played, 'w')
  assert.equal(found?.subtype, 'discovered-check')
  assert.equal(found?.revealedAttacker, 'e1')
}

// The moved bishop also checks: it is a double check, not a Discovered Check course record.
{ const { before, after, played } = move('4k3/8/8/8/8/8/4B3/4R1K1 w - - 0 1', 'e2h5')
  assert.equal(findDiscoveredCheck(before, after, played, 'w')?.subtype, 'double-check')
}

// A direct rook check cannot be misidentified as discovered.
{ const { before, after, played } = move('4k3/8/8/8/8/8/8/4R1K1 w - - 0 1', 'e1e7')
  assert.equal(findDiscoveredCheck(before, after, played, 'w'), null)
}

console.log('verified Lichess Discovered Check fixtures passed')
