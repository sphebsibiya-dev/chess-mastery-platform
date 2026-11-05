import type { MoveClass } from '../review/types'
import { CLASS_INFO } from './analysisView'
import type { AnalysisState } from './useGameAnalysis'

export type ReviewTab = 'summary' | 'analysis'

/**
 * Which tab the review side panel shows. Until analysis is done only Analysis
 * is available (progress, errors, retry). Once done, Summary is the default and
 * the user's own choice is kept after that.
 */
export function activeTab(status: AnalysisState['status'], chosen: ReviewTab | null): ReviewTab {
  if (status !== 'done') return 'analysis'
  return chosen ?? 'summary'
}

const PLURAL: Record<MoveClass, string> = {
  brilliant: 'brilliant moves',
  great: 'great moves',
  best: 'best moves',
  excellent: 'excellent moves',
  good: 'good moves',
  book: 'book moves',
  inaccuracy: 'inaccuracies',
  mistake: 'mistakes',
  miss: 'misses',
  blunder: 'blunders',
  forced: 'forced moves',
}

/** Accessible label for a summary count button: 'White: 2 mistakes, go to the first'. */
export function countButtonLabel(color: 'w' | 'b', cls: MoveClass, count: number): string {
  const side = color === 'w' ? 'White' : 'Black'
  const noun = count === 1 ? CLASS_INFO[cls].label.toLowerCase() : PLURAL[cls]
  return `${side}: ${count} ${noun}, go to the first`
}
