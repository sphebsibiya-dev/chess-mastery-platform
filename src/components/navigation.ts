/** Pure navigation state for stepping through a game. `ply` 0 is the start position. */
export interface NavState {
  ply: number
  total: number
}

export type NavAction =
  | { type: 'first' }
  | { type: 'prev' }
  | { type: 'next' }
  | { type: 'last' }
  | { type: 'goto'; ply: number }
  | { type: 'reset'; total: number }

export function clampPly(ply: number, total: number): number {
  const max = Math.max(0, Math.floor(total))
  if (!Number.isFinite(ply)) return ply > 0 ? max : 0
  return Math.min(max, Math.max(0, Math.trunc(ply)))
}

export function navReducer(state: NavState, action: NavAction): NavState {
  let ply: number
  switch (action.type) {
    case 'first':
      ply = 0
      break
    case 'prev':
      ply = state.ply - 1
      break
    case 'next':
      ply = state.ply + 1
      break
    case 'last':
      ply = state.total
      break
    case 'goto':
      ply = action.ply
      break
    case 'reset':
      return { ply: 0, total: Math.max(0, action.total) }
  }
  const clamped = clampPly(ply, state.total)
  return clamped === state.ply ? state : { ...state, ply: clamped }
}
