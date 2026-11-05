import type { Eval } from '../engine/types'

/** Centipawn evals beyond this are treated as this (the curve is flat there anyway). */
export const CP_CEILING = 1000

/**
 * Lichess win% for White, 0..100, from a centipawn eval (White POV):
 *   50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)
 * with cp clamped to +/-1000. Mate for White is 100, mate for Black 0, a draw 50.
 */
export function winPercent(e: Eval): number {
  switch (e.kind) {
    case 'draw':
      return 50
    case 'mate':
      return e.winner === 'w' ? 100 : 0
    case 'cp': {
      const cp = Math.max(-CP_CEILING, Math.min(CP_CEILING, e.cp))
      return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1)
    }
  }
}

/** Win% from the given side's point of view. */
export function moverWinPercent(e: Eval, color: 'w' | 'b'): number {
  const wp = winPercent(e)
  return color === 'w' ? wp : 100 - wp
}
