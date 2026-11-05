import { parseGame } from './pgn'
import type { GameResult, GameSummary, ImportedGame } from './types'

/** Case-insensitive username match. */
export function sameUser(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** Which side `username` played, or null if neither. */
export function userSide(
  white: string | undefined | null,
  black: string | undefined | null,
  username: string,
): 'w' | 'b' | null {
  if (sameUser(white, username)) return 'w'
  if (sameUser(black, username)) return 'b'
  return null
}

/** A finished game's result from one side's point of view. */
export function outcomeFor(result: Exclude<GameResult, '*'>, color: 'w' | 'b'): GameSummary['outcome'] {
  if (result === '1/2-1/2') return 'draw'
  const whiteWon = result === '1-0'
  return whiteWon === (color === 'w') ? 'win' : 'loss'
}

/**
 * Turn a picked list row into a full game, through the same PGN parser used
 * for pasted games so clocks, headers and FENs behave identically.
 * Throws an Error with a user-readable message if the PGN can't be read.
 */
export function summaryToGame(summary: GameSummary): ImportedGame {
  return parseGame(summary.pgn, { source: summary.source, id: summary.id })
}
