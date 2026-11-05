import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import type { Arrow, ChessboardOptions } from 'react-chessboard'
import {
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
  /*
   * Code API (coach mode, engine). `color` defaults to green, not the user's swatch.
   * `key` is the position (FEN) the caller annotated and defaults to the current position;
   * calls for a position the board has since left are ignored.
   */
  toggleArrow(from: string, to: string, color?: DrawColor, key?: string): void
  toggleHighlight(square: string, color?: DrawColor, key?: string): void
  /** Replace all drawings for the position. */
  set(arrows: DrawnArrow[], highlights?: Record<string, DrawColor>, key?: string): void
  clear(): void
}

interface PendingDrag {
  key: string
  from: string
  color: DrawColor
}

const TAP_START_STYLE: CSSProperties = { boxShadow: 'inset 0 0 0 3px rgba(255, 255, 255, 0.85)' }

/** How long to wait for the contextmenu event that Windows fires after a right-button release. */
const CONTEXT_MENU_SUPPRESS_MS = 500

/**
 * Board annotations for the position identified by `positionKey` (a FEN).
 * Desktop: right-drag draws an arrow, right-click a square highlights it, modifiers pick the colour,
 * left click clears. Touch: in draw mode, tap a start square then a target (same square = highlight).
 * Drawings belong to one position and are dropped when the position changes.
 */
export function useBoardDrawing(positionKey: string): BoardDrawing {
  const [state, dispatch] = useReducer(drawingReducer, positionKey, emptyDrawing)
  const [drawMode, setDrawModeState] = useState(false)
  const [drawColor, setDrawColor] = useState<DrawColor>('green')
  const [tapStart, setTapStart] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingDrag | null>(null)
  const [over, setOver] = useState<string | null>(null)
  // Mirrors `pending` so event handlers always see the latest value.
  const pendingRef = useRef<PendingDrag | null>(null)
  // Latest position, so the stable code API defaults to the position on screen now.
  const positionRef = useRef(positionKey)
  const suppressMenuCleanup = useRef<(() => void) | null>(null)

  // Position changed: drop drawings and any half-finished input. Done during render (React's
  // "adjust state on prop change" pattern), so stale drawings never paint and never come back.
  const [seenKey, setSeenKey] = useState(positionKey)
  if (seenKey !== positionKey) {
    setSeenKey(positionKey)
    dispatch({ type: 'reset', key: positionKey })
    setPending(null)
    setOver(null)
    setTapStart(null)
  }

  useLayoutEffect(() => {
    positionRef.current = positionKey
    // A drag started on the previous position is void (also checked by key in the handlers).
    if (pendingRef.current && pendingRef.current.key !== positionKey) pendingRef.current = null
  }, [positionKey])

  const startDrag = useCallback((drag: PendingDrag | null) => {
    pendingRef.current = drag
    setPending(drag)
    setOver(null)
  }, [])

  // Windows fires `contextmenu` on the element under the cursor *after* the right-button release.
  // Squares already prevent it; this covers a drag released off the board.
  const suppressNextContextMenu = useCallback(() => {
    suppressMenuCleanup.current?.()
    const onMenu = (e: Event) => {
      e.preventDefault()
      cleanup()
    }
    const timer = window.setTimeout(() => cleanup(), CONTEXT_MENU_SUPPRESS_MS)
    function cleanup() {
      window.removeEventListener('contextmenu', onMenu, true)
      window.clearTimeout(timer)
      if (suppressMenuCleanup.current === cleanup) suppressMenuCleanup.current = null
    }
    window.addEventListener('contextmenu', onMenu, true)
    suppressMenuCleanup.current = cleanup
  }, [])

  useEffect(() => () => suppressMenuCleanup.current?.(), [])

  // While a right-drag is pending, cancel it if it can no longer finish on a square.
  useEffect(() => {
    if (!pending) return
    // React's root listener handles a release on a square first (and resets the ref),
    // so this only fires for releases elsewhere.
    const onUp = (e: MouseEvent) => {
      if (e.button !== 2 || !pendingRef.current) return
      startDrag(null)
      suppressNextContextMenu()
    }
    // The release was lost (focus change, a native menu swallowed it): the right button is up.
    const onMove = (e: MouseEvent) => {
      if ((e.buttons & 2) === 0 && pendingRef.current) startDrag(null)
    }
    const onBlur = () => startDrag(null)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('blur', onBlur)
    }
  }, [pending, startDrag, suppressNextContextMenu])

  const toggleArrow = useCallback(
    (from: string, to: string, color?: DrawColor, key: string = positionRef.current) =>
      dispatch(arrowAction(key, from, to, color)),
    [],
  )
  const toggleHighlight = useCallback(
    (square: string, color?: DrawColor, key: string = positionRef.current) =>
      dispatch(highlightAction(key, square, color)),
    [],
  )
  const set = useCallback(
    (arrows: DrawnArrow[], highlights?: Record<string, DrawColor>, key: string = positionRef.current) =>
      dispatch(setAction(key, arrows, highlights)),
    [],
  )
  const clear = useCallback(() => {
    dispatch({ type: 'clear' })
    setTapStart(null)
    startDrag(null)
  }, [startDrag])

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
        startDrag({ key: positionKey, from: square, color: colorFromModifiers(e) })
      },
      onMouseOverSquare: ({ square }) => {
        if (pendingRef.current?.key === positionKey) setOver(square)
      },
      onSquareMouseUp: ({ square }, e) => {
        const drag = pendingRef.current
        if (e.button !== 2 || !drag) return
        startDrag(null)
        if (drag.key !== positionKey) return
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
        if (!tapStart) {
          setTapStart(square)
          return
        }
        setTapStart(null)
        if (tapStart === square) {
          dispatch({ type: 'toggleHighlight', key: positionKey, square, color: drawColor })
        } else {
          dispatch({ type: 'toggleArrow', key: positionKey, from: tapStart, to: square, color: drawColor })
        }
      },
    }),
    [positionKey, drawMode, drawColor, tapStart, clear, startDrag],
  )

  // `visibleDrawing` guards the single render before the reset above is applied.
  const visible = visibleDrawing(state, positionKey)

  const arrows = useMemo(() => {
    const drawn = toArrows(visible)
    if (!pending || pending.key !== positionKey || !over || over === pending.from) return drawn
    const preview: Arrow = {
      startSquare: pending.from,
      endSquare: over,
      color: PREVIEW_ARROW_COLORS[pending.color],
    }
    return mergeArrows(drawn, [preview])
  }, [visible, pending, over, positionKey])

  const squareStyles = useMemo(() => {
    const styles = toSquareStyles(visible)
    if (!drawMode || !tapStart) return styles
    return mergeSquareStyles(styles, { [tapStart]: TAP_START_STYLE })
  }, [visible, drawMode, tapStart])

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
