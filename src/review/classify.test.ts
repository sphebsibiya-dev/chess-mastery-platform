import { describe, expect, it } from 'vitest'
import { START_FEN } from '../chess/constants'
import type { AnalysisLine, Eval, GameAnalysis } from '../engine/types'
import { CASTLING, PROMOTION, RUY_LOPEZ, TWO_GAMES } from '../import/fixtures'
import { parsePgn } from '../import/pgn'
import type { ImportedGame } from '../import/types'
import {
  ALREADY_WINNING_WP,
  BOOK_MAX_LOSS,
  BRILLIANT_MIN_SACRIFICE,
  BRILLIANT_MAX_PV_PLIES,
  BRILLIANT_MIN_WP_AFTER,
  BRILLIANT_PV_PLIES,
  classForLoss,
  classifyGame,
  classifyMove,
  EXCELLENT_MAX_LOSS,
  GOOD_MAX_LOSS,
  GREAT_MIN_GAP,
  INACCURACY_MAX_LOSS,
  MISS_MIN_GIFT,
  MISS_MIN_GIVEBACK,
  MISTAKE_MAX_LOSS,
  sacrificedMaterial,
} from './classify'
import { loadOpeningBook, positionKey, type Opening } from './openings/book'
import { moverWinPercent } from './winProbability'

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
      positions: evals.map((e, i) => ({ fen: i === 0 ? game.startFen : game.moves[i - 1].fenAfter, eval: e, bestMove: best[i], pv: [], depth: 14, lines: [] })),
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

// --- Brilliant / Great / Miss / Book -------------------------------------------

const line = (move: string, e: Eval): AnalysisLine => ({ move, eval: e, pv: [move] })

/** Philidor's legacy: 1.Qg8+! Rxg8 2.Nf7#. White gives up the queen (9) for a forced mate. */
const PHILIDOR_FEN = 'r6k/6pp/7N/8/8/1Q6/6PP/6K1 w - - 0 1'
const philidor = { ply: 1, color: 'w' as const, lan: 'b3g8', fenBefore: PHILIDOR_FEN }
const PHILIDOR_PV = ['a8g8', 'h6f7']

/**
 * Byrne-Fischer, New York 1956, before 17...Be6!! and Stockfish 19 lite's depth-14
 * line after it (18.Qxc3 Qxc5 19.dxc5 Bxc3 20.Bxe6 Rxe6 ...). Engine: -2.23 for White.
 */
const BYRNE_FISCHER_FEN = 'r3r1k1/pp3pbp/1qp3p1/2B5/2BP2b1/Q1n2N2/P4PPP/3R1K1R b - - 3 17'
const BYRNE_FISCHER_PV = 'a3c3 b6c5 d4c5 g7c3 c4e6 e8e6 g2g3 a8e8 f1g2 c3b4 d1d7 b4c5 d7b7 e6e2 h1f1 c5b6 f3g5'.split(' ')

describe('new class thresholds', () => {
  it('exports the tunable constants', () => {
    expect({
      ALREADY_WINNING_WP,
      BRILLIANT_MIN_SACRIFICE,
      BRILLIANT_MIN_WP_AFTER,
      BRILLIANT_PV_PLIES,
      GREAT_MIN_GAP,
      MISS_MIN_GIFT,
      MISS_MIN_GIVEBACK,
    }).toEqual({
      ALREADY_WINNING_WP: 95,
      BRILLIANT_MIN_SACRIFICE: 2,
      BRILLIANT_MIN_WP_AFTER: 50,
      BRILLIANT_PV_PLIES: 4,
      GREAT_MIN_GAP: 15,
      MISS_MIN_GIFT: 20,
      MISS_MIN_GIVEBACK: 0.5,
    })
  })
})

describe('sacrificedMaterial', () => {
  it('counts the queen given up in the Philidor line', () => {
    // Before: White +7. After Qg8+ Rxg8: White N+2P (5) vs R+2P (7) = -2.
    expect(sacrificedMaterial(PHILIDOR_FEN, 'b3g8', 'w', PHILIDOR_PV)).toBe(9)
  })

  it('treats a capture that is taken straight back as a trade', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1'
    expect(sacrificedMaterial(fen, 'b5c6', 'w', ['d7c6'])).toBe(0)
  })

  it('follows an exchange on one square to its end', () => {
    // White doubles on the d-file: Rxd7 Rxd7 Rxd7 wins a pawn overall (+4 before).
    const fen = '3r2k1/3p1ppp/8/8/8/8/3R1PPP/3R2K1 w - - 0 1'
    // If the line stops after Rxd7 Rxd7, the rook is gone: 4 - 0 = 4.
    expect(sacrificedMaterial(fen, 'd2d7', 'w', ['d8d7'])).toBe(4)
    // With the second Rxd7, White is +5: no sacrifice.
    expect(sacrificedMaterial(fen, 'd2d7', 'w', ['d8d7', 'd1d7', 'g8f8'])).toBe(-1)
  })

  it('ends the exchange at the first ply that is not a capture on that square', () => {
    // g3 interrupts after Rxd7 Rxd7, so the later Rxd7 is not part of the exchange.
    const fen = '3r2k1/3p1ppp/8/8/8/8/3R1PPP/3R2K1 w - - 0 1'
    expect(sacrificedMaterial(fen, 'd2d7', 'w', ['d8d7', 'g2g3', 'g8f8', 'h2h3', 'g7g6', 'd1d7'])).toBe(4)
  })

  it("counts the mover's own recapture at the end of the line (routine exchange is not a sacrifice)", () => {
    // Reviewer's repro: Nxd5 Nxd5 Bxd5 Nxd5 Rxd5 wins a pawn; White goes +4 -> +5.
    const fen = '6k1/8/1n3n2/3p4/8/2N2B2/8/3R2K1 w - - 0 1'
    const pv = ['f6d5', 'f3d5', 'b6d5', 'd1d5']
    expect(sacrificedMaterial(fen, 'c3d5', 'w', pv)).toBe(-1)
    const r = classifyMove({
      move: { ply: 1, color: 'w', lan: 'c3d5', fenBefore: fen },
      before: cp(40),
      after: cp(120),
      bestMove: 'c3d5',
      pvAfter: pv,
    })
    expect(r.cls).toBe('best')
  })

  it('follows a long exchange past BRILLIANT_PV_PLIES', () => {
    // Nxd5 Nxd5 Bxd5 Nxd5 Rxd5 Qxd5 Rxd5: six replies, all on d5. White ends a rook up (0 -> +5).
    const fen = '3q2k1/8/1n3n2/3p4/8/2N2B2/3R4/3R2K1 w - - 0 1'
    const pv = ['f6d5', 'f3d5', 'b6d5', 'd2d5', 'd8d5', 'd1d5']
    expect(sacrificedMaterial(fen, 'c3d5', 'w', pv)).toBe(-5)
    // Cut short after 4 replies, the exchange ends after the first Rxd5: White +1.
    expect(sacrificedMaterial(fen, 'c3d5', 'w', pv.slice(0, 4))).toBe(-1)
  })

  it('treats a capture answered by a recapture on the same square as an exchange', () => {
    // 1.Nd5 (defended by e4) Nxd5 2.exd5: knights traded, no sacrifice.
    const defended = '6k1/8/1n6/8/4P3/2N5/8/6K1 w - - 0 1'
    expect(sacrificedMaterial(defended, 'c3d5', 'w', ['b6d5', 'e4d5'])).toBe(0)
    // Without the e4 pawn the knight is simply lost.
    const hanging = '6k1/8/1n6/8/8/2N5/8/6K1 w - - 0 1'
    expect(sacrificedMaterial(hanging, 'c3d5', 'w', ['b6d5', 'g1f2'])).toBe(3)
  })

  it('counts a piece given for a pawn and recaptured by the king (Bxf7+ Kxf7)', () => {
    const fen = 'rnbqk2r/pppp1ppp/5n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1'
    expect(sacrificedMaterial(fen, 'c4f7', 'w', ['e8f7', 'f3g5', 'f7g8'])).toBe(2)
  })

  it('does not let material regained later by other tactics cancel a sacrifice', () => {
    // 17...Be6: 18.Qxc3 takes the knight; Black gets material back only via Qxc5, dxc5 Bxc3.
    const sacrifice = sacrificedMaterial(BYRNE_FISCHER_FEN, 'g4e6', 'b', BYRNE_FISCHER_PV)
    expect(sacrifice).toBeGreaterThanOrEqual(BRILLIANT_MIN_SACRIFICE)
  })

  it('exports the exchange cap', () => {
    expect(BRILLIANT_MAX_PV_PLIES).toBe(10)
  })

  it('counts material won by the move itself as a negative sacrifice', () => {
    // Rxd8+ wins a rook outright.
    expect(sacrificedMaterial('3r2k1/8/8/8/8/8/8/3R2K1 w - - 0 1', 'd1d8', 'w', ['g8h7'])).toBe(-5)
  })

  it('is undefined without an opponent reply or for an illegal move', () => {
    expect(sacrificedMaterial(PHILIDOR_FEN, 'b3g8', 'w', [])).toBeUndefined()
    expect(sacrificedMaterial(PHILIDOR_FEN, 'b3b8', 'w', PHILIDOR_PV)).toBeUndefined()
  })

  it('stops at an illegal PV move', () => {
    expect(sacrificedMaterial(PHILIDOR_FEN, 'b3g8', 'w', ['a8g8', 'h6f7', 'zz', 'a1a2'])).toBe(9)
    expect(sacrificedMaterial(PHILIDOR_FEN, 'b3g8', 'w', ['a1a2'])).toBeUndefined()
  })
})

describe('brilliant', () => {
  it('marks a sound queen sacrifice as brilliant', () => {
    const r = classifyMove({ move: philidor, before: cp(150), after: cp(160), bestMove: 'b3g8', pvAfter: PHILIDOR_PV })
    expect(r.cls).toBe('brilliant')
    expect(r.loss).toBe(0)
  })

  it('marks Byrne-Fischer 17...Be6 brilliant with its real engine line', () => {
    // Stockfish depth 14: -2.23 for White before and after; Be6 is the engine move.
    const move = { ply: 34, color: 'b' as const, lan: 'g4e6', fenBefore: BYRNE_FISCHER_FEN }
    const lines = [line('g4e6', cp(-223)), line('g4f3', cp(0))]
    const input = { move, before: cp(-223), after: cp(-223), bestMove: 'g4e6', pvAfter: BYRNE_FISCHER_PV, lines }
    expect(classifyMove(input).cls).toBe('brilliant')
  })

  it('also counts the engine best move with a noisy loss', () => {
    const r = classifyMove({ move: philidor, before: cp(250), after: cp(150), bestMove: 'b3g8', pvAfter: PHILIDOR_PV })
    expect(r.loss).toBeGreaterThan(EXCELLENT_MAX_LOSS)
    expect(r.cls).toBe('brilliant')
  })

  it('needs a small loss when it is not the engine move', () => {
    // wp(+180) - wp(+150) is about 2.4: just over EXCELLENT_MAX_LOSS.
    const r = classifyMove({ move: philidor, before: cp(180), after: cp(150), bestMove: 'h6f7', pvAfter: PHILIDOR_PV })
    expect(r.loss).toBeGreaterThanOrEqual(EXCELLENT_MAX_LOSS)
    expect(r.cls).toBe('good')
    // The same move with a loss under EXCELLENT_MAX_LOSS is brilliant even if it is not the engine move.
    const close = classifyMove({ move: philidor, before: cp(160), after: cp(150), bestMove: 'h6f7', pvAfter: PHILIDOR_PV })
    expect(close.cls).toBe('brilliant')
  })

  it('is not brilliant when already totally winning', () => {
    const r = classifyMove({
      move: philidor,
      before: mate(2, 'w'),
      after: mate(1, 'w'),
      bestMove: 'b3g8',
      pvAfter: PHILIDOR_PV,
    })
    expect(r.wpBefore).toBeGreaterThanOrEqual(ALREADY_WINNING_WP)
    expect(r.cls).toBe('best')
  })

  it('is not brilliant when the mover is worse afterwards', () => {
    const r = classifyMove({ move: philidor, before: cp(-80), after: cp(-100), bestMove: 'b3g8', pvAfter: PHILIDOR_PV })
    expect(r.wpAfter).toBeLessThan(BRILLIANT_MIN_WP_AFTER)
    expect(r.cls).toBe('best')
  })

  it('is not brilliant without an engine reply to look at', () => {
    const r = classifyMove({ move: philidor, before: cp(150), after: cp(160), bestMove: 'b3g8', pvAfter: [] })
    expect(r.cls).toBe('best')
  })

  it('is not brilliant for an equal trade', () => {
    const move = {
      ply: 7,
      color: 'w' as const,
      lan: 'b5c6',
      fenBefore: 'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 1',
    }
    const r = classifyMove({ move, before: cp(30), after: cp(30), bestMove: 'b5c6', pvAfter: ['d7c6'] })
    expect(r.cls).toBe('best')
  })

  it('wins over great when both apply', () => {
    const r = classifyMove({
      move: philidor,
      before: cp(150),
      after: cp(160),
      bestMove: 'b3g8',
      pvAfter: PHILIDOR_PV,
      lines: [line('b3g8', cp(160)), line('h6f7', cp(-400))],
    })
    expect(r.cls).toBe('brilliant')
  })
})

describe('great', () => {
  // wp(+200) = 67.6, wp(-100) = 40.9: a gap of about 26.7.
  const onlyGood = [line('e2e4', cp(200)), line('d2d4', cp(-100))]

  it('marks the only good move as great', () => {
    const r = classifyMove({ move: white, before: cp(200), after: cp(200), bestMove: 'e2e4', lines: onlyGood })
    expect(r.cls).toBe('great')
  })

  it('needs the gap to the second line to be big enough', () => {
    const lines = [line('e2e4', cp(60)), line('d2d4', cp(-50))]
    const gap = moverWinPercent(lines[0].eval, 'w') - moverWinPercent(lines[1].eval, 'w')
    expect(gap).toBeGreaterThan(9)
    expect(gap).toBeLessThan(GREAT_MIN_GAP)
    expect(classifyMove({ move: white, before: cp(60), after: cp(60), bestMove: 'e2e4', lines }).cls).toBe('best')
  })

  it('needs a second line', () => {
    const lines = [line('e2e4', cp(200))]
    expect(classifyMove({ move: white, before: cp(200), after: cp(200), bestMove: 'e2e4', lines }).cls).toBe('best')
  })

  it('finds the played move in the lines even if the re-search ranked it second', () => {
    // First search said e4 was best (so line 2 was searched), but the re-search put d4 on top by a hair.
    const lines = [line('d2d4', cp(210)), line('e2e4', cp(200))]
    const r = classifyMove({ move: white, before: cp(200), after: cp(200), bestMove: 'e2e4', lines })
    expect(r.cls).toBe('best') // gap is negative: not the only good move

    // With a third, much worse line it is still compared with the best *other* line (d4), not lines[1].
    const three = [line('d2d4', cp(210)), line('e2e4', cp(200)), line('c2c4', cp(-300))]
    expect(classifyMove({ move: white, before: cp(200), after: cp(200), bestMove: 'e2e4', lines: three }).cls).toBe(
      'best',
    )
  })

  it('is great when the played move is line 2 by noise but far ahead of every other line', () => {
    // Re-search lists another move first; it is still the played move vs the best other line.
    const lines = [line('d2d4', cp(-100)), line('e2e4', cp(200))]
    expect(classifyMove({ move: white, before: cp(200), after: cp(200), bestMove: 'e2e4', lines }).cls).toBe('great')
  })

  it('is not great when the played move is missing from the lines', () => {
    const lines = [line('d2d4', cp(200)), line('c2c4', cp(-100))]
    expect(classifyMove({ move: white, before: cp(200), after: cp(200), bestMove: 'e2e4', lines }).cls).toBe('best')
  })

  it('needs the played move to be the top line', () => {
    const lines = [line('d2d4', cp(200)), line('e2e4', cp(-100))]
    const r = classifyMove({ move: white, before: cp(200), after: cp(200), bestMove: 'd2d4', lines })
    expect(r.cls).toBe('excellent')
  })

  it('is not great when already totally winning', () => {
    const lines = [line('e2e4', cp(900)), line('d2d4', cp(300))]
    const r = classifyMove({ move: white, before: cp(900), after: cp(900), bestMove: 'e2e4', lines })
    expect(r.wpBefore).toBeGreaterThanOrEqual(ALREADY_WINNING_WP)
    expect(r.cls).toBe('best')
  })

  it("uses the mover's point of view for Black", () => {
    const lines = [line('e7e5', cp(-200)), line('c7c5', cp(100))]
    expect(classifyMove({ move: black, before: cp(-200), after: cp(-200), bestMove: 'e7e5', lines }).cls).toBe(
      'great',
    )
  })

  describe('recapture guard', () => {
    // 1.e4 d5 2.exd5 Qxd5: the recapture is the only good move but is never Great.
    const fenBefore = 'rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2'
    const qxd5 = { ply: 4, color: 'b' as const, lan: 'd8d5', fenBefore }
    const lines = [line('d8d5', cp(0)), line('g8f6', cp(300))]
    const input = { move: qxd5, before: cp(0), after: cp(0), bestMove: 'd8d5', lines }

    it('does not mark a recapture on the same square as great', () => {
      expect(classifyMove({ ...input, prevMove: { color: 'w', to: 'd5', san: 'exd5' } }).cls).toBe('best')
    })

    it('still marks the move great when the previous move was not a capture there', () => {
      expect(classifyMove({ ...input, prevMove: { color: 'w', to: 'd5', san: 'd5' } }).cls).toBe('great')
      expect(classifyMove(input).cls).toBe('great')
    })
  })
})

describe('miss', () => {
  // Black to move. Black's win% before, at cp(-300), is 75.1.
  const prevMove = { color: 'w' as const, to: 'e4', san: 'e4' }
  const gift = { prevMove, prevReview: { loss: 30 } }

  it('marks giving back at least half of the opponent gift as a miss', () => {
    // After cp(-100): Black 59.1, so the loss is about 16 (>= 15, half of 30).
    const r = classifyMove({ move: black, before: cp(-300), after: cp(-100), bestMove: 'c7c5', ...gift })
    expect(r.loss).toBeGreaterThanOrEqual(15)
    expect(r.cls).toBe('miss')
  })

  it('keeps the loss and accuracy of the class it replaces', () => {
    const missed = classifyMove({ move: black, before: cp(-300), after: cp(-100), bestMove: 'c7c5', ...gift })
    const plain = classifyMove({ move: black, before: cp(-300), after: cp(-100), bestMove: 'c7c5' })
    expect(plain.cls).toBe('mistake')
    expect(missed.accuracy).toBe(plain.accuracy)
    expect(missed.loss).toBe(plain.loss)
  })

  it('needs at least half of the gift back', () => {
    // After cp(-140): Black 62.6, a loss of about 12.5 (< 15).
    const r = classifyMove({ move: black, before: cp(-300), after: cp(-140), bestMove: 'c7c5', ...gift })
    expect(r.loss).toBeLessThan(15)
    expect(r.cls).toBe('mistake')
  })

  it('needs at least an inaccuracy-sized loss', () => {
    const r = classifyMove({
      move: black,
      before: cp(-300),
      after: cp(-200),
      bestMove: 'c7c5',
      prevMove,
      prevReview: { loss: 12 },
    })
    expect(r.loss).toBeGreaterThanOrEqual(0.5 * 12)
    expect(r.loss).toBeLessThan(INACCURACY_MAX_LOSS)
    expect(r.cls).toBe('inaccuracy')
  })

  it('needs a big enough gift', () => {
    const r = classifyMove({
      move: black,
      before: cp(-300),
      after: cp(-100),
      bestMove: 'c7c5',
      prevMove,
      prevReview: { loss: 15 },
    })
    expect(r.cls).toBe('mistake')
  })

  it('needs the gift to come from the opponent', () => {
    const r = classifyMove({
      move: black,
      before: cp(-300),
      after: cp(-100),
      bestMove: 'c7c5',
      prevMove: { color: 'b', to: 'e5', san: 'e5' },
      prevReview: { loss: 30 },
    })
    expect(r.cls).toBe('mistake')
  })

  it('is overridden by best (the loss is eval noise)', () => {
    const r = classifyMove({ move: black, before: cp(-300), after: cp(-100), bestMove: 'e7e5', ...gift })
    expect(r.cls).toBe('best')
  })

  it('also replaces a blunder', () => {
    const r = classifyMove({ move: black, before: cp(-300), after: cp(100), bestMove: 'c7c5', ...gift })
    expect(r.loss).toBeGreaterThanOrEqual(MISTAKE_MAX_LOSS)
    expect(r.cls).toBe('miss')
  })
})

describe('book', () => {
  it('beats brilliant, great and best', () => {
    const r = classifyMove({
      move: philidor,
      before: cp(150),
      after: cp(160),
      bestMove: 'b3g8',
      pvAfter: PHILIDOR_PV,
      inBook: true,
    })
    expect(r.cls).toBe('book')
    expect(r.accuracy).toBe(100)
  })

  it('is beaten by forced', () => {
    const move = { ply: 1, color: 'w' as const, lan: 'h1g2', fenBefore: '7k/8/8/8/8/8/6q1/7K w - - 0 1' }
    expect(classifyMove({ move, before: cp(0), after: cp(0), inBook: true }).cls).toBe('forced')
  })

  it('does not cover a losing move: a big loss inside the book is classified normally (here a miss)', () => {
    const r = classifyMove({
      move: black,
      before: cp(-300),
      after: cp(100),
      bestMove: 'c7c5',
      inBook: true,
      prevMove: { color: 'w', to: 'e4', san: 'e4' },
      prevReview: { loss: 30 },
    })
    expect(r.cls).toBe('miss')
    expect(r.accuracy).toBeLessThan(100)
  })
})

describe('classifyGame with the new classes', () => {
  function ruyLopez(): ImportedGame {
    const parsed = parsePgn(RUY_LOPEZ)
    if (!parsed.ok) throw new Error(parsed.error)
    return parsed.games[0]
  }

  function flatAnalysis(game: ImportedGame, evals?: Eval[]): GameAnalysis {
    return {
      gameId: game.id,
      depth: 14,
      positions: [game.startFen, ...game.moves.map((m) => m.fenAfter)].map((fen, i) => ({
        fen,
        eval: evals?.[i] ?? cp(20),
        pv: [],
        depth: 14,
        lines: [],
      })),
    }
  }

  const KINGS_KNIGHT: Opening = { eco: 'C40', name: "King's Knight Opening" }

  /** A small hand-made book with the positions after the first `plies` moves; ply 3 is named. */
  function bookFor(game: ImportedGame, plies: number): Map<string, Opening | null> {
    return new Map(
      game.moves.slice(0, plies).map((m, i) => [positionKey(m.fenAfter), i === 2 ? KINGS_KNIGHT : null] as const),
    )
  }

  it('marks the leading book moves and returns the opening', () => {
    const game = ruyLopez() // 10 plies
    const { reviews, opening } = classifyGame(game, flatAnalysis(game), { book: bookFor(game, 4) })
    expect(reviews.map((r) => r.cls)).toEqual([
      'book',
      'book',
      'book',
      'book',
      ...Array(game.moves.length - 4).fill('excellent'),
    ])
    expect(reviews.slice(0, 4).map((r) => r.accuracy)).toEqual([100, 100, 100, 100])
    expect(opening).toEqual(KINGS_KNIGHT)
  })

  it('has no book moves and no opening without a book', () => {
    const game = ruyLopez()
    const review = classifyGame(game, flatAnalysis(game))
    expect(review.reviews.some((r) => r.cls === 'book')).toBe(false)
    expect(review).not.toHaveProperty('opening')
  })

  it('stops the book at the first move that is not in it', () => {
    const game = ruyLopez()
    const book = bookFor(game, 4)
    book.delete(positionKey(game.moves[1].fenAfter))
    const { reviews } = classifyGame(game, flatAnalysis(game), { book })
    expect(reviews.slice(0, 4).map((r) => r.cls)).toEqual(['book', 'excellent', 'excellent', 'excellent'])
  })

  it('finds a miss right after the opponent blunders', () => {
    const full = ruyLopez()
    const game = { ...full, moves: full.moves.slice(0, 3) }
    // Ply 2 (Black) throws away about 29 win%; ply 3 (White) gives about 30 back.
    const { reviews } = classifyGame(game, flatAnalysis(game, [cp(20), cp(20), cp(400), cp(20)]))
    expect(reviews[1].cls).toBe('blunder')
    expect(reviews[2].cls).toBe('miss')
  })

  it('passes the engine lines to the move rules', () => {
    const full = ruyLopez()
    const game = { ...full, moves: full.moves.slice(0, 1) }
    const analysis = flatAnalysis(game, [cp(200), cp(200)])
    analysis.positions[0].bestMove = 'e2e4'
    analysis.positions[0].lines = [line('e2e4', cp(200)), line('d2d4', cp(-100))]
    expect(classifyGame(game, analysis).reviews[0].cls).toBe('great')
  })

  it("passes the next position's PV to the brilliant rule", () => {
    const game: ImportedGame = {
      ...ruyLopez(),
      startFen: PHILIDOR_FEN,
      moves: [{ ...philidor, moveNumber: 1, san: 'Qg8+', from: 'b3', to: 'g8', fenAfter: 'r5Qk/6pp/7N/8/8/8/6PP/6K1 b - - 1 1' }],
    }
    const analysis = flatAnalysis(game, [cp(150), cp(160)])
    analysis.positions[0].bestMove = 'b3g8'
    analysis.positions[1].pv = PHILIDOR_PV
    expect(classifyGame(game, analysis).reviews[0].cls).toBe('brilliant')
  })
})

describe('book moves that lose', () => {
  function analysisFor(game: ImportedGame, evals: Eval[], best: (string | undefined)[]): GameAnalysis {
    return {
      gameId: game.id,
      depth: 14,
      positions: evals.map((e, i) => ({
        fen: i === 0 ? game.startFen : game.moves[i - 1].fenAfter,
        eval: e,
        bestMove: best[i],
        pv: [],
        depth: 14,
        lines: [],
      })),
    }
  }

  it("does not hide Fool's mate behind Book, even though the whole line is in the real book", async () => {
    const parsed = parsePgn(TWO_GAMES)
    if (!parsed.ok) throw new Error(parsed.error)
    const game = parsed.games[1] // 1.f3 e5 2.g4?? Qh4#
    const book = await loadOpeningBook()
    expect(game.moves.every((m) => book.has(positionKey(m.fenAfter)))).toBe(true)
    const evals = [cp(20), cp(-60), cp(-50), mate(1, 'b'), mate(0, 'b')]
    const analysis = analysisFor(game, evals, ['e2e4', 'e7e5', 'e2e4', 'd8h4', undefined])
    const { reviews, opening } = classifyGame(game, analysis, { book })
    // 1.f3 loses about 7 (< BOOK_MAX_LOSS) and stays book; 2.g4?? is a blunder and ends the run.
    expect(reviews.map((r) => r.cls)).toEqual(['book', 'book', 'blunder', 'best'])
    expect(reviews[2].accuracy).toBeLessThan(100)
    // The opening comes from the book moves that count, not the trap line's name.
    expect(opening?.name).not.toMatch(/Fool's Mate/)
  })

  it('uses BOOK_MAX_LOSS as the cut-off', () => {
    expect(BOOK_MAX_LOSS).toBe(INACCURACY_MAX_LOSS)
    const below = classifyMove({ move: white, before: cp(30), after: cp(-30), bestMove: 'd2d4', inBook: true })
    expect(below.loss).toBeLessThan(BOOK_MAX_LOSS)
    expect(below.cls).toBe('book')
    const above = classifyMove({ move: white, before: cp(30), after: cp(-100), bestMove: 'd2d4', inBook: true })
    expect(above.loss).toBeGreaterThanOrEqual(BOOK_MAX_LOSS)
    expect(above.cls).toBe('mistake')
  })

  it('a losing book move ends the book run for the rest of the game', () => {
    const parsed = parsePgn(RUY_LOPEZ)
    if (!parsed.ok) throw new Error(parsed.error)
    const game = parsed.games[0]
    // Every position of the game is in this hand-made book.
    const book = new Map(game.moves.map((m) => [positionKey(m.fenAfter), null] as const))
    // Ply 3 (2.Nf3) is scored as a big loss; the evals stay flat afterwards.
    const evals = [cp(20), cp(20), cp(20), ...Array(game.moves.length - 2).fill(cp(-400))]
    const analysis = analysisFor(game, evals, Array(evals.length).fill(undefined))
    const { reviews } = classifyGame(game, analysis, { book })
    expect(reviews[2].cls).toBe('blunder')
    expect(reviews.slice(3).some((r) => r.cls === 'book')).toBe(false)
  })
})
