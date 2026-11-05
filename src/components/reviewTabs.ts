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
