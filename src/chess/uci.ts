import { Chess } from 'chess.js'

/** Splits a UCI move like 'e7e8q' into squares. Undefined if it is not UCI-shaped. */
export function uciToSquares(uci: string): { from: string; to: string; promotion?: string } | undefined {
  const m = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(uci)
  if (!m) return undefined
  return m[3] ? { from: m[1], to: m[2], promotion: m[3] } : { from: m[1], to: m[2] }
}

/** Converts a UCI move to SAN in the given position. Undefined if the move is illegal. */
export function uciToSan(fen: string, uci: string): string | undefined {
  const squares = uciToSquares(uci)
  if (!squares) return undefined
  try {
    return new Chess(fen).move(squares).san
  } catch {
    return undefined
  }
}
