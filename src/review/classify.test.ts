import { describe, expect, it } from 'vitest'
import { START_FEN } from '../chess/constants'
import type { Eval, GameAnalysis } from '../engine/types'
import { CASTLING, PROMOTION, TWO_GAMES } from '../import/fixtures'
import { parsePgn } from '../import/pgn'
import {
  classForLoss,
  classifyGame,
  classifyMove,
  EXCELLENT_MAX_LOSS,
  GOOD_MAX_LOSS,
  INACCURACY_MAX_LOSS,
  MISTAKE_MAX_LOSS,
} from './classify'

const cp = (n: number): Eval => ({ kind: 'cp', cp: n })
const mate = (n: number, winner: 'w' | 'b'): Eval => ({ kind: 'mate', in: n, winner })

const WHITE_FEN = START_FEN
const BLACK_FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
const white = { ply: 1, color: 'w' as const, lan: 'e2e4', fenBefore: WHITE_FEN }
const black = { ply: 2, color: 'b' as const, lan: 'e7e5', fenBefore: BLACK_FEN }

describe('classifyMove', () => {
  it('calls the engine move best even with a small eval-noise loss', () => {
    const r = classifyMove({ move: white, before: cp(30), after: cp(10), bestMove: 'e2e4' })
    expect(r.cls).toBe('best')
    expect(r.loss).toBeGreaterThan(0)
    expect(r.bestMoveSan).toBe('e4')
  })

  it('calls a different move with the same eval excellent', () => {
    const r = classifyMove({ move: white, before: cp(30), after: cp(30), bestMove: 'd2d4' })
    expect(r.cls).toBe('excellent')
    expect(r.loss).toBe(0)
    expect(r.accuracy).toBeCloseTo(100, 2)
    expect(r.bestMoveSan).toBe('d4')
  })

  it("uses the mover's point of view for Black", () => {
    const r = classifyMove({ move: black, before: cp(50), after: cp(350), bestMove: 'c7c5' })
    expect(r.wpBefore).toBeCloseTo(45.4, 1)
    expect(r.wpAfter).toBeCloseTo(21.6, 1)
    expect(r.loss).toBeCloseTo(23.8, 1)
    expect(r.cls).toBe('blunder')
  })

  it('mirrors the same blunder for White', () => {
    const r = classifyMove({ move: white, before: cp(-50), after: cp(-350), bestMove: 'd2d4' })
    expect(r.loss).toBeCloseTo(23.8, 1)
    expect(r.cls).toBe('blunder')
  })

  it('clamps a negative loss to 0', () => {
    const r = classifyMove({ move: white, before: cp(0), after: cp(200), bestMove: 'd2d4' })
    expect(r.loss).toBe(0)
    expect(r.cls).toBe('excellent')
  })

  it('marks the only legal move as forced whatever the eval', () => {
    const move = { ply: 1, color: 'w' as const, lan: 'h1g2', fenBefore: '7k/8/8/8/8/8/6q1/7K w - - 0 1' }
    const r = classifyMove({ move, before: cp(500), after: cp(-900), bestMove: 'h1g2' })
    expect(r.cls).toBe('forced')
    expect(r.accuracy).toBe(100)
  })

  describe('mates', () => {
    it('mate in 3 to mate in 2 loses nothing', () => {
      const r = classifyMove({ move: white, before: mate(3, 'w'), after: mate(2, 'w'), bestMove: 'd2d4' })
      expect(r.loss).toBe(0)
      expect(r.cls).toBe('excellent')
    })

    it('letting a mate slip to +2 is a blunder (mate counts as +10.00)', () => {
      const r = classifyMove({ move: white, before: mate(3, 'w'), after: cp(200), bestMove: 'd2d4' })
      expect(r.wpBefore).toBeCloseTo(97.54, 2)
      expect(r.wpAfter).toBeCloseTo(67.62, 2)
      expect(r.loss).toBeCloseTo(29.9, 1)
      expect(r.cls).toBe('blunder')
    })

    it('a mate score turning into a big cp score costs little or nothing', () => {
      const big = classifyMove({ move: white, before: mate(4, 'w'), after: cp(1500), bestMove: 'd2d4' })
      expect(big.loss).toBe(0)
      expect(big.cls).toBe('excellent')
      const plus7 = classifyMove({ move: white, before: mate(4, 'w'), after: cp(700), bestMove: 'd2d4' })
      expect(plus7.loss).toBeCloseTo(4.6, 1)
      expect(plus7.cls).toBe('good')
    })

    it('walking into mate from -1 is a blunder', () => {
      const r = classifyMove({ move: white, before: cp(-100), after: mate(1, 'b'), bestMove: 'd2d4' })
      expect(r.wpAfter).toBeCloseTo(2.46, 2)
      expect(r.loss).toBeCloseTo(38.4, 1)
      expect(r.cls).toBe('blunder')
    })

    it('delivering checkmate loses nothing', () => {
      const r = classifyMove({ move: black, before: mate(1, 'b'), after: mate(0, 'b'), bestMove: 'c7c5' })
      expect(r.loss).toBe(0)
    })
  })
})

describe('best for castling and promotion', () => {
  // lan comes from the real PGN parser, so a change in its format would fail here.
  it('matches castling in UCI form (e1g1)', () => {
    const parsed = parsePgn(CASTLING)
    if (!parsed.ok) throw new Error(parsed.error)
    const castle = parsed.games[0].moves.find((m) => m.san === 'O-O' && m.color === 'w')!
    expect(castle.lan).toBe('e1g1')
    const r = classifyMove({ move: castle, before: cp(30), after: cp(10), bestMove: 'e1g1' })
    expect(r.cls).toBe('best')
    expect(r.bestMoveSan).toBe('O-O')
  })

  it('matches a promotion in UCI form (e7e8q)', () => {
    const move = { ply: 1, color: 'w' as const, lan: 'e7e8q', fenBefore: '7k/4P3/8/8/8/8/8/K7 w - - 0 1' }
    const r = classifyMove({ move, before: cp(900), after: cp(850), bestMove: 'e7e8q' })
    expect(r.cls).toBe('best')
    expect(r.bestMoveSan).toBe('e8=Q+')
    const parsed = parsePgn(PROMOTION)
    if (!parsed.ok) throw new Error(parsed.error)
    expect(parsed.games[0].moves[0].lan).toBe('a7a8q')
  })
})

describe('classForLoss boundaries', () => {
  it('uses strict upper bounds', () => {
    expect(classForLoss(0)).toBe('excellent')
    expect(classForLoss(1.99)).toBe('excellent')
    expect(classForLoss(2)).toBe('good')
    expect(classForLoss(4.99)).toBe('good')
    expect(classForLoss(5)).toBe('inaccuracy')
    expect(classForLoss(9.99)).toBe('inaccuracy')
    expect(classForLoss(10)).toBe('mistake')
    expect(classForLoss(19.99)).toBe('mistake')
    expect(classForLoss(20)).toBe('blunder')
    expect(classForLoss(100)).toBe('blunder')
  })

  it('exports the thresholds', () => {
    expect([EXCELLENT_MAX_LOSS, GOOD_MAX_LOSS, INACCURACY_MAX_LOSS, MISTAKE_MAX_LOSS]).toEqual([2, 5, 10, 20])
  })
})

describe('classifyGame', () => {
  it("classifies Fool's mate", () => {
    const parsed = parsePgn(TWO_GAMES)
    if (!parsed.ok) throw new Error(parsed.error)
    const game = parsed.games[1]
    const evals: Eval[] = [cp(20), cp(-60), cp(-50), mate(1, 'b'), mate(0, 'b')]
    const best = ['e2e4', 'e7e5', 'e2e4', 'd8h4', undefined]
    const analysis: GameAnalysis = {
      gameId: game.id,
      depth: 14,
      positions: evals.map((e, i) => ({ fen: i === 0 ? game.startFen : game.moves[i - 1].fenAfter, eval: e, bestMove: best[i], pv: [], depth: 14 })),
    }
    const { reviews, accuracy } = classifyGame(game, analysis)
    expect(reviews.map((r) => r.cls)).toEqual(['inaccuracy', 'best', 'blunder', 'best'])
    expect(reviews[2].bestMoveSan).toBe('e4')
    expect(accuracy.b).toBeGreaterThan(95)
    expect(accuracy.w).toBeLessThan(60)
  })

  it('rejects analysis of the wrong length', () => {
    const parsed = parsePgn(TWO_GAMES)
    if (!parsed.ok) throw new Error(parsed.error)
    const game = parsed.games[1]
    expect(() => classifyGame(game, { gameId: game.id, depth: 14, positions: [] })).toThrow()
  })
})
