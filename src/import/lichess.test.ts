import { describe, expect, it } from 'vitest'
import {
  PAGE_SIZE,
  createLichessSource,
  lichessExportUrl,
  mapLichessGame,
  nextCursor,
  parseNdjson,
  validateLichessUsername,
} from './lichess'
import {
  LICHESS_960,
  LICHESS_ABORTED,
  LICHESS_DRAW,
  LICHESS_LOSS,
  LICHESS_STALEMATE_ANON,
  LICHESS_VS_AI,
  LICHESS_WIN,
  toNdjson,
} from './lichessFixtures'
import { fakeFetch } from './testFakes'
import { SourceError } from './types'

describe('parseNdjson', () => {
  it('reads one object per line with a trailing newline', () => {
    const { items, skipped } = parseNdjson(toNdjson([LICHESS_WIN, LICHESS_LOSS]))
    expect(items.map((i) => i.id)).toEqual(['AbCd1234', 'Loss0001'])
    expect(skipped).toBe(0)
  })

  it('handles CRLF and blank lines', () => {
    const text = `\r\n${JSON.stringify(LICHESS_WIN)}\r\n\r\n${JSON.stringify(LICHESS_LOSS)}\r\n\r\n`
    expect(parseNdjson(text).items).toHaveLength(2)
  })

  it('counts malformed lines as skipped without throwing', () => {
    const text = `${JSON.stringify(LICHESS_WIN)}\n{"id": "trunc\n[1,2]\n"str"\n`
    expect(parseNdjson(text)).toEqual({ items: [LICHESS_WIN], skipped: 3 })
  })

  it('handles an empty body', () => {
    expect(parseNdjson('')).toEqual({ items: [], skipped: 0 })
  })
})

describe('mapLichessGame', () => {
  it('maps a win as White', () => {
    expect(mapLichessGame(LICHESS_WIN, 'thibault')).toEqual({
      id: 'lichess:AbCd1234',
      source: 'lichess',
      url: 'https://lichess.org/AbCd1234',
      pgn: LICHESS_WIN.pgn,
      userColor: 'w',
      opponent: 'DrNykterstein',
      userRating: 1950,
      opponentRating: 2010,
      result: '1-0',
      outcome: 'win',
      timeClass: 'blitz',
      timeControl: '3+2',
      endedAt: 1793786460000,
      rated: true,
    })
  })

  it('matches by name or id, ignoring case', () => {
    expect(mapLichessGame(LICHESS_WIN, 'DRNYKTERSTEIN')).toMatchObject({ userColor: 'b', outcome: 'loss', url: 'https://lichess.org/AbCd1234/black' })
  })

  it("winner 'black' with the user as White is a loss", () => {
    expect(mapLichessGame(LICHESS_LOSS, 'thibault')).toMatchObject({ result: '0-1', outcome: 'loss', timeClass: 'rapid', timeControl: '10+0' })
  })

  it('a draw status with no winner is a draw', () => {
    expect(mapLichessGame(LICHESS_DRAW, 'thibault')).toMatchObject({
      result: '1/2-1/2',
      outcome: 'draw',
      userColor: 'b',
      timeClass: 'classical',
      timeControl: '30+20',
      rated: false,
    })
  })

  it('stalemate is a draw; a player with no user is Anonymous', () => {
    const g = mapLichessGame(LICHESS_STALEMATE_ANON, 'thibault')
    expect(g).toMatchObject({ result: '1/2-1/2', outcome: 'draw', opponent: 'Anonymous' })
    expect(g?.userRating).toBeUndefined()
    expect(g?.opponentRating).toBeUndefined()
  })

  it('an AI opponent shows as Stockfish level N; correspondence is daily', () => {
    expect(mapLichessGame(LICHESS_VS_AI, 'thibault')).toMatchObject({
      opponent: 'Stockfish level 3',
      outcome: 'win',
      timeClass: 'daily',
      timeControl: '2 days',
    })
  })

  it('takes endedAt from lastMoveAt, falling back to createdAt', () => {
    expect(mapLichessGame(LICHESS_LOSS, 'thibault')?.endedAt).toBe(LICHESS_LOSS.lastMoveAt)
    const { lastMoveAt: _ignored, ...noLastMove } = LICHESS_LOSS
    expect(mapLichessGame(noLastMove, 'thibault')?.endedAt).toBe(LICHESS_LOSS.createdAt)
  })

  it('skips aborted games and variants', () => {
    expect(mapLichessGame(LICHESS_ABORTED, 'thibault')).toBeNull()
    expect(mapLichessGame({ ...LICHESS_ABORTED, status: 'noStart' }, 'thibault')).toBeNull()
    expect(mapLichessGame(LICHESS_960, 'thibault')).toBeNull()
    expect(mapLichessGame({ ...LICHESS_WIN, variant: 'crazyhouse' }, 'thibault')).toBeNull()
  })

  it('keeps fromPosition games and tolerates a variant object', () => {
    expect(mapLichessGame({ ...LICHESS_WIN, variant: 'fromPosition' }, 'thibault')).not.toBeNull()
    expect(mapLichessGame({ ...LICHESS_WIN, variant: { key: 'standard', name: 'Standard' } }, 'thibault')).not.toBeNull()
  })

  it('tolerates missing optional fields', () => {
    const minimal = {
      id: 'Min00001',
      players: { white: { user: { name: 'thibault' } }, black: { user: { name: 'b' } } },
      winner: 'white',
      pgn: '1. e4 e5 1-0',
    }
    expect(mapLichessGame(minimal, 'thibault')).toMatchObject({
      id: 'lichess:Min00001',
      outcome: 'win',
      rated: false,
      timeControl: 'Unlimited',
      timeClass: 'daily',
      endedAt: 0,
    })
  })

  it('falls back to the clock when speed is missing', () => {
    const { speed: _ignored, ...noSpeed } = LICHESS_WIN
    expect(mapLichessGame(noSpeed, 'thibault')?.timeClass).toBe('blitz')
  })

  it('returns null without a PGN, an id, or the user', () => {
    expect(mapLichessGame({ ...LICHESS_WIN, pgn: undefined }, 'thibault')).toBeNull()
    expect(mapLichessGame({ ...LICHESS_WIN, id: undefined }, 'thibault')).toBeNull()
    expect(mapLichessGame(LICHESS_WIN, 'nobody')).toBeNull()
    expect(mapLichessGame('nope', 'thibault')).toBeNull()
  })
})

describe('nextCursor', () => {
  it('is the oldest createdAt minus 1', () => {
    expect(nextCursor([LICHESS_WIN, LICHESS_DRAW, LICHESS_LOSS])).toBe(String(LICHESS_DRAW.createdAt - 1))
    expect(nextCursor([{ id: 'x' }])).toBeUndefined()
  })
})

describe('validateLichessUsername', () => {
  it('accepts normal names and rejects bad ones', () => {
    expect(validateLichessUsername('DrNykterstein')).toBeNull()
    expect(validateLichessUsername('ab')).toBeNull()
    expect(validateLichessUsername('')).toMatch(/Enter/)
    expect(validateLichessUsername('a')).not.toBeNull()
    expect(validateLichessUsername('a/b')).not.toBeNull()
  })
})

describe('createLichessSource', () => {
  const url = (cursor?: string) => lichessExportUrl('thibault', cursor)

  it('requests the NDJSON export with PGN, clocks and max=50', () => {
    const u = new URL(url('123'))
    expect(u.origin + u.pathname).toBe('https://lichess.org/api/games/user/thibault')
    expect(Object.fromEntries(u.searchParams)).toEqual({ max: '50', pgnInJson: 'true', clocks: 'true', opening: 'true', until: '123' })
  })

  it('maps a page and counts skipped games', async () => {
    const body = toNdjson([LICHESS_WIN, LICHESS_ABORTED, LICHESS_LOSS, LICHESS_960]) + 'garbage\n'
    const fake = fakeFetch({ [url()]: { text: body } })
    const page = await createLichessSource({ fetch: fake.fetch }).fetchGames('thibault')
    expect(page.games.map((g) => g.id)).toEqual(['lichess:AbCd1234', 'lichess:Loss0001'])
    expect(page.skipped).toBe(3)
    expect(page.hasMore).toBe(false)
    expect(page.cursor).toBeUndefined()
    expect(fake.calls).toEqual([url()])
  })

  it('a full page has more, with an until cursor; the next call uses it', async () => {
    const games = Array.from({ length: PAGE_SIZE }, (_, i) => ({
      ...LICHESS_WIN,
      id: `G${String(i).padStart(7, '0')}`,
      createdAt: 1793000000000 - i * 1000,
      lastMoveAt: 1793000000000 - i * 1000 + 500,
    }))
    const oldest = 1793000000000 - (PAGE_SIZE - 1) * 1000
    const fake = fakeFetch({
      [url()]: { text: toNdjson(games) },
      [url(String(oldest - 1))]: { text: toNdjson([LICHESS_DRAW]) },
    })
    const source = createLichessSource({ fetch: fake.fetch })
    const first = await source.fetchGames('thibault')
    expect(first.games).toHaveLength(PAGE_SIZE)
    expect(first.hasMore).toBe(true)
    expect(first.cursor).toBe(String(oldest - 1))
    const second = await source.fetchGames('thibault', { cursor: first.cursor })
    expect(second.games.map((g) => g.id)).toEqual(['lichess:Draw0001'])
    expect(second.hasMore).toBe(false)
  })

  it.each([
    [{ status: 404, text: '' }, 'not-found'],
    [{ status: 429, text: '' }, 'rate-limited'],
    [{ status: 503, text: '' }, 'bad-response'],
    [{ throws: new TypeError('Failed to fetch') }, 'network'],
  ] as const)('maps %o to SourceError(%s)', async (reply, kind) => {
    const fake = fakeFetch({ [url()]: reply })
    const error = await createLichessSource({ fetch: fake.fetch })
      .fetchGames('thibault')
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(SourceError)
    expect((error as SourceError).kind).toBe(kind)
    expect(fake.calls).toHaveLength(1) // no retry
  })

  it('rejects with AbortError when aborted', async () => {
    const controller = new AbortController()
    const fake = fakeFetch({
      [url()]: () => {
        controller.abort()
        return { text: toNdjson([LICHESS_WIN]) }
      },
    })
    await expect(createLichessSource({ fetch: fake.fetch }).fetchGames('thibault', { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    })
  })
})
