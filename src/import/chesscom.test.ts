import { describe, expect, it } from 'vitest'
import {
  HIKARU_960,
  HIKARU_DAILY_WIN,
  HIKARU_DRAW,
  HIKARU_TIMEOUT_LOSS,
  HIKARU_WIN,
  archivesFor,
  manyGames,
  monthPayload,
} from './chesscomFixtures'
import {
  LIVE_TTL_MS,
  createChesscomSource,
  mapChesscomGame,
  monthsFromArchives,
  validateChesscomUsername,
} from './chesscom'
import { MapStorage, fakeFetch, type FakeReply } from './testFakes'
import { SourceError } from './types'

const BASE = 'https://api.chess.com/pub/player/hikaru/games'
const ARCHIVES = `${BASE}/archives`
/** 5 Nov 2026, 12:00 UTC. */
const NOW = Date.UTC(2026, 10, 5, 12)

describe('mapChesscomGame', () => {
  it('maps a win as White', () => {
    expect(mapChesscomGame(HIKARU_WIN, 'hikaru')).toEqual({
      id: `chesscom:${HIKARU_WIN.uuid}`,
      source: 'chesscom',
      url: HIKARU_WIN.url,
      pgn: HIKARU_WIN.pgn,
      userColor: 'w',
      opponent: 'carokannlover213',
      userRating: 3350,
      opponentRating: 3099,
      result: '1-0',
      outcome: 'win',
      timeClass: 'blitz',
      timeControl: '3+0',
      endedAt: 1793719160000,
      rated: true,
    })
  })

  it('matches the username ignoring case', () => {
    expect(mapChesscomGame(HIKARU_WIN, 'HIKARU')?.userColor).toBe('w')
  })

  it('maps a loss on time as Black', () => {
    const g = mapChesscomGame(HIKARU_TIMEOUT_LOSS, 'hikaru')
    expect(g).toMatchObject({ userColor: 'b', opponent: 'FruityPebbles', result: '1-0', outcome: 'loss', timeControl: '3+2' })
  })

  it('maps a daily win as Black', () => {
    const g = mapChesscomGame(HIKARU_DAILY_WIN, 'hikaru')
    expect(g).toMatchObject({ userColor: 'b', result: '0-1', outcome: 'win', timeClass: 'daily', timeControl: '1 day', rated: false })
  })

  it.each(['agreed', 'repetition', 'stalemate', 'insufficient', 'timevsinsufficient', '50move'])('%s is a draw', (code) => {
    const raw = { ...HIKARU_DRAW, white: { ...HIKARU_DRAW.white, result: code }, black: { ...HIKARU_DRAW.black, result: code } }
    expect(mapChesscomGame(raw, 'hikaru')).toMatchObject({ result: '1/2-1/2', outcome: 'draw', timeClass: 'rapid', timeControl: '10+5' })
  })

  it('draws when only one side carries the draw code', () => {
    const raw = { ...HIKARU_DRAW, white: { ...HIKARU_DRAW.white, result: 'timevsinsufficient' }, black: { ...HIKARU_DRAW.black, result: 'timeout' } }
    expect(mapChesscomGame(raw, 'hikaru')?.result).toBe('1/2-1/2')
  })

  it('skips chess960 and other variants', () => {
    expect(mapChesscomGame(HIKARU_960, 'hikaru')).toBeNull()
    expect(mapChesscomGame({ ...HIKARU_WIN, rules: 'bughouse' }, 'hikaru')).toBeNull()
  })

  it('returns null when the user played neither side', () => {
    expect(mapChesscomGame(HIKARU_WIN, 'someoneelse')).toBeNull()
  })

  it('returns null for malformed rows', () => {
    expect(mapChesscomGame(null, 'hikaru')).toBeNull()
    expect(mapChesscomGame({ ...HIKARU_WIN, pgn: undefined }, 'hikaru')).toBeNull()
    expect(mapChesscomGame({ ...HIKARU_WIN, white: { username: 'Hikaru', result: 'x' }, black: { username: 'b', result: 'y' } }, 'hikaru')).toBeNull()
  })

  it('falls back to the clock when time_class is missing', () => {
    const { time_class: _ignored, ...raw } = HIKARU_WIN
    expect(mapChesscomGame(raw, 'hikaru')?.timeClass).toBe('blitz')
  })
})

describe('monthsFromArchives', () => {
  it('returns months newest first and drops malformed URLs', () => {
    const { archives } = archivesFor('hikaru', ['2026/09', '2026/10', '2026/11'])
    expect(monthsFromArchives([...archives, 'https://example.com/nope', 42, `${BASE}/2026/13`])).toEqual([
      { year: 2026, month: 11, url: `${BASE}/2026/11` },
      { year: 2026, month: 10, url: `${BASE}/2026/10` },
      { year: 2026, month: 9, url: `${BASE}/2026/09` },
    ])
  })

  it('handles an empty list', () => {
    expect(monthsFromArchives([])).toEqual([])
  })
})

describe('validateChesscomUsername', () => {
  it('accepts normal names and rejects bad ones', () => {
    expect(validateChesscomUsername('Hikaru')).toBeNull()
    expect(validateChesscomUsername('  magnus_carlsen-1 ')).toBeNull()
    expect(validateChesscomUsername('')).toMatch(/Enter/)
    expect(validateChesscomUsername('ab')).not.toBeNull()
    expect(validateChesscomUsername('has space')).not.toBeNull()
    expect(validateChesscomUsername('../etc')).not.toBeNull()
  })
})

function routes(extra: Record<string, FakeReply | (() => FakeReply)> = {}) {
  return {
    [ARCHIVES]: { body: archivesFor('hikaru', ['2026/07', '2026/08', '2026/09', '2026/10', '2026/11']) },
    [`${BASE}/2026/11`]: { body: monthPayload([HIKARU_DRAW, HIKARU_960, HIKARU_TIMEOUT_LOSS, HIKARU_WIN]) },
    [`${BASE}/2026/10`]: { body: monthPayload([HIKARU_DAILY_WIN]) },
    [`${BASE}/2026/09`]: { body: monthPayload(manyGames(5, 1788000000)) },
    [`${BASE}/2026/08`]: { body: monthPayload(manyGames(2, 1786000000)) },
    [`${BASE}/2026/07`]: { body: monthPayload(manyGames(1, 1784000000)) },
    ...extra,
  }
}

describe('createChesscomSource', () => {
  it('fetches archives, then months newest first, one at a time, up to 3 months', async () => {
    const fake = fakeFetch(routes())
    const source = createChesscomSource({ fetch: fake.fetch, storage: new MapStorage(), now: () => NOW })
    const page = await source.fetchGames('Hikaru')
    expect(fake.calls).toEqual([ARCHIVES, `${BASE}/2026/11`, `${BASE}/2026/10`, `${BASE}/2026/09`])
    expect(fake.maxConcurrent).toBe(1)
    expect(page.games).toHaveLength(3 + 1 + 5)
    expect(page.skipped).toBe(1)
    expect(page.hasMore).toBe(true)
    expect(page.cursor).toBe('2026-08')
    // Newest first, across and within months.
    const ends = page.games.map((g) => g.endedAt)
    expect(ends).toEqual([...ends].sort((a, b) => b - a))
    expect(page.games[0].id).toBe(`chesscom:${HIKARU_WIN.uuid}`)
  })

  it('stops once it has 30 games', async () => {
    const fake = fakeFetch(routes({ [`${BASE}/2026/11`]: { body: monthPayload(manyGames(30, 1793000000)) } }))
    const source = createChesscomSource({ fetch: fake.fetch, storage: new MapStorage(), now: () => NOW })
    const page = await source.fetchGames('hikaru')
    expect(fake.calls).toEqual([ARCHIVES, `${BASE}/2026/11`])
    expect(page.games).toHaveLength(30)
    expect(page.cursor).toBe('2026-10')
  })

  it('"load older" fetches one more month from the cursor, and ends with hasMore false', async () => {
    const fake = fakeFetch(routes())
    const source = createChesscomSource({ fetch: fake.fetch, storage: new MapStorage(), now: () => NOW })
    const first = await source.fetchGames('hikaru')
    const second = await source.fetchGames('hikaru', { cursor: first.cursor })
    expect(fake.calls.slice(4)).toEqual([`${BASE}/2026/08`]) // archive list still fresh in memory
    expect(second.games).toHaveLength(2)
    expect(second.cursor).toBe('2026-07')
    const third = await source.fetchGames('hikaru', { cursor: second.cursor })
    expect(third.games).toHaveLength(1)
    expect(third.hasMore).toBe(false)
    expect(third.cursor).toBeUndefined()
    expect(fake.maxConcurrent).toBe(1)
  })

  it('"load older" keeps going past empty months (up to 3)', async () => {
    const fake = fakeFetch(routes({ [`${BASE}/2026/08`]: { body: monthPayload([HIKARU_960]) } }))
    const source = createChesscomSource({ fetch: fake.fetch, storage: new MapStorage(), now: () => NOW })
    const page = await source.fetchGames('hikaru', { cursor: '2026-08' })
    expect(fake.calls).toEqual([ARCHIVES, `${BASE}/2026/08`, `${BASE}/2026/07`])
    expect(page.games).toHaveLength(1)
    expect(page.skipped).toBe(1)
  })

  it('reuses cached past months; re-fetches live data only after the TTL', async () => {
    const storage = new MapStorage()
    let now = NOW
    const fake = fakeFetch(routes())
    const source = createChesscomSource({ fetch: fake.fetch, storage, now: () => now })
    await source.fetchGames('hikaru')
    expect(fake.calls).toHaveLength(4)
    expect([...storage.map.keys()].sort()).toEqual(['mogfish:chesscom:hikaru:2026-09', 'mogfish:chesscom:hikaru:2026-10'])

    await source.fetchGames('HIKARU')
    expect(fake.calls).toHaveLength(4) // everything from memory within the TTL

    now += LIVE_TTL_MS
    await source.fetchGames('hikaru')
    expect(fake.calls.slice(4)).toEqual([ARCHIVES, `${BASE}/2026/11`])

    // A new session (fresh source, same storage) only needs the live data.
    const fake2 = fakeFetch(routes())
    const again = createChesscomSource({ fetch: fake2.fetch, storage, now: () => now })
    const page = await again.fetchGames('hikaru')
    expect(fake2.calls).toEqual([ARCHIVES, `${BASE}/2026/11`])
    expect(page.games).toHaveLength(9)
  })

  it('treats the previous month as live until a day after it ends', async () => {
    const storage = new MapStorage()
    const fake = fakeFetch(routes())
    const source = createChesscomSource({ fetch: fake.fetch, storage, now: () => Date.UTC(2026, 10, 1, 6) })
    await source.fetchGames('hikaru')
    expect(storage.map.has('mogfish:chesscom:hikaru:2026-10')).toBe(false)
    expect(storage.map.has('mogfish:chesscom:hikaru:2026-09')).toBe(true)
  })

  it.each([
    [{ status: 404, body: { message: 'User "nobody" not found.' } }, 'not-found'],
    [{ status: 429, body: {} }, 'rate-limited'],
    [{ status: 500, body: {} }, 'bad-response'],
    [{ throws: new TypeError('Failed to fetch') }, 'network'],
    [{ text: '<!DOCTYPE html><title>Just a moment...</title>' }, 'bad-response'],
    [{ body: { nope: true } }, 'bad-response'],
  ] as const)('maps %o to SourceError(%s)', async (reply, kind) => {
    const fake = fakeFetch({ [ARCHIVES]: reply })
    const source = createChesscomSource({ fetch: fake.fetch, storage: new MapStorage(), now: () => NOW })
    const error = await source.fetchGames('hikaru').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(SourceError)
    expect((error as SourceError).kind).toBe(kind)
    expect((error as SourceError).message).not.toBe('')
  })

  it('does not retry after a 429', async () => {
    const fake = fakeFetch(routes({ [`${BASE}/2026/11`]: { status: 429 } }))
    const source = createChesscomSource({ fetch: fake.fetch, storage: new MapStorage(), now: () => NOW })
    await expect(source.fetchGames('hikaru')).rejects.toMatchObject({ kind: 'rate-limited' })
    expect(fake.calls).toEqual([ARCHIVES, `${BASE}/2026/11`])
  })

  it('rejects with AbortError when aborted, and caches nothing from the aborted request', async () => {
    const storage = new MapStorage()
    const controller = new AbortController()
    const fake = fakeFetch(
      routes({
        [`${BASE}/2026/10`]: () => {
          controller.abort()
          return { body: monthPayload([HIKARU_DAILY_WIN]) }
        },
      }),
    )
    const source = createChesscomSource({ fetch: fake.fetch, storage, now: () => NOW })
    await expect(source.fetchGames('hikaru', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(storage.map.size).toBe(0)
    expect(fake.calls).toEqual([ARCHIVES, `${BASE}/2026/11`, `${BASE}/2026/10`])
  })

  it('rejects immediately for an already-aborted signal', async () => {
    const fake = fakeFetch(routes())
    const source = createChesscomSource({ fetch: fake.fetch, storage: new MapStorage(), now: () => NOW })
    const controller = new AbortController()
    controller.abort()
    await expect(source.fetchGames('hikaru', { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    expect(fake.calls).toEqual([])
  })

  it('handles a user with no games', async () => {
    const fake = fakeFetch({ [ARCHIVES]: { body: { archives: [] } } })
    const source = createChesscomSource({ fetch: fake.fetch, storage: new MapStorage(), now: () => NOW })
    expect(await source.fetchGames('hikaru')).toEqual({ games: [], skipped: 0, hasMore: false })
  })
})
