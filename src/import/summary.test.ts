import { describe, expect, it } from 'vitest'
import { mapChesscomGame } from './chesscom'
import { HIKARU_DAILY_WIN, HIKARU_WIN } from './chesscomFixtures'
import { mapLichessGame } from './lichess'
import { LICHESS_WIN } from './lichessFixtures'
import { outcomeFor, sameUser, summaryToGame, userSide } from './summary'
import type { GameSummary } from './types'

function must(summary: GameSummary | null): GameSummary {
  if (!summary) throw new Error('fixture did not map')
  return summary
}

describe('perspective helpers', () => {
  it('matches usernames ignoring case and whitespace', () => {
    expect(sameUser('Hikaru', ' hikaru ')).toBe(true)
    expect(sameUser('Hikaru', undefined)).toBe(false)
    expect(userSide('a', 'B', 'b')).toBe('b')
    expect(userSide('a', 'b', 'c')).toBeNull()
  })

  it('computes the outcome from either side', () => {
    expect(outcomeFor('1-0', 'w')).toBe('win')
    expect(outcomeFor('1-0', 'b')).toBe('loss')
    expect(outcomeFor('0-1', 'b')).toBe('win')
    expect(outcomeFor('1/2-1/2', 'w')).toBe('draw')
  })
})

describe('summaryToGame', () => {
  it('turns a chess.com row into a game with clocks and headers', () => {
    const summary = must(mapChesscomGame(HIKARU_WIN, 'hikaru'))
    const game = summaryToGame(summary)
    expect(game.id).toBe(summary.id)
    expect(game.source).toBe('chesscom')
    expect(game.moves[0].san).toBe('e4')
    expect(game.moves[0].clockSeconds).toBe(180)
    expect(game.moves.at(-1)?.san).toBe('Qxf7#')
    expect(game.headers.whiteElo).toBe(3350)
    expect(game.headers.result).toBe(summary.result)
  })

  it('handles chess.com "1..." move numbers in a daily game', () => {
    const summary = must(mapChesscomGame(HIKARU_DAILY_WIN, 'hikaru'))
    const game = summaryToGame(summary)
    expect(game.moves.map((m) => m.san)).toEqual(['f3', 'e5', 'g4', 'Qh4#'])
    expect(game.headers.result).toBe(summary.result)
  })

  it('turns a Lichess row into a game with clocks and headers', () => {
    const summary = must(mapLichessGame(LICHESS_WIN, 'thibault'))
    const game = summaryToGame(summary)
    expect(game.id).toBe('lichess:AbCd1234')
    expect(game.source).toBe('lichess')
    expect(game.moves[0].san).toBe('e4')
    expect(game.moves[0].clockSeconds).toBe(180)
    expect(game.headers.whiteElo).toBe(1950)
    expect(game.headers.result).toBe(summary.result)
  })

  it('throws a readable error for a broken PGN', () => {
    const summary = must(mapChesscomGame(HIKARU_WIN, 'hikaru'))
    expect(() => summaryToGame({ ...summary, pgn: '1. e4 e5 2. Ke3 1-0' })).toThrow(/Illegal move/)
  })
})
