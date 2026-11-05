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

const KEY_ACTIONS: Record<string, NavAction> = {
  ArrowLeft: { type: 'prev' },
  ArrowRight: { type: 'next' },
  ArrowUp: { type: 'first' },
  ArrowDown: { type: 'last' },
  Home: { type: 'first' },
  End: { type: 'last' },
}

/** On a focused slider (the eval graph) Up/Down step one ply, as ARIA sliders do. */
const SLIDER_KEY_ACTIONS: Record<string, NavAction> = {
  ...KEY_ACTIONS,
  ArrowUp: { type: 'next' },
  ArrowDown: { type: 'prev' },
}

/**
 * Navigation action for a key press, or undefined if the key is not used.
 * `onSlider` is true when focus is on a `role="slider"` element.
 */
export function navActionForKey(key: string, onSlider = false): NavAction | undefined {
  const map = onSlider ? SLIDER_KEY_ACTIONS : KEY_ACTIONS
  return Object.hasOwn(map, key) ? map[key] : undefined
}

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
  }
  const clamped = clampPly(ply, state.total)
  return clamped === state.ply ? state : { ...state, ply: clamped }
}
