import { describe, expect, it } from 'vitest'
import { START_FEN } from '../chess/constants'
import { childId, rootParentId } from '../review/variationTree'
import {
  initialTreeState,
  navActionForKey,
  treeNavReducer,
  type TreeState,
} from './treeNav'

const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'
const D4_ROOT = childId(rootParentId(0), 'd2d4')

/** Recorded main line 1.e4 e5 → total 2 plies. */
const start = (): TreeState => initialTreeState(2)

/** Deviate with 1.d4 from the start position. */
function deviate(state: TreeState): TreeState {
  return treeNavReducer(state, { type: 'play', fenBefore: START_FEN, from: 'd2', to: 'd4' })
}

describe('treeNavReducer main-line pass-through', () => {
  it('routes plain nav keys to the plain reducer when on the main line', () => {
    const s1 = treeNavReducer(start(), { type: 'nav', action: { type: 'next' } })
    expect(s1.cursor).toEqual({ kind: 'main' })
    expect(s1.nav.ply).toBe(1)
    const s2 = treeNavReducer(s1, { type: 'nav', action: { type: 'last' } })
    expect(s2.nav.ply).toBe(2)
    const s3 = treeNavReducer(s2, { type: 'nav', action: { type: 'first' } })
    expect(s3.nav.ply).toBe(0)
  })

  it('advances the main line when the played move matches the recorded move', () => {
    const next = treeNavReducer(start(), {
      type: 'play',
      fenBefore: START_FEN,
      from: 'e2',
      to: 'e4',
      recordedNextLan: 'e2e4',
    })
    expect(next.cursor).toEqual({ kind: 'main' })
    expect(next.nav.ply).toBe(1)
    expect(next.branches.size).toBe(0)
  })

  it('selectMain keeps the cursor on the main line', () => {
    const s = treeNavReducer(start(), { type: 'selectMain', ply: 2 })
    expect(s.cursor).toEqual({ kind: 'main' })
    expect(s.nav.ply).toBe(2)
  })
})

describe('treeNavReducer branching', () => {
  it('opens a branch when a move deviates from the recorded move', () => {
    const s = treeNavReducer(start(), {
      type: 'play',
      fenBefore: START_FEN,
      from: 'd2',
      to: 'd4',
      recordedNextLan: 'e2e4',
    })
    expect(s.cursor).toEqual({ kind: 'branch', departPly: 0, path: [D4_ROOT] })
    expect(s.branches.get(0)).toHaveLength(1)
    // The recorded main line is untouched.
    expect(s.nav.ply).toBe(0)
  })

  it('appends further moves as children inside the branch', () => {
    const s1 = deviate(start())
    const s2 = treeNavReducer(s1, { type: 'play', fenBefore: AFTER_E4, from: 'g8', to: 'f6' })
    expect(s2.cursor.kind).toBe('branch')
    if (s2.cursor.kind === 'branch') {
      expect(s2.cursor.path).toEqual([D4_ROOT, childId(D4_ROOT, 'g8f6')])
    }
  })
})

describe('treeNavReducer branch navigation', () => {
  const twoDeep = (): TreeState => {
    const s1 = deviate(start())
    return treeNavReducer(s1, { type: 'play', fenBefore: AFTER_E4, from: 'g8', to: 'f6' })
  }

  it('prev from a branch root returns to the main line at the departure ply', () => {
    const s = treeNavReducer(deviate(start()), { type: 'nav', action: { type: 'prev' } })
    expect(s.cursor).toEqual({ kind: 'main' })
    expect(s.nav.ply).toBe(0)
  })

  it('prev from a deeper node steps to the parent node', () => {
    const s = treeNavReducer(twoDeep(), { type: 'nav', action: { type: 'prev' } })
    expect(s.cursor).toEqual({ kind: 'branch', departPly: 0, path: [D4_ROOT] })
  })

  it('first from any branch returns to the main start', () => {
    const s = treeNavReducer(twoDeep(), { type: 'nav', action: { type: 'first' } })
    expect(s.cursor).toEqual({ kind: 'main' })
    expect(s.nav.ply).toBe(0)
  })

  it('next steps into the first child, last descends to the leaf', () => {
    const deep = twoDeep()
    const root = treeNavReducer(deep, { type: 'nav', action: { type: 'first' } })
    // Re-enter the root node, then step forward into its child.
    const atRoot = treeNavReducer(root, { type: 'selectNode', departPly: 0, path: [D4_ROOT] })
    const intoChild = treeNavReducer(atRoot, { type: 'nav', action: { type: 'next' } })
    expect(intoChild.cursor).toEqual({
      kind: 'branch',
      departPly: 0,
      path: [D4_ROOT, childId(D4_ROOT, 'g8f6')],
    })
    const last = treeNavReducer(atRoot, { type: 'nav', action: { type: 'last' } })
    expect(last.cursor).toEqual(intoChild.cursor)
  })

  it('next at a leaf is a no-op', () => {
    const deep = twoDeep()
    const noop = treeNavReducer(deep, { type: 'nav', action: { type: 'next' } })
    expect(noop).toBe(deep)
  })

  it('goto while in a branch returns to the main line', () => {
    const s = treeNavReducer(deviate(start()), { type: 'nav', action: { type: 'goto', ply: 1 } })
    expect(s.cursor).toEqual({ kind: 'main' })
    expect(s.nav.ply).toBe(1)
  })
})

describe('treeNavReducer selectNode / setNodeEval', () => {
  it('selectNode activates an existing node and ignores a missing one', () => {
    const s = deviate(start())
    const selected = treeNavReducer(s, { type: 'selectNode', departPly: 0, path: [D4_ROOT] })
    expect(selected.cursor).toEqual({ kind: 'branch', departPly: 0, path: [D4_ROOT] })
    const unchanged = treeNavReducer(s, { type: 'selectNode', departPly: 0, path: ['nope'] })
    expect(unchanged).toBe(s)
  })

  it('setNodeEval stores a live eval on the node', () => {
    const s = deviate(start())
    const withEval = treeNavReducer(s, {
      type: 'setNodeEval',
      departPly: 0,
      path: [D4_ROOT],
      eval: { kind: 'cp', cp: 20 },
      evalPending: false,
    })
    expect(withEval.branches.get(0)![0].eval).toEqual({ kind: 'cp', cp: 20 })
  })
})

describe('navActionForKey re-export', () => {
  it('is re-exported from treeNav', () => {
    expect(navActionForKey('ArrowRight')).toEqual({ type: 'next' })
  })
})
