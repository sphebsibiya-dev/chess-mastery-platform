import { describe, expect, it } from 'vitest'
import { START_FEN } from '../chess/constants'
import {
  addMove,
  childId,
  findChildBySan,
  nodeAt,
  rootParentId,
  setNodeEval,
  type BranchMap,
} from './variationTree'

/** FEN after 1.e4 (Black to move), used as a branch-from position. */
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'

const empty = (): BranchMap => new Map()

describe('addMove', () => {
  it('creates a root branch for a move that deviates from the main line', () => {
    const res = addMove(empty(), 0, [], START_FEN, 'd2', 'd4')
    expect(res).not.toBeNull()
    const node = res!.node
    expect(node.san).toBe('d4')
    expect(node.lan).toBe('d2d4')
    expect(node.color).toBe('w')
    expect(node.moveNumber).toBe(1)
    expect(node.children).toEqual([])
    expect(res!.created).toBe(true)
    expect(res!.path).toEqual([childId(rootParentId(0), 'd2d4')])
    expect(res!.branches.get(0)).toHaveLength(1)
  })

  it('appends a continuation as a child of an existing node', () => {
    const first = addMove(empty(), 0, [], START_FEN, 'd2', 'd4')!
    const rootPath = first.path
    const second = addMove(first.branches, 0, rootPath, first.node.fenAfter, 'g8', 'f6')!
    expect(second.node.san).toBe('Nf6')
    // The root still has exactly one root entry, now with one child.
    expect(second.branches.get(0)).toHaveLength(1)
    const resolved = nodeAt(second.branches, 0, [...rootPath, second.node.id])
    expect(resolved?.san).toBe('Nf6')
    expect(nodeAt(second.branches, 0, rootPath)?.children).toHaveLength(1)
  })

  it('reuses an identical sibling instead of duplicating it', () => {
    const first = addMove(empty(), 0, [], START_FEN, 'd2', 'd4')!
    const again = addMove(first.branches, 0, [], START_FEN, 'd2', 'd4')!
    expect(again.created).toBe(false)
    expect(again.node.id).toBe(first.node.id)
    expect(again.branches.get(0)).toHaveLength(1)
  })

  it('keeps distinct sibling deviations separate', () => {
    const first = addMove(empty(), 0, [], START_FEN, 'd2', 'd4')!
    const second = addMove(first.branches, 0, [], START_FEN, 'c2', 'c4')!
    expect(second.created).toBe(true)
    expect(second.branches.get(0)).toHaveLength(2)
  })

  it('returns null for an illegal move and leaves the map unchanged', () => {
    const branches = empty()
    const res = addMove(branches, 0, [], START_FEN, 'e2', 'e5')
    expect(res).toBeNull()
    expect(branches.size).toBe(0)
  })

  it('returns null when the parent path does not exist', () => {
    const res = addMove(empty(), 0, ['b0:nope'], AFTER_E4, 'g8', 'f6')
    expect(res).toBeNull()
  })

  it('records the mover colour and move number from the position before the move', () => {
    const res = addMove(empty(), 1, [], AFTER_E4, 'c7', 'c5')!
    expect(res.node.color).toBe('b')
    expect(res.node.moveNumber).toBe(1)
    expect(res.node.san).toBe('c5')
  })

  it('does not mutate the input map', () => {
    const branches = empty()
    const res = addMove(branches, 0, [], START_FEN, 'd2', 'd4')!
    expect(branches.size).toBe(0)
    expect(res.branches.size).toBe(1)
  })
})

describe('nodeAt / findChildBySan', () => {
  it('returns undefined for an empty path or a missing id', () => {
    const { branches } = addMove(empty(), 0, [], START_FEN, 'd2', 'd4')!
    expect(nodeAt(branches, 0, [])).toBeUndefined()
    expect(nodeAt(branches, 0, ['missing'])).toBeUndefined()
    expect(nodeAt(branches, 9, ['anything'])).toBeUndefined()
  })

  it('finds a child by its SAN', () => {
    const { branches } = addMove(empty(), 0, [], START_FEN, 'd2', 'd4')!
    const roots = branches.get(0)!
    expect(findChildBySan(roots, 'd4')?.lan).toBe('d2d4')
    expect(findChildBySan(roots, 'Nf3')).toBeUndefined()
  })
})

describe('setNodeEval', () => {
  it('updates the eval fields of a node immutably', () => {
    const { branches, path } = addMove(empty(), 0, [], START_FEN, 'd2', 'd4')!
    const pending = setNodeEval(branches, 0, path, { evalPending: true })
    expect(nodeAt(pending, 0, path)?.evalPending).toBe(true)
    const resolved = setNodeEval(pending, 0, path, { eval: { kind: 'cp', cp: 30 }, evalPending: false })
    expect(nodeAt(resolved, 0, path)?.eval).toEqual({ kind: 'cp', cp: 30 })
    expect(nodeAt(resolved, 0, path)?.evalPending).toBe(false)
    // Original map untouched.
    expect(nodeAt(branches, 0, path)?.eval).toBeUndefined()
  })

  it('is a no-op when the node no longer exists', () => {
    const { branches } = addMove(empty(), 0, [], START_FEN, 'd2', 'd4')!
    expect(setNodeEval(branches, 0, ['gone'], { evalPending: true })).toBe(branches)
    expect(setNodeEval(branches, 7, ['x'], { evalPending: true })).toBe(branches)
  })
})
