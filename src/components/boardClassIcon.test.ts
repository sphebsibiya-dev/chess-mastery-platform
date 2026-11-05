import { describe, expect, it } from 'vitest'
import { parseGame } from '../import/pgn'
import { CLASS_INFO } from './analysisView'
import { CLASS_COLORS, classIconFor } from './boardClassIcon'

describe('classIconFor', () => {
  it('has no icon at the start position', () => {
    expect(classIconFor(undefined, 'best')).toBeUndefined()
  })

  it('has no icon before the move is classified', () => {
    expect(classIconFor({ to: 'e4' }, undefined)).toBeUndefined()
  })

  it('puts the icon on the destination square', () => {
    expect(classIconFor({ to: 'e4' }, 'blunder')).toEqual({ square: 'e4', cls: 'blunder' })
  })

  it("uses the king's destination for castling", () => {
    const game = parseGame('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O *')
    const castle = game.moves[game.moves.length - 1]
    expect(castle.san).toBe('O-O')
    expect(classIconFor(castle, 'book')).toEqual({ square: 'g1', cls: 'book' })
  })
})

describe('CLASS_COLORS', () => {
  it('has a colour for every class', () => {
    expect(Object.keys(CLASS_COLORS).sort()).toEqual(Object.keys(CLASS_INFO).sort())
    expect(Object.keys(CLASS_COLORS)).toHaveLength(11)
  })

  it('uses six-digit hex backgrounds', () => {
    for (const { bg } of Object.values(CLASS_COLORS)) expect(bg).toMatch(/^#[0-9a-f]{6}$/)
  })
})
