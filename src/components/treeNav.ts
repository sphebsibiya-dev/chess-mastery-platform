import type { Eval } from '../engine/types'
import { applyFreeMove } from '../review/freeMove'
import { addMove, nodeAt, setNodeEval, type BranchMap } from '../review/variationTree'
import { navActionForKey, navReducer, type NavAction, type NavState } from './navigation'

export { navActionForKey }

/**
 * Where the viewer currently is. `main` defers entirely to `NavState.ply` (the
 * recorded game's index-based main line, exactly as before). `branch` points at a
 * node in the variation tree: `departPly` picks the root set, `path` the node.
 */
export type Cursor =
  | { kind: 'main' }
  | { kind: 'branch'; departPly: number; path: string[] }

export interface TreeState {
  /** Recorded main-line position. Untouched when a branch cursor is active. */
  nav: NavState
  cursor: Cursor
  branches: BranchMap
}

export type TreeAction =
  /** A plain main-line navigation key/button, routed by the current cursor. */
  | { type: 'nav'; action: NavAction }
  /** Jump to a main-line ply (move-list click, graph slider). */
  | { type: 'selectMain'; ply: number }
  /** Select an existing variation node. */
  | { type: 'selectNode'; departPly: number; path: string[] }
  /** Play a move from the current board position, creating/entering a branch. */
  | {
      type: 'play'
      fenBefore: string
      from: string
      to: string
      promotion?: 'q' | 'r' | 'b' | 'n'
      /** Long algebraic of the recorded next main move, if any, for match detection. */
      recordedNextLan?: string
    }
  /** Store a live eval on a variation node. */
  | { type: 'setNodeEval'; departPly: number; path: string[]; eval?: Eval; evalPending?: boolean }

export function initialTreeState(total: number): TreeState {
  return { nav: { ply: 0, total }, cursor: { kind: 'main' }, branches: new Map() }
}

function toMain(state: TreeState, ply: number): TreeState {
  const nav = navReducer(state.nav, { type: 'goto', ply })
  if (nav === state.nav && state.cursor.kind === 'main') return state
  return { ...state, nav, cursor: { kind: 'main' } }
}

function navigate(state: TreeState, action: NavAction): TreeState {
  // On the main line every key is identical to the plain nav reducer.
  if (state.cursor.kind === 'main') {
    const nav = navReducer(state.nav, action)
    return nav === state.nav ? state : { ...state, nav }
  }
  const { departPly, path } = state.cursor
  switch (action.type) {
    case 'goto':
      return toMain(state, action.ply)
    case 'first':
      return toMain(state, 0)
    case 'prev':
      // Deeper than a root → step to the parent node; at a root → back to main.
      if (path.length > 1) {
        return { ...state, cursor: { kind: 'branch', departPly, path: path.slice(0, -1) } }
      }
      return toMain(state, departPly)
    case 'next': {
      const child = nodeAt(state.branches, departPly, path)?.children[0]
      if (!child) return state
      return { ...state, cursor: { kind: 'branch', departPly, path: [...path, child.id] } }
    }
    case 'last': {
      let node = nodeAt(state.branches, departPly, path)
      if (!node) return state
      const newPath = [...path]
      while (node.children[0]) {
        node = node.children[0]
        newPath.push(node.id)
      }
      return newPath.length === path.length
        ? state
        : { ...state, cursor: { kind: 'branch', departPly, path: newPath } }
    }
  }
}

function play(
  state: TreeState,
  action: Extract<TreeAction, { type: 'play' }>,
): TreeState {
  const { fenBefore, from, to, promotion, recordedNextLan } = action
  const move = applyFreeMove(fenBefore, from, to, promotion)
  if (!move) return state
  const onMain = state.cursor.kind === 'main'
  // On the main line, replaying the recorded move just advances the main line.
  if (onMain && recordedNextLan !== undefined && move.lan === recordedNextLan) {
    const nav = navReducer(state.nav, { type: 'next' })
    return nav === state.nav ? state : { ...state, nav }
  }
  const departPly = state.cursor.kind === 'branch' ? state.cursor.departPly : state.nav.ply
  const parentPath = state.cursor.kind === 'branch' ? state.cursor.path : []
  const res = addMove(state.branches, departPly, parentPath, fenBefore, from, to, promotion)
  if (!res) return state
  return { ...state, branches: res.branches, cursor: { kind: 'branch', departPly, path: res.path } }
}

export function treeNavReducer(state: TreeState, action: TreeAction): TreeState {
  switch (action.type) {
    case 'nav':
      return navigate(state, action.action)
    case 'selectMain':
      return toMain(state, action.ply)
    case 'selectNode': {
      if (!nodeAt(state.branches, action.departPly, action.path)) return state
      return { ...state, cursor: { kind: 'branch', departPly: action.departPly, path: action.path } }
    }
    case 'play':
      return play(state, action)
    case 'setNodeEval': {
      const branches = setNodeEval(state.branches, action.departPly, action.path, {
        eval: action.eval,
        evalPending: action.evalPending,
      })
      return branches === state.branches ? state : { ...state, branches }
    }
  }
}
