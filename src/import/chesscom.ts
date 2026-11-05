import { ArchiveCache } from './cache'
import { asNumber, asString, getText, isRecord, parseJson, throwIfAborted } from './http'
import { outcomeFor, userSide } from './summary'
import { formatTimeControl, normaliseTimeClass, timeClassFromClock } from './timeControl'
import {
  SourceError,
  type FetchLike,
  type FetchOptions,
  type FetchPage,
  type GameResult,
  type GameSource,
  type GameSummary,
  type StorageLike,
} from './types'

const API = 'https://api.chess.com/pub/player'
const SITE = 'chess.com'

/** First load reads months until at least this many games... */
export const FIRST_LOAD_MIN_GAMES = 30
/** ...or this many months, whichever comes first. */
export const MAX_MONTHS_PER_LOAD = 3
/** Archive list and current month are live data; re-fetch after this. */
export const LIVE_TTL_MS = 5 * 60 * 1000
/** A month is treated as final this long after it ends (UTC), to allow for late-ending daily games. */
const MONTH_GRACE_MS = 24 * 60 * 60 * 1000
const CACHE_VERSION = 1

/** chess.com result codes that mean the game was drawn. */
const DRAW_CODES = new Set([
  'agreed',
  'repetition',
  'stalemate',
  'insufficient',
  'timevsinsufficient',
  '50move',
])

export interface ArchiveMonth {
  year: number
  month: number
  url: string
}

/** 'YYYY-MM', which also sorts chronologically as a string. */
export function monthKey(m: { year: number; month: number }): string {
  return `${m.year}-${String(m.month).padStart(2, '0')}`
}

/** Archive URLs (oldest first, as chess.com lists them) to months, newest first. Malformed URLs are dropped. */
export function monthsFromArchives(archives: readonly unknown[]): ArchiveMonth[] {
  const months: ArchiveMonth[] = []
  for (const url of archives) {
    if (typeof url !== 'string') continue
    const match = /\/games\/(\d{4})\/(\d{2})\/?$/.exec(url)
    if (!match) continue
    const year = Number(match[1])
    const month = Number(match[2])
    if (month < 1 || month > 12) continue
    months.push({ year, month, url })
  }
  return months.sort((a, b) => b.year - a.year || b.month - a.month)
}

/** chess.com usernames: 3-25 letters, digits, `_` or `-`. */
export function validateChesscomUsername(username: string): string | null {
  const u = username.trim()
  if (u === '') return 'Enter a chess.com username.'
  if (!/^[A-Za-z0-9_-]{3,25}$/.test(u)) {
    return 'chess.com usernames are 3 to 25 letters, numbers, "_" or "-".'
  }
  return null
}

function resultFromCodes(white: string | undefined, black: string | undefined): Exclude<GameResult, '*'> | null {
  if (white === 'win') return '1-0'
  if (black === 'win') return '0-1'
  if ((white && DRAW_CODES.has(white)) || (black && DRAW_CODES.has(black))) return '1/2-1/2'
  return null
}

function liveTimeClass(timeControl: string): GameSummary['timeClass'] | null {
  const match = /^(\d+)(?:\+(\d+))?$/.exec(timeControl)
  return match ? timeClassFromClock(Number(match[1]), Number(match[2] ?? 0)) : null
}

/**
 * One game from a chess.com monthly archive to a list row, from `username`'s side.
 * Returns null for non-standard rules, unfinished/unknown results, or if
 * `username` played neither side.
 */
export function mapChesscomGame(raw: unknown, username: string): GameSummary | null {
  if (!isRecord(raw)) return null
  const rules = asString(raw.rules) ?? 'chess'
  if (rules !== 'chess') return null
  const pgn = asString(raw.pgn)
  if (!pgn) return null
  const white = isRecord(raw.white) ? raw.white : {}
  const black = isRecord(raw.black) ? raw.black : {}
  const whiteName = asString(white.username)
  const blackName = asString(black.username)
  const color = userSide(whiteName, blackName, username)
  if (!color) return null
  const result = resultFromCodes(asString(white.result), asString(black.result))
  if (!result) return null

  const user = color === 'w' ? white : black
  const opp = color === 'w' ? black : white
  const timeControlRaw = asString(raw.time_control) ?? ''
  const timeClass =
    normaliseTimeClass(asString(raw.time_class)) ?? liveTimeClass(timeControlRaw) ?? 'daily'
  const url = asString(raw.url) ?? ''
  const id = asString(raw.uuid) ?? url
  if (!id) return null

  const summary: GameSummary = {
    id: `chesscom:${id}`,
    source: 'chesscom',
    url,
    pgn,
    userColor: color,
    opponent: (color === 'w' ? blackName : whiteName) ?? 'Anonymous',
    result,
    outcome: outcomeFor(result, color),
    timeClass,
    timeControl: formatTimeControl(timeControlRaw),
    endedAt: (asNumber(raw.end_time) ?? 0) * 1000,
    rated: raw.rated === true,
  }
  const userRating = asNumber(user.rating)
  const opponentRating = asNumber(opp.rating)
  if (userRating !== undefined) summary.userRating = userRating
  if (opponentRating !== undefined) summary.opponentRating = opponentRating
  return summary
}

/** A month's games mapped for one user, newest first. */
export function mapChesscomMonth(rawGames: readonly unknown[], username: string): { games: GameSummary[]; skipped: number } {
  const games: GameSummary[] = []
  let skipped = 0
  for (const raw of rawGames) {
    const game = mapChesscomGame(raw, username)
    if (game) games.push(game)
    else skipped++
  }
  games.sort((a, b) => b.endedAt - a.endedAt)
  return { games, skipped }
}

interface CachedMonth {
  v: number
  games: GameSummary[]
  skipped: number
}

export interface ChesscomSourceDeps {
  fetch: FetchLike
  /** localStorage, or null for memory-only caching. */
  storage: StorageLike | null
  now?: () => number
}

export function createChesscomSource({ fetch, storage, now = Date.now }: ChesscomSourceDeps): GameSource {
  const cache = new ArchiveCache({ storage, now })

  const isPastMonth = (m: ArchiveMonth): boolean =>
    now() >= Date.UTC(m.year, m.month /* next month, 0-based */, 1) + MONTH_GRACE_MS

  const notFound = (username: string) => `No chess.com player called "${username}".`

  async function loadArchives(user: string, username: string, signal?: AbortSignal): Promise<ArchiveMonth[]> {
    const key = `mogfish:chesscom:${user}:archives`
    const cached = cache.get<ArchiveMonth[]>(key)
    if (cached) return cached
    const text = await getText(fetch, `${API}/${encodeURIComponent(user)}/games/archives`, {
      signal,
      site: SITE,
      notFound: notFound(username),
    })
    const body = parseJson(text, SITE)
    if (!isRecord(body) || !Array.isArray(body.archives)) {
      throw new SourceError('bad-response', 'chess.com sent an unexpected response. Try again later.')
    }
    const months = monthsFromArchives(body.archives)
    throwIfAborted(signal)
    cache.setTemporary(key, months, LIVE_TTL_MS)
    return months
  }

  async function loadMonth(user: string, username: string, m: ArchiveMonth, signal?: AbortSignal): Promise<CachedMonth> {
    const key = `mogfish:chesscom:${user}:${monthKey(m)}`
    const cached = cache.get<CachedMonth>(key)
    if (cached && cached.v === CACHE_VERSION && Array.isArray(cached.games)) return cached
    const text = await getText(fetch, m.url, { signal, site: SITE, notFound: notFound(username) })
    const body = parseJson(text, SITE)
    if (!isRecord(body) || !Array.isArray(body.games)) {
      throw new SourceError('bad-response', 'chess.com sent an unexpected response. Try again later.')
    }
    const entry: CachedMonth = { v: CACHE_VERSION, ...mapChesscomMonth(body.games, user) }
    throwIfAborted(signal)
    if (isPastMonth(m)) cache.setPersistent(key, entry)
    else cache.setTemporary(key, entry, LIVE_TTL_MS)
    return entry
  }

  return {
    id: 'chesscom',
    label: 'Chess.com',
    validateUsername: validateChesscomUsername,
    async fetchGames(username: string, options: FetchOptions = {}): Promise<FetchPage> {
      const { signal, cursor } = options
      const display = username.trim()
      const user = display.toLowerCase()
      const months = await loadArchives(user, display, signal)

      // The cursor is the 'YYYY-MM' of the next (older) month to read.
      let index = cursor === undefined ? 0 : months.findIndex((m) => monthKey(m) <= cursor)
      if (index < 0) index = months.length
      const firstLoad = cursor === undefined

      const games: GameSummary[] = []
      let skipped = 0
      let read = 0
      // One request at a time: each month is awaited before the next starts.
      while (index < months.length && read < MAX_MONTHS_PER_LOAD) {
        const month = await loadMonth(user, display, months[index], signal)
        games.push(...month.games)
        skipped += month.skipped
        index++
        read++
        // First load: aim for a useful list. "Load older": one month, unless it was empty.
        if (firstLoad ? games.length >= FIRST_LOAD_MIN_GAMES : games.length > 0) break
      }

      const hasMore = index < months.length
      const page: FetchPage = { games, skipped, hasMore }
      if (hasMore) page.cursor = monthKey(months[index])
      return page
    },
  }
}
