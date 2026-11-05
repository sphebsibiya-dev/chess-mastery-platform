import { Chess } from 'chess.js'

export type Color = 'w' | 'b'

/** Conventional piece values in pawns. The king is not counted. */
export const PIECE_VALUES: Readonly<Record<'p' | 'n' | 'b' | 'r' | 'q' | 'k', number>> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
}

/** Material of `color` minus the opponent's, in pawns, for the position in `fen`. */
export function materialBalance(fen: string, color: Color): number {
  return balanceOf(new Chess(fen), color)
}

/** Same as `materialBalance`, for a board that is already loaded. */
export function balanceOf(chess: Chess, color: Color): number {
  let balance = 0
  for (const row of chess.board()) {
    for (const square of row) {
      if (!square) continue
      const value = PIECE_VALUES[square.type]
      balance += square.color === color ? value : -value
    }
  }
  return balance
}
