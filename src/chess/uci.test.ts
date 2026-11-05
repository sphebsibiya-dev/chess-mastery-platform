import { describe, expect, it } from 'vitest'
import { START_FEN } from './constants'
import { uciToSan, uciToSquares } from './uci'

describe('uciToSan', () => {
  it('converts normal moves', () => {
    expect(uciToSan(START_FEN, 'g1f3')).toBe('Nf3')
    expect(uciToSan(START_FEN, 'e2e4')).toBe('e4')
  })

  it('converts promotions with check', () => {
    expect(uciToSan('7k/4P3/8/8/8/8/8/K7 w - - 0 1', 'e7e8q')).toBe('e8=Q+')
  })

  it('converts castling', () => {
    expect(uciToSan('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'e1g1')).toBe('O-O')
    expect(uciToSan('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1', 'e8c8')).toBe('O-O-O')
  })

  it('returns undefined for illegal or malformed moves', () => {
    expect(uciToSan(START_FEN, 'e2e5')).toBeUndefined()
    expect(uciToSan(START_FEN, 'xyz')).toBeUndefined()
    expect(uciToSan(START_FEN, '(none)')).toBeUndefined()
  })
})

describe('uciToSquares', () => {
  it('splits squares and promotion', () => {
    expect(uciToSquares('e2e4')).toEqual({ from: 'e2', to: 'e4' })
    expect(uciToSquares('a7a8n')).toEqual({ from: 'a7', to: 'a8', promotion: 'n' })
    expect(uciToSquares('e9e4')).toBeUndefined()
  })
})
