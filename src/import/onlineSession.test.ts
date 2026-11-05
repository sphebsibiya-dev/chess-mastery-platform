import { describe, expect, it } from 'vitest'
import { PAGE_SIZE, createLichessSource, lichessExportUrl } from './lichess'
import { LICHESS_ABORTED, LICHESS_WIN, toNdjson } from './lichessFixtures'
import { LIST_CHUNK, emptySession, listHeading, mergePage, type OnlineSession } from './onlineSession'
import { fakeFetch } from './testFakes'
import type { FetchPage, GameSummary, TimeClass } from './types'

const START = { source: 'lichess' as const, username: 'thibault' }

function summary(id: string, timeClass: TimeClass = 'blitz'): GameSummary {
  return {
    id,
    source: 'lichess',
    url: '',
    pgn: '',
    userColor: 'w',
    opponent: 'x',
    result: '1-0',
    outcome: 'win',
    timeClass,
    timeControl: '3+0',
    endedAt: 0,
    rated: true,
  }
}

function page(ids: string[], extra: Partial<FetchPage> = {}): FetchPage {
  return { games: ids.map((id) => summary(id)), skipped: 0, hasMore: true, cursor: 'c1', ...extra }
}

describe('mergePage', () => {
  it('starts a new list', () => {
    expect(mergePage(undefined, page(['a', 'b'], { skipped: 2 }), START)).toEqual({
      ...emptySession('lichess', 'thibault'),
      games: [summary('a'), summary('b')],
      hasMore: true,
      cursor: 'c1',
      skipped: 2,
      visible: LIST_CHUNK,
    })
  })

  it('appends older games, dropping ones already listed', () => {
    const first = mergePage(undefined, page(['a', 'b']), START)
    const next = mergePage(first, page(['b', 'c'], { cursor: 'c2' }), START)
    expect(next.games.map((g) => g.id)).toEqual(['a', 'b', 'c'])
    expect(next.cursor).toBe('c2')
    expect(next.hasMore).toBe(true)
  })

  it('stops when an older page adds no new games', () => {
    const first = mergePage(undefined, page(['a', 'b']), START)
    const next = mergePage(first, page(['b'], { cursor: 'c2' }), START)
    expect(next.hasMore).toBe(false)
    expect(next.cursor).toBeUndefined()
  })

  it('keeps going past a page of only skipped rows if the cursor moved', () => {
    const first = mergePage(undefined, page(['a']), START)
    expect(mergePage(first, page([], { skipped: 50, cursor: 'c2' }), START).hasMore).toBe(true)
    expect(mergePage(first, page([], { skipped: 50, cursor: 'c1' }), START).hasMore).toBe(false)
  })

  it('stops when the source says there is nothing more', () => {
    expect(mergePage(undefined, page(['a'], { hasMore: false, cursor: undefined }), START).hasMore).toBe(false)
  })

  it('keeps the filter, and grows the visible window so new rows show', () => {
    const many = Array.from({ length: 250 }, (_, i) => `g${i}`)
    const first: OnlineSession = { ...mergePage(undefined, page(many), START), filter: 'blitz' }
    expect(first.visible).toBe(LIST_CHUNK)
    const next = mergePage(first, page(['older'], { cursor: 'c2' }), START)
    expect(next.filter).toBe('blitz')
    expect(next.visible).toBe(250 + LIST_CHUNK)
  })
})

describe('Lichess paging across a shared createdAt', () => {
  it('lists both games that share the boundary timestamp, once each', async () => {
    const T = 1793000000000 - (PAGE_SIZE - 1) * 1000
    const game = (id: string, createdAt: number) => ({ ...LICHESS_WIN, id, createdAt, lastMoveAt: createdAt + 500 })
    // Page 1: 50 games, the last created at T. Another game ("Twin0002") was also created at T.
    const page1 = Array.from({ length: PAGE_SIZE - 1 }, (_, i) => game(`P1g${String(i).padStart(4, '0')}`, 1793000000000 - i * 1000))
    page1.push(game('Twin0001', T))
    // Page 2 (until=T, inclusive) repeats the boundary game, then the twin and an older one.
    const page2 = [game('Twin0001', T), game('Twin0002', T), game('Older001', T - 5000)]
    const fake = fakeFetch({
      [lichessExportUrl('thibault')]: { text: toNdjson(page1) },
      [lichessExportUrl('thibault', String(T))]: { text: toNdjson(page2) },
    })
    const source = createLichessSource({ fetch: fake.fetch })

    let list = mergePage(undefined, await source.fetchGames('thibault'), START)
    expect(list.hasMore).toBe(true)
    list = mergePage(list, await source.fetchGames('thibault', { cursor: list.cursor }), START)

    const ids = list.games.map((g) => g.id)
    expect(ids).toContain('lichess:Twin0001')
    expect(ids).toContain('lichess:Twin0002')
    expect(ids).toContain('lichess:Older001')
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(PAGE_SIZE + 2)
    expect(list.hasMore).toBe(false)
  })

  it('does not loop when a whole page shares one createdAt', async () => {
    const T = 1793000000000
    const same = Array.from({ length: PAGE_SIZE }, (_, i) => ({ ...LICHESS_ABORTED, id: `Same${String(i).padStart(4, '0')}`, createdAt: T }))
    const fake = fakeFetch({ [`${lichessExportUrl('thibault')}*`]: { text: toNdjson(same) } })
    const source = createLichessSource({ fetch: fake.fetch })
    let list = mergePage(undefined, await source.fetchGames('thibault'), START)
    expect(list.cursor).toBe(String(T))
    list = mergePage(list, await source.fetchGames('thibault', { cursor: list.cursor }), START)
    expect(list.hasMore).toBe(false)
  })
})

describe('listHeading', () => {
  const games = [summary('a', 'bullet'), summary('b', 'blitz'), summary('c', 'blitz')]

  it('shows the total when unfiltered', () => {
    expect(listHeading({ games, username: 'hikaru', filter: 'all' }, 3)).toBe('3 games for hikaru')
    expect(listHeading({ games: games.slice(0, 1), username: 'hikaru', filter: 'all' }, 1)).toBe('1 game for hikaru')
  })

  it('shows "shown of total" when filtered', () => {
    expect(listHeading({ games, username: 'hikaru', filter: 'blitz' }, 2)).toBe('2 of 3 games for hikaru (Blitz)')
  })

  it('says when there are no games', () => {
    expect(listHeading({ games: [], username: 'nobody', filter: 'all' }, 0)).toBe('No games found for nobody.')
  })
})
