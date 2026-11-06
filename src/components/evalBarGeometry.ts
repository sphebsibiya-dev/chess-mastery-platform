import type { Eval } from '../engine/types'
import { winPercent } from '../review/winProbability'
import { formatEval } from './analysisView'

/** What the eval bar draws for one position. */
export interface EvalBarView {
  /** No eval for this position yet (analysis loading or not reached). */
  pending: boolean
  /** 0..100: share of the bar filled white. */
  whiteShare: number
  /** '1.2', '12', 'M3', '1-0', '0-1', '½-½'; '' when pending. */
  label: string
  /** The label sits at this side's end of the bar, which shows who is better. */
  labelSide: 'w' | 'b'
  /** 'Evaluation +1.20' or 'Evaluation pending'. */
  ariaText: string
}

/** Centipawn evals are clamped to this range so the losing side stays visible. */
export const BAR_MIN = 5
export const BAR_MAX = 95

/** Short unsigned label: the side it sits on shows who is better. */
export function barLabel(e: Eval): string {
  switch (e.kind) {
    case 'draw':
      return '½-½'
    case 'mate':
      if (e.in === 0) return e.winner === 'w' ? '1-0' : '0-1'
      return `M${e.in}`
    case 'cp': {
      const tenths = Math.round(Math.abs(e.cp) / 10)
      return tenths < 100 ? (tenths / 10).toFixed(1) : String(Math.round(tenths / 10))
    }
  }
}

function whiteShare(e: Eval): number {
  switch (e.kind) {
    case 'draw':
      return 50
    case 'mate':
      return e.winner === 'w' ? 100 : 0
    case 'cp':
      return Math.max(BAR_MIN, Math.min(BAR_MAX, winPercent(e)))
  }
}

function labelSide(e: Eval): 'w' | 'b' {
  switch (e.kind) {
    case 'draw':
      return 'w'
    case 'mate':
      return e.winner
    case 'cp':
      return e.cp >= 0 ? 'w' : 'b'
  }
}

export function evalBarView(e: Eval | undefined): EvalBarView {
  if (!e) return { pending: true, whiteShare: 50, label: '', labelSide: 'w', ariaText: 'Evaluation pending' }
  return {
    pending: false,
    whiteShare: whiteShare(e),
    label: barLabel(e),
    labelSide: labelSide(e),
    ariaText: `Evaluation ${formatEval(e)}`,
  }
}
