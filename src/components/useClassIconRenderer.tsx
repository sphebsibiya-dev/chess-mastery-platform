import { useMemo, type CSSProperties } from 'react'
import type { SquareRenderer } from 'react-chessboard'
import type { ClassIcon as ClassIconData } from './boardClassIcon'
import ClassIcon from './ClassIcon'

/**
 * A react-chessboard `squareRenderer` that adds the class icon to one square.
 *
 * When `squareRenderer` returns an element, react-chessboard no longer renders
 * its own inner `<div style={{ width, height, ...squareStyles[square] }}>`, so
 * this renderer re-applies the merged square styles on every square. Without
 * that, the last-move and drawing highlights would disappear.
 */
export function makeClassIconRenderer(
  icon: ClassIconData,
  squareStyles: Record<string, CSSProperties>,
): SquareRenderer {
  return function ClassIconSquare({ square, children }) {
    return (
      <div style={{ width: '100%', height: '100%', ...squareStyles[square] }}>
        {children}
        {square === icon.square && <ClassIcon cls={icon.cls} />}
      </div>
    )
  }
}

/** Undefined when there is no icon, so the board keeps its default square rendering. */
export function useClassIconRenderer(
  icon: ClassIconData | undefined,
  squareStyles: Record<string, CSSProperties>,
): SquareRenderer | undefined {
  const square = icon?.square
  const cls = icon?.cls
  return useMemo(
    () => (square && cls ? makeClassIconRenderer({ square, cls }, squareStyles) : undefined),
    [square, cls, squareStyles],
  )
}
