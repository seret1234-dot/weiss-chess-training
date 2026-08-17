export type BoardViewportConstraints = {
 viewportWidth: number
 viewportHeight: number
 horizontalReserved: number
 verticalReserved: number
 maxBoardSize: number
 minimumBoardSize?: number
}

/**
 * Keeps an interactive square board inside the usable trainer viewport.
 * The minimum is deliberately soft: on a short viewport we prefer a smaller
 * usable board to clipping a rank or putting fixed controls over it.
 */
export function getViewportConstrainedBoardSize({
 viewportWidth,
 viewportHeight,
 horizontalReserved,
 verticalReserved,
 maxBoardSize,
 minimumBoardSize = 320,
}: BoardViewportConstraints) {
 const availableWidth = Math.max(0, viewportWidth - horizontalReserved)
 const availableHeight = Math.max(0, viewportHeight - verticalReserved)
 const constrainedSize = Math.min(maxBoardSize, availableWidth, availableHeight)

 return Math.floor(Math.max(Math.min(minimumBoardSize, constrainedSize), constrainedSize))
}
