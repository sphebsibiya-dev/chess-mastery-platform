import { describe, expect, it } from 'vitest'
import { initialOrientation } from './GameViewer'
import type { ImportedGame } from '../import/types'
import { START_FEN } from '../chess/constants'

function makeGame(userColor: 'w' | 'b' | undefined): ImportedGame {
  return {
    id: 'test-id',
    source: 'pgn',
    headers: { raw: {} },
    startFen: START_FEN,
    moves: [],
    pgn: '',
    ...(userColor !== undefined ? { userColor } : {}),
  }
}

describe('initialOrientation', () => {
  it('returns "black" when userColor is "b"', () => {
    expect(initialOrientation(makeGame('b'))).toBe('black')
  })

  it('returns "white" when userColor is "w"', () => {
    expect(initialOrientation(makeGame('w'))).toBe('white')
  })

  it('returns "white" when userColor is undefined (pasted PGN)', () => {
    expect(initialOrientation(makeGame(undefined))).toBe('white')
  })
})
