import { describe, expect, it } from 'vitest'
import { pvToLine } from './pvLine'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'

describe('pvToLine', () => {
  it('replays a known PV from the start position', () => {
    const line = pvToLine(START_FEN, ['e2e4', 'e7e5', 'g1f3'])
    expect(line).toHaveLength(3)
    expect(line[0].san).toBe('e4')
    expect(line[1].san).toBe('e5')
    expect(line[2].san).toBe('Nf3')
  })

  it('returns an empty array for an empty PV', () => {
    expect(pvToLine(START_FEN, [])).toEqual([])
  })

  it('stops at the first illegal move', () => {
    const line = pvToLine(START_FEN, ['e2e4', 'e7e7']) // e7e7 is illegal
    expect(line).toHaveLength(1)
    expect(line[0].san).toBe('e4')
  })

  it('stops at an unrecognised UCI token', () => {
    const line = pvToLine(START_FEN, ['e2e4', 'not-uci'])
    expect(line).toHaveLength(1)
  })

  it('handles pawn promotion in a PV', () => {
    // White pawn on a7, kings on a1 and h1
    const fen = '8/P7/8/8/8/8/8/K6k w - - 0 1'
    const line = pvToLine(fen, ['a7a8q'])
    expect(line).toHaveLength(1)
    // Promotion to queen; the queen on a8 gives check along the a-file
    expect(line[0].san).toBe('a8=Q+')
  })

  it('each step carries the resulting FEN', () => {
    const line = pvToLine(START_FEN, ['e2e4'])
    // After 1.e4 the pawn is on e4
    expect(line[0].fen).toContain('4P3')
  })

  it('the FEN of step N is a valid starting point for step N+1', () => {
    const line = pvToLine(START_FEN, ['e2e4', 'e7e5'])
    // Continuing from step 0's FEN should give the same step 1 as a full replay
    const sub = pvToLine(line[0].fen, ['e7e5'])
    expect(sub[0].san).toBe(line[1].san)
    expect(sub[0].fen).toBe(line[1].fen)
  })
})
