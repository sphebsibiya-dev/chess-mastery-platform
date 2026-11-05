import type { Arrow } from 'react-chessboard'
import { uciToSquares } from '../chess/uci'
import type { Eval, PositionAnalysis } from '../engine/types'
import type { MoveClass } from '../review/types'

/** Colour of the engine's best-move arrow. */
export const ENGINE_ARROW_COLOR = 'rgba(46, 160, 67, 0.85)'

/** Badge symbol, accessible label, and the phrase used in "Nf3 is …". */
export const CLASS_INFO: Record<MoveClass, { symbol: string; label: string; phrase: string }> = {
  best: { symbol: '★', label: 'Best move', phrase: 'the best move' },
  excellent: { symbol: '!', label: 'Excellent', phrase: 'excellent' },
  good: { symbol: '✓', label: 'Good', phrase: 'good' },
  inaccuracy: { symbol: '?!', label: 'Inaccuracy', phrase: 'an inaccuracy' },
  mistake: { symbol: '?', label: 'Mistake', phrase: 'a mistake' },
  blunder: { symbol: '??', label: 'Blunder', phrase: 'a blunder' },
  forced: { symbol: '□', label: 'Forced', phrase: 'the only legal move' },
}

/**
 * Short eval text, White POV: '+0.35', '-1.20', '0.00', 'M3' (White mates),
 * '-M3' (Black mates), '#' (checkmate on the board), 'Draw'.
 */
export function formatEval(e: Eval): string {
  switch (e.kind) {
    case 'draw':
      return 'Draw'
    case 'mate':
      if (e.in === 0) return '#'
      return `${e.winner === 'w' ? '' : '-'}M${e.in}`
    case 'cp': {
      const pawns = (e.cp / 100).toFixed(2)
      return e.cp > 0 ? `+${pawns}` : e.cp === 0 ? '0.00' : pawns
    }
  }
}

/**
 * The engine's best move in the position at `ply` as a board arrow. Returns an
 * array so other arrow sources (e.g. user drawings) can be concatenated with it.
 */
export function engineArrows(positions: readonly PositionAnalysis[], ply: number): Arrow[] {
  const best = positions[ply]?.bestMove
  const squares = best ? uciToSquares(best) : undefined
  return squares ? [{ startSquare: squares.from, endSquare: squares.to, color: ENGINE_ARROW_COLOR }] : []
}
