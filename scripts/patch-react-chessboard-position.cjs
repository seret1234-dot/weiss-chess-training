// react-chessboard 4.7.3 defers even zero-duration position changes to a timer.
// Keep its mounted board and commit explicit nonanimated replacements before paint.
// Normal move animation remains on the upstream effect/timer path.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(process.cwd(), 'node_modules/react-chessboard');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (version !== '4.7.3') throw new Error(`Review atomic position patch for react-chessboard ${version}`);
for (const name of ['index.js', 'index.esm.js']) {
  const file = path.join(root, 'dist', name);
  const source = fs.readFileSync(file, 'utf8');
  const marker = '// Weiss atomic zero-duration position replacement';
  if (source.includes(marker)) continue;
  const prefix = name === 'index.js' ? 'react.' : '';
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const needle = `// handle external position change${eol}    ${prefix}useEffect(() => {`;
  if (source.split(needle).length !== 2) throw new Error(`Unrecognized position effect in ${name}`);
  const replacement = `${marker}
    ${prefix}useLayoutEffect(() => {
        if (animationDuration !== 0) return;
        clearTimeout(previousTimeoutRef.current);
        clearPromotion();
        const nextPosition = convertPositionToObject(position);
        setCurrentPosition(nextPosition);
        setPositionDifferences({ removed: {}, added: {} });
        setIsWaitingForAnimation(false);
        setWasManualDrop(false);
        setLastPieceColour(undefined);
        clearPremoves();
        clearArrows();
        getPositionObject(nextPosition);
    }, [position]);
    // handle external position change (animated moves only)
    ${prefix}useEffect(() => {
        if (animationDuration === 0) return;`;
  fs.writeFileSync(file, source.replace(needle, replacement));
  console.log(`Patched atomic zero-duration positions: ${name}`);
}
