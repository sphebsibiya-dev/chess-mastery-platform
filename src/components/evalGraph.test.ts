import { describe, expect, it } from 'vitest'
import { formatClockSeconds, formatSpent, graphLinePath, graphPath, plyFromX, plyX, wpY } from './evalGraph'

describe('plyFromX', () => {
  it.each([
    [0, 0],
    [300, 40],
    [151, 20],
    [-50, 0],
    [999, 40],
  ])('x=%d on a 300px graph of 40 plies -> %d', (x, ply) => {
    expect(plyFromX(x, 300, 40)).toBe(ply)
  })

  it('returns 0 for an empty game or a zero-width graph', () => {
    expect(plyFromX(100, 300, 0)).toBe(0)
    expect(plyFromX(100, 0, 40)).toBe(0)
    expect(plyFromX(Number.NaN, 300, 40)).toBe(0)
  })
})

describe('plyX / wpY', () => {
  it('scales ply over the whole game and flips win%', () => {
    expect(plyX(0, 40)).toBe(0)
    expect(plyX(20, 40)).toBe(50)
    expect(plyX(40, 40)).toBe(100)
    expect(plyX(1, 3)).toBe(33.33)
    expect(wpY(100)).toBe(0)
    expect(wpY(25)).toBe(75)
    expect(wpY(120)).toBe(0)
  })
})

describe('graphPath', () => {
  it('draws a closed area for a full game', () => {
    expect(graphPath([50, 75, 25], 2)).toBe('M0,100L0,50L50,25L100,75L100,100Z')
    expect(graphLinePath([50, 75, 25], 2)).toBe('M0,50L50,25L100,75')
  })

  it('draws only the analysed part while keeping the full x scale', () => {
    expect(graphLinePath([50, 60, 40], 4)).toBe('M0,50L25,40L50,60')
    expect(graphPath([50, 60, 40], 4)).toBe('M0,100L0,50L25,40L50,60L50,100Z')
  })

  it('is empty with nothing to draw', () => {
    expect(graphPath([50], 0)).toBe('')
    expect(graphPath([], 10)).toBe('')
    expect(graphPath([50], 10)).toBe('')
    expect(graphLinePath([50], 10)).toBe('')
  })

  it('ignores extra points beyond the game', () => {
    expect(graphLinePath([50, 50, 50, 50], 2)).toBe('M0,50L50,50L100,50')
  })
})

describe('formatClockSeconds', () => {
  it.each([
    [12, '0:12'],
    [9.9, '0:09'],
    [75, '1:15'],
    [600, '10:00'],
    [3725, '1:02:05'],
    [-3, '0:00'],
  ])('%d -> %s', (s, text) => {
    expect(formatClockSeconds(s)).toBe(text)
  })
})

describe('formatSpent', () => {
  it.each([
    [1, '1s'],
    [0.4, '0s'],
    [59.6, '1:00'],
    [75, '1:15'],
  ])('%d -> %s', (s, text) => {
    expect(formatSpent(s)).toBe(text)
  })
})
