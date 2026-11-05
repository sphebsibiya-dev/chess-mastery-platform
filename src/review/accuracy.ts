import type { SideAccuracy } from './types'

/*
 * Formulas follow Lichess so numbers line up with what users see there:
 * - move accuracy: lila `lila.analyse.AccuracyPercent.fromWinPercents`
 *   (modules/analyse/src/main/AccuracyPercent.scala)
 * - game accuracy: lila `AccuracyPercent.gameAccuracy` (same file)
 * See also https://lichess.org/page/accuracy
 */

/**
 * Lichess move accuracy from the mover's win% before and after the move:
 *   raw = 103.1668100711649 * exp(-0.04354415386753951 * loss) - 3.166924740191411
 *   accuracy = clamp(raw + 1, 0, 100)   // +1 is Lichess's "uncertainty bonus"
 * A move that does not lose anything (after >= before) is 100.
 */
export function moveAccuracy(wpBefore: number, wpAfter: number): number {
  return accuracyFromLoss(Math.max(0, wpBefore - wpAfter))
}

export function accuracyFromLoss(loss: number): number {
  if (loss <= 0) return 100
  const raw = 103.1668100711649 * Math.exp(-0.04354415386753951 * loss) - 3.166924740191411
  // +1: Lichess's "uncertainty bonus (due to imperfect analysis)".
  return Math.max(0, Math.min(100, raw + 1))
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x))

function stdDev(xs: number[]): number {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  const variance = xs.reduce((a, x) => a + (x - mean) ** 2, 0) / xs.length
  return Math.sqrt(variance)
}

/**
 * Volatility weight for each move (Lichess `gameAccuracy`): the std-dev of
 * White's win% over a sliding window of positions, clamped to 0.5..12. The
 * window size is the move count integer-divided by 10, clamped to 2..8
 * (Lichess: `((cps.size - 1) / 10).squeeze(2, 8)`). The first `size - 2` moves
 * reuse the first window, so there is exactly one weight per move.
 */
export function volatilityWeights(winPercents: number[]): number[] {
  const moves = winPercents.length - 1
  if (moves <= 0) return []
  const size = Math.min(clamp(Math.floor(moves / 10), 2, 8), winPercents.length)
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
    // Each value is floored at 1 so a 0% move cannot divide by zero.
    const harmonic = mine.length / mine.reduce((a, m) => a + 1 / Math.max(1, m.accuracy), 0)
    result[color] = (weighted + harmonic) / 2
  }
  return result
}
