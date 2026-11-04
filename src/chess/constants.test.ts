import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { START_FEN } from './constants'

describe('START_FEN', () => {
  it('matches chess.js starting position', () => {
    expect(new Chess().fen()).toBe(START_FEN)
  })
})
