import { Chess } from 'chess.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { parsePgn } from '../../import/pgn'
import type { ImportedGame } from '../../import/types'
import { bookPrefix, loadOpeningBook, parseBook, positionKey, type OpeningBook } from './book'

function game(pgn: string): ImportedGame {
  const result = parsePgn(pgn)
  if (!result.ok) throw new Error(result.error)
  return result.games[0]
}

function keyAfter(sans: string[]): string {
  const chess = new Chess()
  for (const san of sans) chess.move(san)
  return positionKey(chess.fen())
}

let book: OpeningBook

beforeAll(async () => {
  book = await loadOpeningBook()
})

describe('positionKey', () => {
  it('keeps placement, side to move and castling, and drops en passant and clocks', () => {
    expect(positionKey('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')).toBe(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq',
    )
    expect(positionKey('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')).toBe(
      positionKey('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'),
    )
  })
})

describe('parseBook', () => {
  it('decodes front-coded keys and name indexes', () => {
    const names = ['00Alpha\tA00', '05 Beta\tB01'].join('\n')
    const positions = ['00abc w -\t1', '02x w -', '01yz b KQ\t0'].join('\n')
    expect([...parseBook(names, positions)]).toEqual([
      ['abc w -', { eco: 'B01', name: 'Alpha Beta' }],
      ['abx w -', null],
      ['ayz b KQ', { eco: 'A00', name: 'Alpha' }],
    ])
  })

  it('rejects an index outside the name table', () => {
    expect(() => parseBook('00Alpha\tA00', '00abc w -\t5')).toThrow()
  })
})

describe('loadOpeningBook', () => {
  it('memoises the book', async () => {
    expect(await loadOpeningBook()).toBe(book)
  })

  it('has sane data', () => {
    const named = [...book.values()].filter((v) => v !== null)
    expect(named.length).toBeGreaterThan(3000)
    for (const opening of named) expect(opening!.eco).toMatch(/^[A-E]\d\d$/)
    for (const key of book.keys()) {
      const fields = key.split(' ')
      expect(fields).toHaveLength(3)
      expect(fields[1]).toMatch(/^[wb]$/)
    }
  })

  it('does not contain the start position', () => {
    expect(book.has(keyAfter([]))).toBe(false)
  })
})

describe('bookPrefix', () => {
  it('names the Ruy Lopez', () => {
    const prefix = bookPrefix(game('1. e4 e5 2. Nf3 Nc6 3. Bb5 *'), book)
    expect(prefix).toEqual({ plies: 5, opening: { eco: 'C60', name: 'Ruy Lopez' } })
  })

  it('follows the Najdorf for all 10 plies', () => {
    const prefix = bookPrefix(game('1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 *'), book)
    expect(prefix).toEqual({ plies: 10, opening: { eco: 'B90', name: 'Sicilian Defense: Najdorf Variation' } })
  })

  it('counts unnamed intermediate positions of the Closed Ruy Lopez as book', () => {
    const pgn = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 *'
    const g = game(pgn)
    const prefix = bookPrefix(g, book)
    expect(prefix.plies).toBe(17)
    expect(prefix.opening?.eco).toMatch(/^C9\d$/)
    // At least one position on the way has no name of its own.
    expect(g.moves.some((m) => book.get(positionKey(m.fenAfter)) === null)).toBe(true)
  })

  it('stops at the first non-book move even if a later position is book again', () => {
    // 1.Nf3 Nf6 2.Ng1?! Ng8 3.e4 reaches the 1.e4 position (same key), but 2.Ng1 left the book.
    const g = game('1. Nf3 Nf6 2. Ng1 Ng8 3. e4 *')
    expect(book.has(positionKey(g.moves[1].fenAfter))).toBe(true)
    expect(book.has(positionKey(g.moves[2].fenAfter))).toBe(false)
    expect(book.has(positionKey(g.moves[4].fenAfter))).toBe(true)
    expect(bookPrefix(g, book).plies).toBe(2)
  })

  it('counts transpositions as book', () => {
    // 1.d4 Nf6 2.c4 e6 and 1.c4 e6 2.d4 Nf6 reach the same position.
    expect(bookPrefix(game('1. c4 e6 2. d4 Nf6 *'), book).plies).toBe(4)
  })

  it('has no book moves for a game from a custom position', () => {
    const g = game('[SetUp "1"]\n[FEN "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBN1 w Qkq - 0 1"]\n\n1. e4 *')
    expect(bookPrefix(g, book)).toEqual({ plies: 0 })
  })

  it('is empty for a game with no moves', () => {
    expect(bookPrefix({ ...game('1. e4 *'), moves: [] }, book)).toEqual({ plies: 0 })
  })
})
