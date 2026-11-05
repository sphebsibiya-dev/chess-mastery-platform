import { describe, expect, it } from 'vitest'
import { activeTab } from './reviewTabs'

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
