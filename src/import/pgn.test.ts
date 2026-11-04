import { describe, expect, it } from 'vitest'
import { START_FEN } from '../chess/constants'
import {
  CASTLING,
  CASTLING_ZEROS,
  CHESSCOM_CLOCKS,
  COMMENTS_NAGS_VARIATIONS,
  EN_PASSANT,
  LICHESS_CLOCKS,
  PROMOTION,
  REPEATED_POSITIONS,
  RUY_LOPEZ,
  TWO_GAMES,
  TWO_GAMES_SECOND_BROKEN,
  UNDERPROMOTION,
} from './fixtures'
import { parseClock, parsePgn, splitPgnGames } from './pgn'
import type { ImportedGame } from './types'

function single(text: string): ImportedGame {
  const result = parsePgn(text)
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`)
  expect(result.games).toHaveLength(1)
  return result.games[0]
}

describe('parsePgn', () => {
  it('parses a basic game with headers', () => {
    const game = single(RUY_LOPEZ)
    expect(game.source).toBe('pgn')
    expect(game.moves).toHaveLength(10)
    expect(game.headers.white).toBe('A')
    expect(game.headers.black).toBe('B')
    expect(game.headers.result).toBe('1-0')
    expect(game.headers.date).toBe('2024.01.15')
    expect(game.headers.site).toBeUndefined()
    expect(game.moves[0]).toMatchObject({
      ply: 1,
      san: 'e4',
      lan: 'e2e4',
      from: 'e2',
      to: 'e4',
      color: 'w',
      moveNumber: 1,
    })
    expect(game.moves[1]).toMatchObject({ ply: 2, san: 'e5', color: 'b', moveNumber: 1 })
    expect(game.moves[9]).toMatchObject({ ply: 10, san: 'Be7', color: 'b', moveNumber: 5 })
    expect(game.moves[0].fenBefore).toBe(START_FEN)
    expect(game.startFen).toBe(START_FEN)
    expect(game.moves[1].fenBefore).toBe(game.moves[0].fenAfter)
    expect(game.pgn).toBe(RUY_LOPEZ)
    expect(game.id).toMatch(/^[0-9a-f]{8}$/)
    expect(single(RUY_LOPEZ).id).toBe(game.id)
  })

  it('handles castling on both sides, including 0-0 notation', () => {
    const game = single(CASTLING)
    const whiteOO = game.moves[6]
    expect(whiteOO).toMatchObject({ san: 'O-O', from: 'e1', to: 'g1', color: 'w' })
    expect(whiteOO.fenAfter.split(' ')[0].split('/')[7]).toBe('RNBQ1RK1')
    const blackOOO = game.moves[13]
    expect(blackOOO).toMatchObject({ san: 'O-O-O', from: 'e8', to: 'c8', color: 'b' })
    expect(blackOOO.fenAfter.split('/')[0]).toBe('2kr2nr')

    const zeros = single(CASTLING_ZEROS)
    expect(zeros.moves[6]).toMatchObject({ san: 'O-O', from: 'e1', to: 'g1' })
  })

  it('handles promotion from a FEN start position', () => {
    const game = single(PROMOTION)
    expect(game.startFen).toBe('8/P7/8/8/8/8/8/k6K w - - 0 1')
    expect(game.moves[0].fenBefore).toBe(game.startFen)
    expect(game.moves[0]).toMatchObject({ san: 'a8=Q+', promotion: 'q', from: 'a7', to: 'a8', lan: 'a7a8q' })
    expect(game.moves[0].fenAfter.startsWith('Q7/')).toBe(true)

    const under = single(UNDERPROMOTION)
    expect(under.moves[0]).toMatchObject({ san: 'a8=N', promotion: 'n' })
    expect(under.moves[0].fenAfter.startsWith('N7/')).toBe(true)
  })

  it('handles en passant', () => {
    const game = single(EN_PASSANT)
    expect(game.moves[4]).toMatchObject({ san: 'exd6', from: 'e5', to: 'd6' })
    const ranks = game.moves[4].fenAfter.split(' ')[0].split('/')
    expect(ranks[3]).toBe('8') // rank 5 is empty: the d5 pawn was captured
  })

  it('keeps only the mainline with comments, ignoring NAGs and variations', () => {
    const game = single(COMMENTS_NAGS_VARIATIONS)
    expect(game.moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3', 'Nc6'])
    expect(game.moves[2].comment).toBe('good')
    expect(game.moves[0].comment).toBeUndefined()
    expect(game.moves[1].comment).toBeUndefined()
  })

  it('reads chess.com-style clocks and strips commands from comments', () => {
    const game = single(CHESSCOM_CLOCKS)
    expect(game.moves.map((m) => m.clockSeconds)).toEqual([598.1, 597, 590])
    expect(game.moves.every((m) => m.comment === undefined)).toBe(true)
  })

  it('reads Lichess-style clocks with spaces inside braces', () => {
    const game = single(LICHESS_CLOCKS)
    expect(game.moves.map((m) => m.clockSeconds)).toEqual([180, 179, 178])
    expect(game.moves.every((m) => m.comment === undefined)).toBe(true)
  })

  it('leaves clockSeconds undefined when there are no clocks', () => {
    const game = single(RUY_LOPEZ)
    expect(game.moves.every((m) => m.clockSeconds === undefined)).toBe(true)
  })

  it('maps clocks correctly on repeated positions', () => {
    const game = single(REPEATED_POSITIONS)
    const clocks = game.moves.map((m) => m.clockSeconds)
    expect(clocks).toEqual([300, 299, 298, 297, 296, 295, 294, 293])
    expect(new Set(clocks).size).toBe(8)
  })

  it('splits multiple games', () => {
    for (const text of [TWO_GAMES, TWO_GAMES.replace(/\n/g, '\r\n')]) {
      const result = parsePgn(text)
      if (!result.ok) throw new Error(result.error)
      expect(result.games).toHaveLength(2)
      expect(result.skipped).toEqual([])
      expect(result.games[0].headers.white).toBe('First')
      expect(result.games[0].headers.result).toBe('1-0')
      expect(result.games[0].moves[0].san).toBe('e4')
      expect(result.games[1].headers.white).toBe('Second')
      expect(result.games[1].headers.result).toBe('0-1')
      expect(result.games[1].moves[0].san).toBe('f3')
      expect(result.games[0].id).not.toBe(result.games[1].id)
    }
  })

  it('keeps good games when one game in a multi-game paste is broken', () => {
    const result = parsePgn(TWO_GAMES_SECOND_BROKEN)
    if (!result.ok) throw new Error(result.error)
    expect(result.games).toHaveLength(1)
    expect(result.games[0].headers.white).toBe('Good')
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].index).toBe(1)
    expect(result.skipped[0].error).toContain('Ke3')
  })

  it('reports readable errors for invalid input', () => {
    const illegal = parsePgn('1. e4 e5 2. Ke3')
    expect(illegal.ok).toBe(false)
    if (!illegal.ok) expect(illegal.error).toBe('Illegal move "Ke3"')

    const garbage = parsePgn('hello world')
    expect(garbage.ok).toBe(false)

    for (const empty of ['', '   ', '\n\n']) {
      const result = parsePgn(empty)
      expect(result).toEqual({ ok: false, error: 'No moves found' })
    }

    const headersOnly = parsePgn('[White "A"]\n[Black "B"]\n')
    expect(headersOnly.ok).toBe(false)
    if (!headersOnly.ok) expect(headersOnly.error).toBe('No moves found')
  })

  it('normalises headers', () => {
    const game = single(`[White "A"]
[Black "?"]
[WhiteElo "1500"]
[BlackElo "?"]
[Date "????.??.??"]
[ECO "C60"]
[ECOUrl "https://www.chess.com/openings/Ruy-Lopez"]
[TimeControl "600"]

1. e4 *`)
    expect(game.headers.whiteElo).toBe(1500)
    expect(game.headers.blackElo).toBeUndefined()
    expect(game.headers.black).toBeUndefined()
    expect(game.headers.date).toBeUndefined()
    expect(game.headers.eco).toBe('C60')
    expect(game.headers.timeControl).toBe('600')
    expect(game.headers.result).toBe('*')
    expect(game.headers.raw.ECOUrl).toBe('https://www.chess.com/openings/Ruy-Lopez')
    expect(game.headers.raw.Black).toBeUndefined()
    expect(game.headers.raw.Date).toBeUndefined()
  })
})

describe('splitPgnGames', () => {
  it('treats headerless movetext as one game', () => {
    expect(splitPgnGames('1. e4 e5 2. Nf3 *')).toEqual(['1. e4 e5 2. Nf3 *'])
  })

  it('does not split on a clock comment at the start of a movetext line', () => {
    const text = '[White "A"]\n\n1. e4\n{[%clk 0:09:58]} e5\n[%clk 0:09:57] 2. Nf3 *'
    expect(splitPgnGames(text)).toHaveLength(1)
  })

  it('splits when tags follow the previous result with a single newline', () => {
    const text = '[White "A"]\n\n1. e4 1-0\n[White "B"]\n\n1. d4 0-1'
    const games = splitPgnGames(text)
    expect(games).toHaveLength(2)
    expect(games[1].startsWith('[White "B"]')).toBe(true)
  })

  it('returns nothing for blank input', () => {
    expect(splitPgnGames('  \n \n')).toEqual([])
  })
})

describe('parseClock', () => {
  it('parses h:mm:ss, fractional seconds and m:ss', () => {
    expect(parseClock('[%clk 1:02:03]')).toBe(3723)
    expect(parseClock('[%clk 0:00:05.3]')).toBe(5.3)
    expect(parseClock('[%clk 3:05]')).toBe(185)
    expect(parseClock('  [%clk 0:03:00] ')).toBe(180)
  })

  it('ignores comments without a clock', () => {
    expect(parseClock('no clock')).toBeUndefined()
    expect(parseClock('[%eval 0.3] [%emt 0:00:02]')).toBeUndefined()
  })
})
