import { describe, expect, it } from 'vitest'
import { activeTab, countButtonLabel } from './reviewTabs'

describe('activeTab', () => {
  it('shows Analysis until the review is done', () => {
    expect(activeTab('running', null)).toBe('analysis')
    expect(activeTab('loading', null)).toBe('analysis')
    expect(activeTab('error', 'summary')).toBe('analysis')
  })

  it('defaults to Summary once done and keeps the user choice', () => {
    expect(activeTab('done', null)).toBe('summary')
    expect(activeTab('done', 'analysis')).toBe('analysis')
    expect(activeTab('done', 'summary')).toBe('summary')
  })
})

describe('countButtonLabel', () => {
  it('names the side, count and class', () => {
    expect(countButtonLabel('w', 'mistake', 2)).toBe('White: 2 mistakes, go to the first')
    expect(countButtonLabel('b', 'mistake', 1)).toBe('Black: 1 mistake, go to the first')
    expect(countButtonLabel('w', 'best', 1)).toBe('White: 1 best move, go to the first')
    expect(countButtonLabel('b', 'inaccuracy', 3)).toBe('Black: 3 inaccuracies, go to the first')
    expect(countButtonLabel('w', 'brilliant', 2)).toBe('White: 2 brilliant moves, go to the first')
  })
})
