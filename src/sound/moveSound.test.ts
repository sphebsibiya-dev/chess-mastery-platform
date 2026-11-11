import { describe, expect, it } from 'vitest'
import { moveSoundKind } from './moveSound'

describe('move sound classification', () => {
  it('prioritizes check', () => expect(moveSoundKind({ flags: 'c' }, true)).toBe('check'))
  it('recognizes captures and en passant', () => {
    expect(moveSoundKind({ flags: 'c' }, false)).toBe('capture')
    expect(moveSoundKind({ flags: 'e' }, false)).toBe('capture')
  })
  it('recognizes castling', () => expect(moveSoundKind({ flags: 'k' }, false)).toBe('castle'))
  it('falls back to a plain move', () => expect(moveSoundKind({ flags: 'n' }, false)).toBe('move'))
})
