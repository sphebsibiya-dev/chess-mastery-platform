import type { Eval } from '../engine/types'
import { applyFreeMove } from './freeMove'

/**
 * One move in a variation tree. A node is a move actually played in a branch,
 * plus the positions around it and any continuations played from it. The tree is
 * a pure data model layered *on top of* the recorded game's index-based main
 * line: the recorded game is never represented here, only deviations from it.
 */
export interface VariationNode {
  /** Stable id, derived from the parent id and the move's long algebraic. */
  id: string
  san: string
  lan: string
  from: string
  to: string
  /** Side that played this move (side to move in `fenBefore`). */
  color: 'w' | 'b'
  /** Full-move number this move belongs to (from `fenBefore`). */
  moveNumber: number
  fenBefore: string
  fenAfter: string
  /** Continuations played from this move; `children[0]` is the main continuation. */
  children: VariationNode[]
  /** Live Stockfish eval of `fenAfter`, White POV. Undefined until it resolves. */
  eval?: Eval
  /** True while an eval for this node is in flight. */
  evalPending?: boolean
}

/**
 * Variation roots keyed by the main-line *departure ply*: the number of recorded
 * half-moves applied before the branch's first move. A branch at departPly `D`
 * is an alternative to the recorded main move at ply `D + 1` (departPly 0 = an
 * alternative to White's first move; departPly = total = a continuation past the
 * end of the recorded game).
 */
export type BranchMap = Map<number, VariationNode[]>

/** The virtual parent id a departPly's root nodes hang from. */
export const rootParentId = (departPly: number): string => `b${departPly}`

/** A node's id: its parent's id joined with the move's long algebraic. */
export const childId = (parentId: string, lan: string): string => `${parentId}:${lan}`

function colorOf(fen: string): 'w' | 'b' {
  return fen.split(/\s+/)[1] === 'b' ? 'b' : 'w'
}

function moveNumberOf(fen: string): number {
  const n = Number(fen.split(/\s+/)[5])
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 1
}

/** The node at `path` (a list of ids from a departPly root down), or undefined. */
export function nodeAt(
  branches: BranchMap,
  departPly: number,
  path: readonly string[],
): VariationNode | undefined {
  if (path.length === 0) return undefined
  let siblings = branches.get(departPly)
  let node: VariationNode | undefined
  for (const id of path) {
    if (!siblings) return undefined
    node = siblings.find((n) => n.id === id)
    if (!node) return undefined
    siblings = node.children
  }
  return node
}

/** The child of `siblings` whose move SAN matches, or undefined. */
export function findChildBySan(
  siblings: readonly VariationNode[],
  san: string,
): VariationNode | undefined {
  return siblings.find((n) => n.san === san)
}

type InsertResult = { siblings: VariationNode[]; node: VariationNode; created: boolean }

function insert(
  siblings: readonly VariationNode[],
  parentPath: readonly string[],
  node: VariationNode,
): InsertResult | null {
  if (parentPath.length === 0) {
    const existing = siblings.find((n) => n.id === node.id)
    if (existing) return { siblings: [...siblings], node: existing, created: false }
    return { siblings: [...siblings, node], node, created: true }
  }
  const [head, ...rest] = parentPath
  const idx = siblings.findIndex((n) => n.id === head)
  if (idx === -1) return null
  const res = insert(siblings[idx].children, rest, node)
  if (!res) return null
  const copy = [...siblings]
  copy[idx] = { ...siblings[idx], children: res.siblings }
  return { siblings: copy, node: res.node, created: res.created }
}

export interface AddMoveResult {
  /** A new map with the move inserted (shares untouched subtrees). */
  branches: BranchMap
  /** The created-or-reused node. */
  node: VariationNode
  /** Path (ids) from the departPly root down to `node`. */
  path: string[]
  /** False when an identical sibling already existed and was reused. */
  created: boolean
}

/**
 * Applies one legal move from `fenBefore` and inserts it into the tree as a child
 * of the node at `parentPath` (empty = a new root at `departPly`). If an
 * identical sibling already exists it is reused (no duplicate), so replaying the
 * same deviation navigates back into the existing branch. Returns null for an
 * illegal move or a missing parent path; the recorded game is never touched.
 */
export function addMove(
  branches: BranchMap,
  departPly: number,
  parentPath: readonly string[],
  fenBefore: string,
  from: string,
  to: string,
  promotion: 'q' | 'r' | 'b' | 'n' = 'q',
): AddMoveResult | null {
  const move = applyFreeMove(fenBefore, from, to, promotion)
  if (!move) return null
  const parentId = parentPath.length ? parentPath[parentPath.length - 1] : rootParentId(departPly)
  const node: VariationNode = {
    id: childId(parentId, move.lan),
    san: move.san,
    lan: move.lan,
    from,
    to,
    color: colorOf(fenBefore),
    moveNumber: moveNumberOf(fenBefore),
    fenBefore,
    fenAfter: move.fen,
    children: [],
  }
  const res = insert(branches.get(departPly) ?? [], parentPath, node)
  if (!res) return null
  const next = new Map(branches)
  next.set(departPly, res.siblings)
  return { branches: next, node: res.node, path: [...parentPath, res.node.id], created: res.created }
}

function patchNode(
  siblings: readonly VariationNode[],
  path: readonly string[],
  patch: Partial<Pick<VariationNode, 'eval' | 'evalPending'>>,
): VariationNode[] | null {
  const [head, ...rest] = path
  const idx = siblings.findIndex((n) => n.id === head)
  if (idx === -1) return null
  const current = siblings[idx]
  let updated: VariationNode
  if (rest.length === 0) {
    updated = { ...current, ...patch }
  } else {
    const children = patchNode(current.children, rest, patch)
    if (!children) return null
    updated = { ...current, children }
  }
  const copy = [...siblings]
  copy[idx] = updated
  return copy
}

/**
 * Returns a new map with the eval fields of the node at `path` updated. If the
 * node no longer exists the original map is returned unchanged (a stale async
 * eval lands as a no-op).
 */
export function setNodeEval(
  branches: BranchMap,
  departPly: number,
  path: readonly string[],
  patch: Partial<Pick<VariationNode, 'eval' | 'evalPending'>>,
): BranchMap {
  const roots = branches.get(departPly)
  if (!roots) return branches
  const updated = patchNode(roots, path, patch)
  if (!updated) return branches
  const next = new Map(branches)
  next.set(departPly, updated)
  return next
}
