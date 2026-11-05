import { describe, expect, it } from 'vitest'
import { START_FEN } from '../chess/constants'
import {
  DEFAULT_DRAW_COLOR,
  DRAW_COLORS,
  HIGHLIGHT_COLORS,
  PREVIEW_ARROW_COLORS,
  arrowAction,
  colorFromModifiers,
  drawingReducer,
  emptyDrawing,
  highlightAction,
  mergeArrows,
  mergeSquareStyles,
  setAction,
  toArrows,
  toSquareStyles,
  visibleDrawing,
  type DrawColor,
  type DrawingState,
  type Modifiers,
} from './drawing'

const FEN_A = START_FEN
const FEN_B = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1' // after 1.e4

const NO_KEYS: Modifiers = { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }
const keys = (m: Partial<Modifiers>): Modifiers => ({ ...NO_KEYS, ...m })

const arrow = (s: DrawingState, from: string, to: string, color: DrawColor = 'green', key = FEN_A) =>
  drawingReducer(s, { type: 'toggleArrow', key, from, to, color })
const highlight = (s: DrawingState, square: string, color: DrawColor = 'green', key = FEN_A) =>
  drawingReducer(s, { type: 'toggleHighlight', key, square, color })

const empty = emptyDrawing(FEN_A)

describe('colorFromModifiers', () => {
  it('maps modifier keys to colours', () => {
    expect(colorFromModifiers(NO_KEYS)).toBe('green')
    expect(colorFromModifiers(keys({ shiftKey: true }))).toBe('red')
    expect(colorFromModifiers(keys({ ctrlKey: true }))).toBe('blue')
    expect(colorFromModifiers(keys({ metaKey: true }))).toBe('blue')
    expect(colorFromModifiers(keys({ altKey: true }))).toBe('yellow')
  })

  it('applies precedence Shift > Ctrl/Meta > Alt', () => {
    expect(colorFromModifiers(keys({ shiftKey: true, ctrlKey: true }))).toBe('red')
    expect(colorFromModifiers(keys({ shiftKey: true, altKey: true }))).toBe('red')
    expect(colorFromModifiers(keys({ ctrlKey: true, altKey: true }))).toBe('blue')
    expect(colorFromModifiers(keys({ metaKey: true, altKey: true }))).toBe('blue')
  })
})

describe('drawingReducer: arrows', () => {
  it('adds an arrow', () => {
    const s = arrow(empty, 'e2', 'e4')
    expect(s.arrows).toEqual([{ from: 'e2', to: 'e4', color: 'green' }])
    expect(s.key).toBe(FEN_A)
  })

  it('removes an arrow drawn again in the same colour', () => {
    expect(arrow(arrow(empty, 'e2', 'e4'), 'e2', 'e4').arrows).toEqual([])
  })

  it('recolours an arrow drawn again in a different colour', () => {
    const s = arrow(arrow(empty, 'e2', 'e4', 'green'), 'e2', 'e4', 'red')
    expect(s.arrows).toEqual([{ from: 'e2', to: 'e4', color: 'red' }])
  })

  it('treats opposite directions as separate arrows', () => {
    const s = arrow(arrow(empty, 'e2', 'e4'), 'e4', 'e2')
    expect(s.arrows).toHaveLength(2)
  })

  it('keeps several arrows in drawing order', () => {
    const s = arrow(arrow(arrow(empty, 'e2', 'e4'), 'g1', 'f3', 'blue'), 'd2', 'd4', 'yellow')
    expect(s.arrows.map((a) => `${a.from}${a.to}`)).toEqual(['e2e4', 'g1f3', 'd2d4'])
  })

  it('ignores an arrow from a square to itself (same reference)', () => {
    const s = arrow(empty, 'e2', 'e4')
    expect(arrow(s, 'e4', 'e4')).toBe(s)
  })
})

describe('drawingReducer: highlights', () => {
  it('adds, removes and recolours a highlight', () => {
    const on = highlight(empty, 'd4')
    expect(on.highlights).toEqual({ d4: 'green' })
    expect(highlight(on, 'd4').highlights).toEqual({})
    expect(highlight(on, 'd4', 'red').highlights).toEqual({ d4: 'red' })
  })

  it('does not mutate the previous state', () => {
    const on = highlight(empty, 'd4')
    highlight(on, 'd4')
    expect(on.highlights).toEqual({ d4: 'green' })
  })

  it('keeps arrows and highlights independent', () => {
    const s = highlight(arrow(empty, 'e2', 'e4'), 'e4')
    expect(s.arrows).toEqual([{ from: 'e2', to: 'e4', color: 'green' }])
    expect(s.highlights).toEqual({ e4: 'green' })
  })
})

describe('drawingReducer: clear, set and position changes', () => {
  it('clear empties arrows and highlights but keeps the key', () => {
    const s = drawingReducer(highlight(arrow(empty, 'e2', 'e4'), 'd4'), { type: 'clear' })
    expect(s).toEqual(emptyDrawing(FEN_A))
  })

  it('clear on an already empty state returns the same reference', () => {
    expect(drawingReducer(empty, { type: 'clear' })).toBe(empty)
  })

  it('reset drops all drawings and moves to the new position', () => {
    const a = highlight(arrow(empty, 'e2', 'e4'), 'd4')
    expect(drawingReducer(a, { type: 'reset', key: FEN_B })).toEqual(emptyDrawing(FEN_B))
  })

  it('drawings do not come back after stepping away and back', () => {
    const drawn = highlight(arrow(empty, 'e2', 'e4'), 'd4')
    const away = drawingReducer(drawn, { type: 'reset', key: FEN_B })
    const back = drawingReducer(away, { type: 'reset', key: FEN_A })
    expect(back).toEqual(emptyDrawing(FEN_A))
    expect(visibleDrawing(back, FEN_A).arrows).toEqual([])
    expect(visibleDrawing(back, FEN_A).highlights).toEqual({})
  })

  it('reset to the same empty position returns the same reference', () => {
    expect(drawingReducer(empty, { type: 'reset', key: FEN_A })).toBe(empty)
  })

  it('ignores arrows and highlights for a position the board has left', () => {
    const a = highlight(arrow(empty, 'e2', 'e4'), 'd4')
    expect(arrow(a, 'e7', 'e5', 'red', FEN_B)).toBe(a)
    expect(highlight(a, 'e5', 'blue', FEN_B)).toBe(a)
  })

  it('set replaces everything for the current position', () => {
    const before = highlight(arrow(empty, 'e2', 'e4'), 'd4')
    const s = drawingReducer(before, {
      type: 'set',
      key: FEN_A,
      arrows: [{ from: 'g8', to: 'f6', color: 'blue' }],
      highlights: { f6: 'yellow' },
    })
    expect(s).toEqual({
      key: FEN_A,
      arrows: [{ from: 'g8', to: 'f6', color: 'blue' }],
      highlights: { f6: 'yellow' },
    })
  })

  it('a stale set (another position) does not wipe the current drawings', () => {
    const current = arrow(empty, 'e2', 'e4')
    const s = drawingReducer(current, setAction(FEN_B, [{ from: 'g8', to: 'f6', color: 'blue' }]))
    expect(s).toBe(current)
  })
})

describe('code API action builders', () => {
  it('default to green, not a user-picked colour', () => {
    expect(DEFAULT_DRAW_COLOR).toBe('green')
    expect(arrowAction(FEN_A, 'e2', 'e4')).toEqual({ type: 'toggleArrow', key: FEN_A, from: 'e2', to: 'e4', color: 'green' })
    expect(highlightAction(FEN_A, 'd4')).toEqual({ type: 'toggleHighlight', key: FEN_A, square: 'd4', color: 'green' })
  })

  it('use an explicit colour and position key', () => {
    expect(arrowAction(FEN_B, 'e7', 'e5', 'red')).toEqual({ type: 'toggleArrow', key: FEN_B, from: 'e7', to: 'e5', color: 'red' })
    expect(highlightAction(FEN_B, 'e5', 'blue')).toEqual({ type: 'toggleHighlight', key: FEN_B, square: 'e5', color: 'blue' })
  })

  it('setAction defaults highlights to none', () => {
    expect(setAction(FEN_A, [])).toEqual({ type: 'set', key: FEN_A, arrows: [], highlights: {} })
  })

  it('apply to the matching position and are ignored for another one', () => {
    const onA = drawingReducer(empty, arrowAction(FEN_A, 'e2', 'e4'))
    expect(onA.arrows).toEqual([{ from: 'e2', to: 'e4', color: 'green' }])
    expect(drawingReducer(onA, highlightAction(FEN_B, 'd4'))).toBe(onA)
  })
})

describe('visibleDrawing', () => {
  it('is empty for another position and the same state for its own position', () => {
    const s = arrow(empty, 'e2', 'e4')
    expect(visibleDrawing(s, FEN_B)).toEqual(emptyDrawing(FEN_B))
    expect(visibleDrawing(s, FEN_A)).toBe(s)
  })
})

describe('board conversion', () => {
  it('toArrows maps to react-chessboard arrows', () => {
    const s = arrow(arrow(empty, 'e2', 'e4'), 'g1', 'f3', 'red')
    expect(toArrows(s)).toEqual([
      { startSquare: 'e2', endSquare: 'e4', color: DRAW_COLORS.green },
      { startSquare: 'g1', endSquare: 'f3', color: DRAW_COLORS.red },
    ])
  })

  it('toSquareStyles gives one entry per highlighted square', () => {
    const s = highlight(highlight(empty, 'd4'), 'e5', 'blue')
    expect(toSquareStyles(s)).toEqual({
      d4: { backgroundColor: HIGHLIGHT_COLORS.green },
      e5: { backgroundColor: HIGHLIGHT_COLORS.blue },
    })
  })

  it('every drawing colour has an arrow, preview and highlight colour', () => {
    for (const c of ['green', 'red', 'blue', 'yellow'] as const) {
      expect(DRAW_COLORS[c]).toBeTruthy()
      expect(PREVIEW_ARROW_COLORS[c]).toBeTruthy()
      expect(HIGHLIGHT_COLORS[c]).toBeTruthy()
    }
  })

  it('the preview arrow colour differs from the finished arrow colour', () => {
    for (const c of ['green', 'red', 'blue', 'yellow'] as const) {
      expect(PREVIEW_ARROW_COLORS[c]).not.toBe(DRAW_COLORS[c])
    }
  })
})

describe('mergeArrows', () => {
  it('de-duplicates by from-to with the later layer winning', () => {
    const engine = { startSquare: 'e2', endSquare: 'e4', color: 'engine' }
    const user = { startSquare: 'e2', endSquare: 'e4', color: 'user' }
    expect(mergeArrows([engine], [user])).toEqual([user])
  })

  it('keeps separate arrows in order', () => {
    const a = { startSquare: 'e2', endSquare: 'e4', color: 'x' }
    const b = { startSquare: 'g1', endSquare: 'f3', color: 'y' }
    const c = { startSquare: 'e4', endSquare: 'e2', color: 'z' }
    expect(mergeArrows([a, b], [c])).toEqual([a, b, c])
  })

  it('handles no layers or empty layers', () => {
    expect(mergeArrows()).toEqual([])
    expect(mergeArrows([], [])).toEqual([])
  })
})

describe('mergeSquareStyles', () => {
  it('lets later layers win per square and keeps other squares', () => {
    const merged = mergeSquareStyles(
      { e4: { backgroundColor: 'A' }, e2: { backgroundColor: 'A' } },
      { e4: { backgroundColor: 'B' }, d4: { backgroundColor: 'C' } },
    )
    expect(merged).toEqual({
      e2: { backgroundColor: 'A' },
      e4: { backgroundColor: 'B' },
      d4: { backgroundColor: 'C' },
    })
  })

  it('spreads properties so a later layer can add without removing', () => {
    const merged = mergeSquareStyles(
      { e4: { backgroundColor: 'A' } },
      { e4: { boxShadow: 'inset 0 0 0 3px red' } },
    )
    expect(merged.e4).toEqual({ backgroundColor: 'A', boxShadow: 'inset 0 0 0 3px red' })
  })
})
