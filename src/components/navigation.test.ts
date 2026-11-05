import { describe, expect, it } from 'vitest'
import { clampPly, navActionForKey, navReducer, type NavState } from './navigation'

describe('navActionForKey', () => {
  it('maps the viewer keys', () => {
    expect(navActionForKey('ArrowLeft')).toEqual({ type: 'prev' })
    expect(navActionForKey('ArrowRight')).toEqual({ type: 'next' })
    expect(navActionForKey('ArrowUp')).toEqual({ type: 'first' })
    expect(navActionForKey('ArrowDown')).toEqual({ type: 'last' })
    expect(navActionForKey('Home')).toEqual({ type: 'first' })
    expect(navActionForKey('End')).toEqual({ type: 'last' })
  })

  it('steps with Up/Down on a focused slider', () => {
    expect(navActionForKey('ArrowUp', true)).toEqual({ type: 'next' })
    expect(navActionForKey('ArrowDown', true)).toEqual({ type: 'prev' })
    expect(navActionForKey('ArrowLeft', true)).toEqual({ type: 'prev' })
    expect(navActionForKey('ArrowRight', true)).toEqual({ type: 'next' })
    expect(navActionForKey('Home', true)).toEqual({ type: 'first' })
    expect(navActionForKey('End', true)).toEqual({ type: 'last' })
  })

  it('ignores other keys', () => {
    expect(navActionForKey('a')).toBeUndefined()
    expect(navActionForKey('toString')).toBeUndefined()
    expect(navActionForKey('Enter', true)).toBeUndefined()
  })
})

const at = (ply: number, total = 10): NavState => ({ ply, total })

describe('navReducer', () => {
  it('steps forward and back', () => {
    expect(navReducer(at(3), { type: 'next' })).toEqual(at(4))
    expect(navReducer(at(3), { type: 'prev' })).toEqual(at(2))
  })

  it('does not go past the ends', () => {
    const end = at(10)
    expect(navReducer(end, { type: 'next' })).toBe(end)
    const start = at(0)
    expect(navReducer(start, { type: 'prev' })).toBe(start)
  })

  it('jumps to first and last', () => {
    expect(navReducer(at(5), { type: 'first' })).toEqual(at(0))
    expect(navReducer(at(5), { type: 'last' })).toEqual(at(10))
  })

  it('clamps goto', () => {
    expect(navReducer(at(5), { type: 'goto', ply: 7 })).toEqual(at(7))
    expect(navReducer(at(5), { type: 'goto', ply: 99 })).toEqual(at(10))
    expect(navReducer(at(5), { type: 'goto', ply: -1 })).toEqual(at(0))
  })

  it('is a no-op for a game with 0 moves', () => {
    const empty = at(0, 0)
    for (const action of [
      { type: 'first' },
      { type: 'prev' },
      { type: 'next' },
      { type: 'last' },
      { type: 'goto', ply: 3 },
    ] as const) {
      expect(navReducer(empty, action)).toBe(empty)
    }
  })
})

describe('clampPly', () => {
  it('clamps to [0, total]', () => {
    expect(clampPly(5, 10)).toBe(5)
    expect(clampPly(-3, 10)).toBe(0)
    expect(clampPly(11, 10)).toBe(10)
    expect(clampPly(2.7, 10)).toBe(2)
    expect(clampPly(Number.NaN, 10)).toBe(0)
    expect(clampPly(Infinity, 10)).toBe(10)
  })
})
