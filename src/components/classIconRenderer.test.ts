import { createElement, isValidElement, type CSSProperties, type ReactElement, type ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import ClassIcon from './ClassIcon'
import { makeClassIconRenderer } from './useClassIconRenderer'

const HIGHLIGHT: CSSProperties = { backgroundColor: 'rgba(255, 214, 10, 0.45)' }
const RING: CSSProperties = { boxShadow: 'inset 0 0 0 4px red' }
const styles = { e4: HIGHLIGHT, d5: RING }
const render = makeClassIconRenderer({ square: 'e4', cls: 'blunder' }, styles)

type SquareProps = { style: CSSProperties; children: ReactNode }

function square(sq: string, children: ReactNode = null): ReactElement<SquareProps> {
  return render({ piece: null, square: sq, children }) as ReactElement<SquareProps>
}

function icons(el: ReactElement<SquareProps>): ReactElement<{ cls: string }>[] {
  const kids = Array.isArray(el.props.children) ? el.props.children : [el.props.children]
  return kids.filter(
    (k: unknown): k is ReactElement<{ cls: string }> => isValidElement(k) && k.type === ClassIcon,
  )
}

describe('makeClassIconRenderer', () => {
  it('keeps the highlight on the icon square and adds the icon', () => {
    const el = square('e4')
    expect(el.props.style).toEqual({ width: '100%', height: '100%', backgroundColor: HIGHLIGHT.backgroundColor })
    const found = icons(el)
    expect(found).toHaveLength(1)
    expect(found[0].props.cls).toBe('blunder')
  })

  it('keeps drawing styles on other squares without an icon', () => {
    const el = square('d5')
    expect(el.props.style).toEqual({ width: '100%', height: '100%', boxShadow: RING.boxShadow })
    expect(icons(el)).toHaveLength(0)
  })

  it('renders a plain full-size square when it has no styles', () => {
    const el = square('a1')
    expect(el.props.style).toEqual({ width: '100%', height: '100%' })
    expect(icons(el)).toHaveLength(0)
  })

  it('passes the board children (the piece) through', () => {
    const piece = createElement('span', { 'data-piece': 'wP' })
    for (const sq of ['e4', 'a1']) {
      const el = square(sq, piece)
      const kids = Array.isArray(el.props.children) ? el.props.children : [el.props.children]
      expect(kids).toContain(piece)
    }
  })
})
