import type { CSSProperties } from 'react'
import type { Arrow } from 'react-chessboard'

// Pure state for user-drawn board annotations (arrows and square highlights).
// No React here: the hook in useBoardDrawing.ts wraps this reducer.

export type DrawColor = 'green' | 'red' | 'blue' | 'yellow'

export const DRAW_COLOR_ORDER: readonly DrawColor[] = ['green', 'red', 'blue', 'yellow']

/** Arrow colour per drawing colour. react-chessboard applies its own arrow opacity on top. */
export const DRAW_COLORS: Record<DrawColor, string> = {
  green: 'rgb(21, 120, 27)',
  red: 'rgb(214, 40, 40)',
  blue: 'rgb(36, 104, 214)',
  yellow: 'rgb(230, 180, 0)',
}

/** Square highlight background per drawing colour (translucent so pieces stay readable). */
export const HIGHLIGHT_COLORS: Record<DrawColor, string> = {
  green: 'rgba(21, 160, 40, 0.55)',
  red: 'rgba(235, 64, 52, 0.6)',
  blue: 'rgba(56, 132, 255, 0.55)',
  yellow: 'rgba(255, 200, 0, 0.55)',
}

export interface DrawnArrow {
  from: string
  to: string
  color: DrawColor
}

export interface DrawingState {
  /** The position (FEN) these drawings belong to. */
  key: string
  arrows: DrawnArrow[]
  /** square -> colour */
  highlights: Record<string, DrawColor>
}

export type DrawingAction =
  | { type: 'toggleArrow'; key: string; from: string; to: string; color: DrawColor }
  | { type: 'toggleHighlight'; key: string; square: string; color: DrawColor }
  | { type: 'set'; key: string; arrows: DrawnArrow[]; highlights: Record<string, DrawColor> }
  | { type: 'clear' }

export interface Modifiers {
  shiftKey: boolean
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
}

export function emptyDrawing(key: string): DrawingState {
  return { key, arrows: [], highlights: {} }
}

/** Shift = red, Ctrl/Cmd = blue, Alt = yellow, none = green. Precedence: Shift > Ctrl/Meta > Alt. */
export function colorFromModifiers(m: Modifiers): DrawColor {
  if (m.shiftKey) return 'red'
  if (m.ctrlKey || m.metaKey) return 'blue'
  if (m.altKey) return 'yellow'
  return 'green'
}

/** Drawings for another position are discarded before the action applies. */
function forKey(s: DrawingState, key: string): DrawingState {
  return s.key === key ? s : emptyDrawing(key)
}

export function drawingReducer(s: DrawingState, a: DrawingAction): DrawingState {
  switch (a.type) {
    case 'toggleArrow': {
      if (a.from === a.to) return s
      const base = forKey(s, a.key)
      const i = base.arrows.findIndex((x) => x.from === a.from && x.to === a.to)
      let arrows: DrawnArrow[]
      if (i === -1) {
        arrows = [...base.arrows, { from: a.from, to: a.to, color: a.color }]
      } else if (base.arrows[i].color === a.color) {
        arrows = base.arrows.filter((_, j) => j !== i)
      } else {
        arrows = base.arrows.map((x, j) => (j === i ? { ...x, color: a.color } : x))
      }
      return { ...base, arrows }
    }
    case 'toggleHighlight': {
      const base = forKey(s, a.key)
      const highlights = { ...base.highlights }
      if (highlights[a.square] === a.color) delete highlights[a.square]
      else highlights[a.square] = a.color
      return { ...base, highlights }
    }
    case 'set':
      return { key: a.key, arrows: [...a.arrows], highlights: { ...a.highlights } }
    case 'clear':
      if (s.arrows.length === 0 && Object.keys(s.highlights).length === 0) return s
      return emptyDrawing(s.key)
  }
}

/** What to show for the position `key`: nothing if the drawings belong to another position. */
export function visibleDrawing(s: DrawingState, key: string): DrawingState {
  return s.key === key ? s : emptyDrawing(key)
}

export function toArrows(s: DrawingState): Arrow[] {
  return s.arrows.map((a) => ({ startSquare: a.from, endSquare: a.to, color: DRAW_COLORS[a.color] }))
}

export function toSquareStyles(s: DrawingState): Record<string, CSSProperties> {
  const styles: Record<string, CSSProperties> = {}
  for (const [square, color] of Object.entries(s.highlights)) {
    styles[square] = { backgroundColor: HIGHLIGHT_COLORS[color] }
  }
  return styles
}

/** Combine arrow layers. Arrows with the same from-to are de-duplicated; the later layer wins. */
export function mergeArrows(...layers: Arrow[][]): Arrow[] {
  const byKey = new Map<string, Arrow>()
  for (const layer of layers) {
    for (const arrow of layer) {
      const k = `${arrow.startSquare}-${arrow.endSquare}`
      byKey.delete(k) // re-insert so a later layer also draws on top
      byKey.set(k, arrow)
    }
  }
  return [...byKey.values()]
}

/** Combine square-style layers. Styles for the same square are spread; later layers win per property. */
export function mergeSquareStyles(
  ...layers: Record<string, CSSProperties>[]
): Record<string, CSSProperties> {
  const out: Record<string, CSSProperties> = {}
  for (const layer of layers) {
    for (const [square, style] of Object.entries(layer)) {
      out[square] = { ...out[square], ...style }
    }
  }
  return out
}
