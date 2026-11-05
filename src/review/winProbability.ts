import type { Eval } from '../engine/types'

/** Centipawn evals beyond this are treated as this (the curve is flat there anyway). */
export const CP_CEILING = 1000

/**
 * Lichess win% for White, 0..100, from an eval (White POV), as in scalachess
 * `chess.eval.WinPercent` (`fromCentiPawns` / `fromMate`):
 *   50 + 50 * (2 / (1 + exp(-0.00368208 * cp)) - 1)
 * with cp clamped to +/-1000. A mate counts as cp +/-1000 (Lichess
 * `Cp.CEILING`), so about 97.5 for White mating and 2.5 for Black mating; this
 * stops engine swings between "mate N" and a big cp score from looking like
 * losses. `Eval` keeps `kind: 'mate'` for display. A draw is 50.
 */
export function winPercent(e: Eval): number {
  switch (e.kind) {
    case 'draw':
      return 50
    case 'mate':
      return winPercentFromCp(e.winner === 'w' ? CP_CEILING : -CP_CEILING)
    case 'cp':
      return winPercentFromCp(e.cp)
  }
}

export function winPercentFromCp(cp: number): number {
  const clamped = Math.max(-CP_CEILING, Math.min(CP_CEILING, cp))
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamped)) - 1)
}

/** Win% from the given side's point of view. */
export function moverWinPercent(e: Eval, color: 'w' | 'b'): number {
  const wp = winPercent(e)
  return color === 'w' ? wp : 100 - wp
}
