import { Chess } from 'chess.js'
import { uciToSquares } from './uci'

export interface PvMove {
  /** SAN notation for this move in the line. */
  san: string
  /** FEN of the position after this move. */
  fen: string
}

/**
 * Replay a UCI principal variation from the given FEN.
 * Returns the SAN and resulting FEN for each move in the line.
 * Stops at the first illegal or unrecognised move.
 * Returns an empty array when `uci` is empty.
 */
export function pvToLine(fen: string, uci: readonly string[]): PvMove[] {
  const chess = new Chess(fen)
  const result: PvMove[] = []
  for (const moveUci of uci) {
    const squares = uciToSquares(moveUci)
    if (!squares) break
    try {
      const m = chess.move(squares)
      result.push({ san: m.san, fen: chess.fen() })
    } catch {
      break
    }
  }
  return result
}
