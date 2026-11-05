/**
 * Pure geometry for the evaluation graph. The SVG uses a 0..100 x 0..100
 * viewBox stretched to the element (`preserveAspectRatio="none"`): x is the ply
 * scaled over the whole game, y is `100 - White win%` (White winning is up).
 */
export const GRAPH_SIZE = 100

const round = (n: number) => Math.round(n * 100) / 100

/** x coordinate (0..100) of a ply in a game of `totalPlies` plies. */
export function plyX(ply: number, totalPlies: number): number {
  return totalPlies > 0 ? round((ply / totalPlies) * GRAPH_SIZE) : 0
}

/** y coordinate (0..100) for a White win%. */
export function wpY(whiteWp: number): number {
  return round(GRAPH_SIZE - Math.max(0, Math.min(100, whiteWp)))
}

function points(whiteWp: readonly number[], totalPlies: number): string[] {
  if (totalPlies <= 0) return []
  const count = Math.min(whiteWp.length, totalPlies + 1)
  if (count < 2) return []
  return whiteWp.slice(0, count).map((wp, ply) => `${plyX(ply, totalPlies)},${wpY(wp)}`)
}

/**
 * The eval line through every analysed position. While analysis is running
 * `whiteWp` is shorter than the game, so the line stops at the last analysed
 * ply while the x scale still covers the whole game. Empty when there is
 * nothing to draw.
 */
export function graphLinePath(whiteWp: readonly number[], totalPlies: number): string {
  const pts = points(whiteWp, totalPlies)
  return pts.length === 0 ? '' : `M${pts.join('L')}`
}

/** The same line closed down to the bottom edge: White's share of the graph, filled. */
export function graphPath(whiteWp: readonly number[], totalPlies: number): string {
  const pts = points(whiteWp, totalPlies)
  if (pts.length === 0) return ''
  const lastX = plyX(pts.length - 1, totalPlies)
  return `M0,${GRAPH_SIZE}L${pts.join('L')}L${lastX},${GRAPH_SIZE}Z`
}

/** The ply under a pointer at `x` pixels across a graph `width` pixels wide. */
export function plyFromX(x: number, width: number, totalPlies: number): number {
  if (!(width > 0) || totalPlies <= 0 || !Number.isFinite(x)) return 0
  const clamped = Math.max(0, Math.min(width, x))
  return Math.round((clamped / width) * totalPlies)
}

/** Clock text: 12 -> '0:12', 75.4 -> '1:15', 3725 -> '1:02:05'. Fractions are dropped. */
export function formatClockSeconds(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const ss = String(s).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** Time spent text: 1 -> '1s', 0.4 -> '0s', 75 -> '1:15'. */
export function formatSpent(seconds: number): string {
  const rounded = Math.max(0, Math.round(seconds))
  return rounded < 60 ? `${rounded}s` : formatClockSeconds(rounded)
}
