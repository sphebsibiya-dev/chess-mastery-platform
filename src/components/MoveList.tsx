import { useEffect, useRef } from 'react'
import type { ImportedMove } from '../import/types'
import type { MoveClass } from '../review/types'
import ClassificationBadge from './ClassificationBadge'

interface MoveListProps {
  moves: ImportedMove[]
  /** Current ply; 0 means the start position (no move highlighted). */
  ply: number
  onSelect: (ply: number) => void
  /** Classification per move, indexed by `ply - 1`. */
  classes?: readonly (MoveClass | undefined)[]
}

interface Row {
  moveNumber: number
  white?: ImportedMove
  black?: ImportedMove
}

function toRows(moves: ImportedMove[]): Row[] {
  const rows: Row[] = []
  for (const move of moves) {
    const last = rows[rows.length - 1]
    if (move.color === 'w' || !last || last.moveNumber !== move.moveNumber || last.black) {
      rows.push({ moveNumber: move.moveNumber })
    }
    const row = rows[rows.length - 1]
    if (move.color === 'w') row.white = move
    else row.black = move
  }
  return rows
}

export default function MoveList({ moves, ply, onSelect, classes }: MoveListProps) {
  const listRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const current = list.querySelector<HTMLElement>('[aria-current="true"]')
    if (current) {
      // Scroll only the list, not the page. The list is `position: relative`,
      // so offsetTop is measured from the list itself.
      const top = current.offsetTop
      const bottom = top + current.offsetHeight
      if (top < list.scrollTop) list.scrollTop = top
      else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight
    } else if (ply === 0) {
      list.scrollTop = 0
    }
  }, [ply])

  const cell = (move: ImportedMove | undefined) => {
    if (!move) return <span className="move move-empty">…</span>
    const cls = classes?.[move.ply - 1]
    return (
      <button
        type="button"
        className="move"
        aria-current={move.ply === ply ? 'true' : undefined}
        onClick={() => onSelect(move.ply)}
      >
        <span className="move-san">{move.san}</span>
        {cls && <ClassificationBadge cls={cls} />}
      </button>
    )
  }

  return (
    <ol className="move-list" ref={listRef} aria-label="Moves">
      {toRows(moves).map((row) => (
        <li key={`${row.moveNumber}-${row.white?.ply ?? row.black?.ply}`} className="move-row">
          <span className="move-number">{row.moveNumber}.</span>
          {cell(row.white)}
          {cell(row.black)}
        </li>
      ))}
    </ol>
  )
}
