import type { SideAccuracy } from './types'

/**
 * Lichess move accuracy from the mover's win% before and after the move:
 *   103.1668 * exp(-0.04354 * loss) - 3.1669, clamped to 0..100.
 */
export function moveAccuracy(wpBefore: number, wpAfter: number): number {
  return accuracyFromLoss(Math.max(0, wpBefore - wpAfter))
}

export function accuracyFromLoss(loss: number): number {
  // The fitted constants give 99.9999 at zero loss; a perfect move is 100.
  if (loss <= 0) return 100
  const raw = 103.1668 * Math.exp(-0.04354 * Math.max(0, loss)) - 3.1669
  return Math.max(0, Math.min(100, raw))
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

function stdDev(xs: number[]): number {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  const variance = xs.reduce((a, x) => a + (x - mean) ** 2, 0) / xs.length
  return Math.sqrt(variance)
}

/**
 * Volatility weight for each move (Lichess): the std-dev of White's win% over a
 * sliding window of `clamp(round(positions / 10), 2, 8)` positions, clamped to
 * 0.5..12. The first moves reuse the first window, so there is one weight per move.
 */
export function volatilityWeights(winPercents: number[]): number[] {
  const moves = winPercents.length - 1
  if (moves <= 0) return []
  const size = Math.min(clamp(Math.round(winPercents.length / 10), 2, 8), winPercents.length)
  const windows: number[][] = []
  for (let i = 0; i < size - 2; i++) windows.push(winPercents.slice(0, size))
  for (let i = 0; i + size <= winPercents.length; i++) windows.push(winPercents.slice(i, i + size))
  return windows.slice(0, moves).map((w) => clamp(stdDev(w), 0.5, 12))
}

export interface MoveAccuracyInput {
  color: 'w' | 'b'
  /** 0..100. Forced moves should be passed as 100. */
  accuracy: number
}

/**
 * Lichess game accuracy for each side: the average of the volatility-weighted
 * mean and the harmonic mean of that side's move accuracies. Moves are split by
 * the mover's colour (not ply parity), so games from a FEN with Black to move work.
 *
 * @param winPercents White's win% for every position (moves.length + 1 entries).
 * @param moves one entry per move, in order.
 */
export function gameAccuracy(winPercents: number[], moves: MoveAccuracyInput[]): SideAccuracy {
  const weights = volatilityWeights(winPercents)
  const result: SideAccuracy = {}
  for (const color of ['w', 'b'] as const) {
    const mine = moves.map((m, i) => ({ ...m, weight: weights[i] ?? 1 })).filter((m) => m.color === color)
    if (mine.length === 0) continue
    const weightSum = mine.reduce((a, m) => a + m.weight, 0)
    const weighted = mine.reduce((a, m) => a + m.accuracy * m.weight, 0) / weightSum
    // Lichess floors each value at 1 so a 0% move does not divide by zero.
    const harmonic = mine.length / mine.reduce((a, m) => a + 1 / Math.max(1, m.accuracy), 0)
    result[color] = (weighted + harmonic) / 2
  }
  return result
}
