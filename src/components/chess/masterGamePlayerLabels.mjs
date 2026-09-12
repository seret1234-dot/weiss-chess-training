export function orientMasterGamePlayers({
 white = '',
 black = '',
 orientation = 'white',
 whiteMeta = ' - ',
 blackMeta = ' - ',
}) {
 const whitePlayer = { name: white, side: 'White', meta: whiteMeta }
 const blackPlayer = { name: black, side: 'Black', meta: blackMeta }

 return orientation === 'white'
  ? { topPlayer: blackPlayer, bottomPlayer: whitePlayer }
  : { topPlayer: whitePlayer, bottomPlayer: blackPlayer }
}
