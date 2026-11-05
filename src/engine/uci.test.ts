import { describe, expect, it } from 'vitest'
import { parseBestMove, parseInfo } from './uci'

describe('parseInfo', () => {
  it('reads depth, cp score and pv', () => {
    expect(parseInfo('info depth 14 seldepth 20 multipv 1 score cp -35 nodes 1 pv e7e5 g1f3')).toEqual({
      depth: 14,
      score: { type: 'cp', value: -35 },
      pv: ['e7e5', 'g1f3'],
    })
  })

  it('reads mate scores', () => {
    expect(parseInfo('info depth 9 score mate -3 pv a1a2')?.score).toEqual({ type: 'mate', value: -3 })
    expect(parseInfo('info depth 0 score mate 0')).toEqual({ depth: 0, score: { type: 'mate', value: 0 }, pv: [] })
  })

  it('ignores bound-only scores', () => {
    expect(parseInfo('info depth 12 score cp 20 lowerbound nodes 5 pv e2e4')).toBeNull()
    expect(parseInfo('info depth 12 score cp 20 upperbound nodes 5 pv e2e4')).toBeNull()
  })

  it('ignores secondary multipv lines', () => {
    expect(parseInfo('info depth 10 multipv 2 score cp 5 pv d2d4')).toBeNull()
  })

  it('ignores info string, lines without a score, and other lines', () => {
    expect(parseInfo('info string NNUE evaluation using nn-61e7af4bb97d.nnue')).toBeNull()
    expect(parseInfo('info depth 5 currmove e2e4 currmovenumber 1')).toBeNull()
    expect(parseInfo('readyok')).toBeNull()
    expect(parseInfo('')).toBeNull()
  })

  it('parses lines recorded from Stockfish 19 lite', () => {
    const line =
      'info depth 10 seldepth 16 multipv 1 score cp -38 nodes 14111 nps 82040 hashfull 3 time 172 pv e7e6 b1c3 d7d5 d2d4 f8b4 e4e5 c7c5 g1f3 c5d4 d1d4 b4a5'
    const info = parseInfo(line)
    expect(info?.depth).toBe(10)
    expect(info?.score).toEqual({ type: 'cp', value: -38 })
    expect(info?.pv).toHaveLength(11)
    expect(info?.pv[0]).toBe('e7e6')
  })
})

describe('parseBestMove', () => {
  it('reads the best move and ignores ponder', () => {
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toEqual({ bestMove: 'e2e4' })
    expect(parseBestMove('bestmove e7e8q')).toEqual({ bestMove: 'e7e8q' })
  })

  it('gives undefined for (none)', () => {
    expect(parseBestMove('bestmove (none)')).toEqual({ bestMove: undefined })
  })

  it('returns null for other lines', () => {
    expect(parseBestMove('info depth 1 score cp 0')).toBeNull()
    expect(parseBestMove('uciok')).toBeNull()
  })
})
