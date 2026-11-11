import { useEffect, useRef } from 'react'
import type { ImportedMove } from '../import/types'
import type { MoveClass } from '../review/types'
import type { BranchMap, VariationNode } from '../review/variationTree'
import { formatEval, type TimeBadge } from './analysisView'
import ClassificationBadge from './ClassificationBadge'
import type { Cursor } from './treeNav'

interface MoveListProps {
  moves: ImportedMove[]
  /** Current ply; 0 means the start position (no move highlighted). */
  ply: number
  onSelect: (ply: number) => void
  /** Classification per move, indexed by `ply - 1`. */
  classes?: readonly (MoveClass | undefined)[]
  /** Time-trouble badge per move, indexed by `ply - 1`. Omit for games without clocks. */
  timeFlags?: readonly (TimeBadge | undefined)[]
  /** Variation branches keyed by main-line departure ply. */
  branches?: BranchMap
  /** Which position is active (main line or a branch node). */
  cursor?: Cursor
  /** Select a variation node (departPly + path of node ids). */
  onSelectNode?: (departPly: number, path: string[]) => void
}

interface Row {
  moveNumber: number
  white?: ImportedMove
  black?: ImportedMove
  /** Highest main-line ply shown in this row (used to anchor variations). */
  lastPly: number
}

function toRows(moves: ImportedMove[]): Row[] {
  const rows: Row[] = []
  for (const move of moves) {
    const last = rows[rows.length - 1]
    if (move.color === 'w' || !last || last.moveNumber !== move.moveNumber || last.black) {
      rows.push({ moveNumber: move.moveNumber, lastPly: move.ply })
    }
    const row = rows[rows.length - 1]
    if (move.color === 'w') row.white = move
    else row.black = move
    row.lastPly = move.ply
  }
  return rows
}

/** Path equality for the active-node check. */
function samePath(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, i) => id === b[i])
}

export default function MoveList({
  moves,
  ply,
  onSelect,
  classes,
  timeFlags,
  branches,
  cursor,
  onSelectNode,
}: MoveListProps) {
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
  }, [ply, cursor])

  const activeBranch = cursor?.kind === 'branch' ? cursor : undefined

  const cell = (move: ImportedMove | undefined) => {
    if (!move) return <span className="move move-empty">…</span>
    const cls = classes?.[move.ply - 1]
    const time = timeFlags?.[move.ply - 1]
    const onMain = (!cursor || cursor.kind === 'main') && move.ply === ply
    return (
      <button
        type="button"
        className="move"
        aria-current={onMain ? 'true' : undefined}
        onClick={() => onSelect(move.ply)}
      >
        <span className="move-san">{move.san}</span>
        {cls && <ClassificationBadge cls={cls} />}
        {time && (
          <span className={`time-badge time-${time.flag}`} role="img" aria-label={time.label} title={time.label}>
            {/* Stopwatch, forced to text presentation so it takes the badge colour. */}
            {'⏱︎'}
          </span>
        )}
      </button>
    )
  }

  /**
   * Renders one variation line: a node and its main continuation (its first
   * child) inline, with any alternative children nested as sub-variations.
   */
  const renderNode = (departPly: number, path: string[], node: VariationNode, showNumber: boolean) => {
    const nodePath = [...path, node.id]
    const isActive =
      activeBranch?.departPly === departPly && samePath(activeBranch.path, nodePath)
    // Number prefix: White always shows "12.", Black shows "12..." only when it
    // opens a line (previous move not shown inline on the same line).
    const prefix = node.color === 'w' ? `${node.moveNumber}.` : showNumber ? `${node.moveNumber}…` : ''
    const [mainChild, ...alts] = node.children
    return (
      <span key={node.id} className="var-move-group">
        <button
          type="button"
          className="move var-move"
          aria-current={isActive ? 'true' : undefined}
          onClick={() => onSelectNode?.(departPly, nodePath)}
        >
          {prefix && <span className="move-number var-number">{prefix}</span>}
          <span className="move-san">{node.san}</span>
          {node.evalPending ? (
            <span className="var-eval muted">…</span>
          ) : node.eval ? (
            <span className="var-eval muted">{formatEval(node.eval)}</span>
          ) : null}
        </button>
        {alts.map((alt) => (
          <span key={alt.id} className="variation variation-nested">
            ({renderNode(departPly, nodePath, alt, true)})
          </span>
        ))}
        {mainChild && renderNode(departPly, nodePath, mainChild, alts.length > 0)}
      </span>
    )
  }

  const renderVariations = (departPly: number) => {
    const roots = branches?.get(departPly)
    if (!roots || roots.length === 0) return null
    return (
      <div key={`var-${departPly}`} className="move-variations">
        {roots.map((root) => (
          <div key={root.id} className="variation">
            {renderNode(departPly, [], root, true)}
          </div>
        ))}
      </div>
    )
  }

  const rows = toRows(moves)
  const maxPly = moves.length
  // DepartPlies with branches that sit past the final recorded move (anchored to the last row).
  const trailingDepartPlies = branches
    ? [...branches.keys()].filter((d) => d + 1 > maxPly).sort((a, b) => a - b)
    : []

  return (
    <ol className="move-list" ref={listRef} aria-label="Moves">
      {rows.map((row) => (
        <li key={`${row.moveNumber}-${row.white?.ply ?? row.black?.ply}`} className="move-row-group">
          <div className="move-row">
            <span className="move-number">{row.moveNumber}.</span>
            {cell(row.white)}
            {cell(row.black)}
          </div>
          {/* A branch at departPly D is an alternative to main move D+1. */}
          {row.white && renderVariations(row.white.ply - 1)}
          {row.black && renderVariations(row.black.ply - 1)}
        </li>
      ))}
      {trailingDepartPlies.length > 0 && (
        <li className="move-row-group">{trailingDepartPlies.map((d) => renderVariations(d))}</li>
      )}
    </ol>
  )
}
