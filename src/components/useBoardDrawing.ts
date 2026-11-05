import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from 'react'
import type { Arrow, ChessboardOptions } from 'react-chessboard'
import {
  DRAW_COLORS,
  colorFromModifiers,
  drawingReducer,
  emptyDrawing,
  mergeArrows,
  mergeSquareStyles,
  toArrows,
  toSquareStyles,
  visibleDrawing,
  type DrawColor,
  type DrawnArrow,
} from './drawing'

type DrawingBoardOptions = Pick<
  ChessboardOptions,
  | 'allowDrawingArrows'
  | 'clearArrowsOnClick'
  | 'onSquareMouseDown'
  | 'onSquareMouseUp'
  | 'onMouseOverSquare'
  | 'onSquareClick'
>

export interface BoardDrawing {
  /** User arrows plus the live preview while right-dragging. */
  arrows: Arrow[]
  /** Highlights plus the pending tap-start outline in draw mode. */
  squareStyles: Record<string, CSSProperties>
  /** Spread into the Chessboard `options`. */
  boardOptions: DrawingBoardOptions
  drawMode: boolean
  setDrawMode(on: boolean): void
  drawColor: DrawColor
  setDrawColor(c: DrawColor): void
  hasDrawings: boolean
  toggleArrow(from: string, to: string, color?: DrawColor): void
  toggleHighlight(square: string, color?: DrawColor): void
  /** Replace all drawings for the current position (coach mode drives this). */
  set(arrows: DrawnArrow[], highlights?: Record<string, DrawColor>): void
  clear(): void
}

interface PendingDrag {
  from: string
  color: DrawColor
}

const TAP_START_STYLE: CSSProperties = { boxShadow: 'inset 0 0 0 3px rgba(255, 255, 255, 0.85)' }

/**
 * Board annotations for the position identified by `positionKey` (a FEN).
 * Desktop: right-drag draws an arrow, right-click a square highlights it, modifiers pick the colour,
 * left click clears. Touch: in draw mode, tap a start square then a target (same square = highlight).
 * Drawings belong to one position and disappear when the position changes.
 */
export function useBoardDrawing(positionKey: string): BoardDrawing {
  const [state, dispatch] = useReducer(drawingReducer, positionKey, emptyDrawing)
  const [drawMode, setDrawModeState] = useState(false)
  const [drawColor, setDrawColor] = useState<DrawColor>('green')
  const [tapStart, setTapStart] = useState<{ key: string; square: string } | null>(null)
  const [pending, setPending] = useState<PendingDrag | null>(null)
  const [over, setOver] = useState<string | null>(null)
  // Mirrors `pending` so event handlers always see the latest value.
  const pendingRef = useRef<PendingDrag | null>(null)

  const startDrag = useCallback((drag: PendingDrag | null) => {
    pendingRef.current = drag
    setPending(drag)
    setOver(null)
  }, [])

  // Cancel a right-drag released off the board. React's root listener handles a release on a
  // square first (and resets the ref), so this only fires for releases elsewhere.
  useEffect(() => {
    if (!pending) return
    const onUp = (e: MouseEvent) => {
      if (e.button === 2 && pendingRef.current) startDrag(null)
    }
    window.addEventListener('mouseup', onUp)
    return () => window.removeEventListener('mouseup', onUp)
  }, [pending, startDrag])

  const toggleArrow = useCallback(
    (from: string, to: string, color: DrawColor = drawColor) =>
      dispatch({ type: 'toggleArrow', key: positionKey, from, to, color }),
    [positionKey, drawColor],
  )
  const toggleHighlight = useCallback(
    (square: string, color: DrawColor = drawColor) =>
      dispatch({ type: 'toggleHighlight', key: positionKey, square, color }),
    [positionKey, drawColor],
  )
  const set = useCallback(
    (arrows: DrawnArrow[], highlights: Record<string, DrawColor> = {}) =>
      dispatch({ type: 'set', key: positionKey, arrows, highlights }),
    [positionKey],
  )
  const clear = useCallback(() => {
    dispatch({ type: 'clear' })
    setTapStart(null)
  }, [])

  const setDrawMode = useCallback((on: boolean) => {
    setDrawModeState(on)
    setTapStart(null)
  }, [])

  const boardOptions = useMemo<DrawingBoardOptions>(
    () => ({
      // The board's built-in arrows keep internal state we can't drive; we own all drawing state.
      allowDrawingArrows: false,
      clearArrowsOnClick: false,
      onSquareMouseDown: ({ square }, e) => {
        if (e.button !== 2) return
        startDrag({ from: square, color: colorFromModifiers(e) })
      },
      onMouseOverSquare: ({ square }) => {
        if (pendingRef.current) setOver(square)
      },
      onSquareMouseUp: ({ square }, e) => {
        const drag = pendingRef.current
        if (e.button !== 2 || !drag) return
        startDrag(null)
        if (drag.from === square) {
          dispatch({ type: 'toggleHighlight', key: positionKey, square, color: drag.color })
        } else {
          dispatch({ type: 'toggleArrow', key: positionKey, from: drag.from, to: square, color: drag.color })
        }
      },
      onSquareClick: ({ square }) => {
        if (!drawMode) {
          clear()
          return
        }
        const start = tapStart && tapStart.key === positionKey ? tapStart.square : null
        if (!start) {
          setTapStart({ key: positionKey, square })
          return
        }
        setTapStart(null)
        if (start === square) {
          dispatch({ type: 'toggleHighlight', key: positionKey, square, color: drawColor })
        } else {
          dispatch({ type: 'toggleArrow', key: positionKey, from: start, to: square, color: drawColor })
        }
      },
    }),
    [positionKey, drawMode, drawColor, tapStart, clear, startDrag],
  )

  const visible = visibleDrawing(state, positionKey)

  const arrows = useMemo(() => {
    const drawn = toArrows(visible)
    if (!pending || !over || over === pending.from) return drawn
    const preview: Arrow = { startSquare: pending.from, endSquare: over, color: DRAW_COLORS[pending.color] }
    return mergeArrows(drawn, [preview])
  }, [visible, pending, over])

  const squareStyles = useMemo(() => {
    const styles = toSquareStyles(visible)
    if (!drawMode || !tapStart || tapStart.key !== positionKey) return styles
    return mergeSquareStyles(styles, { [tapStart.square]: TAP_START_STYLE })
  }, [visible, drawMode, tapStart, positionKey])

  return {
    arrows,
    squareStyles,
    boardOptions,
    drawMode,
    setDrawMode,
    drawColor,
    setDrawColor,
    hasDrawings: visible.arrows.length > 0 || Object.keys(visible.highlights).length > 0,
    toggleArrow,
    toggleHighlight,
    set,
    clear,
  }
}
