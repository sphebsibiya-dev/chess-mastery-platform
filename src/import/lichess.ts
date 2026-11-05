import { asNumber, asString, getText, isRecord } from './http'
import { outcomeFor, sameUser } from './summary'
import { formatClock, formatDays, normaliseTimeClass, timeClassFromClock } from './timeControl'
import type { FetchLike, FetchOptions, FetchPage, GameResult, GameSource, GameSummary } from './types'

const API = 'https://lichess.org/api/games/user'
const SITE = 'Lichess'
/** Games per request. */
export const PAGE_SIZE = 50

const PLAYABLE_VARIANTS = new Set(['standard', 'fromPosition'])
/** Statuses for games that never really happened or are still going. */
const SKIPPED_STATUSES = new Set(['aborted', 'noStart', 'created', 'started', 'unknownFinish'])

/**
 * Split a Lichess NDJSON body into objects. Blank lines and CRLF are fine;
 * lines that aren't JSON objects are counted in `skipped` instead of throwing.
 */
export function parseNdjson(text: string): { items: Record<string, unknown>[]; skipped: number } {
  const items: Record<string, unknown>[] = []
  let skipped = 0
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    try {
      const value = JSON.parse(trimmed) as unknown
      if (isRecord(value)) items.push(value)
      else skipped++
    } catch {
      skipped++
    }
  }
  return { items, skipped }
}

/** Lichess usernames: 2-30 letters, digits, `_` or `-`. */
export function validateLichessUsername(username: string): string | null {
  const u = username.trim()
  if (u === '') return 'Enter a Lichess username.'
  if (!/^[A-Za-z0-9_-]{2,30}$/.test(u)) {
    return 'Lichess usernames are 2 to 30 letters, numbers, "_" or "-".'
  }
  return null
}

interface Player {
  name: string
  /** Account name and id, for matching. Missing for anonymous and AI players. */
  ids: string[]
  rating?: number
}

function readPlayer(raw: unknown): Player {
  const p = isRecord(raw) ? raw : {}
  const user = isRecord(p.user) ? p.user : undefined
  const userName = asString(user?.name)
  const userId = asString(user?.id)
  const aiLevel = asNumber(p.aiLevel)
  const name = userName ?? userId ?? (aiLevel !== undefined ? `Stockfish level ${aiLevel}` : asString(p.name) ?? 'Anonymous')
  const player: Player = { name, ids: [userName, userId].filter((x): x is string => x !== undefined) }
  const rating = asNumber(p.rating)
  if (rating !== undefined) player.rating = rating
  return player
}

/** `variant` is a string in the game export; accept `{ key }` too, defensively. */
function variantKey(raw: unknown): string {
  if (raw === undefined) return 'standard'
  if (typeof raw === 'string') return raw
  if (isRecord(raw)) return asString(raw.key) ?? ''
  return ''
}

function timeControlOf(game: Record<string, unknown>): { label: string; clockClass?: GameSummary['timeClass'] } {
  const clock = isRecord(game.clock) ? game.clock : undefined
  const initial = asNumber(clock?.initial)
  if (initial !== undefined) {
    const increment = asNumber(clock?.increment) ?? 0
    return { label: formatClock(initial, increment), clockClass: timeClassFromClock(initial, increment) }
  }
  const days = asNumber(game.daysPerTurn)
  if (days !== undefined) return { label: formatDays(days), clockClass: 'daily' }
  return { label: 'Unlimited', clockClass: 'daily' }
}

/**
 * One game object from the Lichess user export (with `pgnInJson=true`) to a
 * list row, from `username`'s side. Returns null for variants, aborted or
 * unfinished games, games without a PGN, or if `username` played neither side.
 */
export function mapLichessGame(raw: unknown, username: string): GameSummary | null {
  if (!isRecord(raw)) return null
  const id = asString(raw.id)
  const pgn = asString(raw.pgn)
  if (!id || !pgn) return null
  if (!PLAYABLE_VARIANTS.has(variantKey(raw.variant))) return null
  const status = asString(raw.status)
  if (status !== undefined && SKIPPED_STATUSES.has(status)) return null

  const players = isRecord(raw.players) ? raw.players : {}
  const white = readPlayer(players.white)
  const black = readPlayer(players.black)
  const color = white.ids.some((n) => sameUser(n, username))
    ? 'w'
    : black.ids.some((n) => sameUser(n, username))
      ? 'b'
      : null
  if (!color) return null

  const winner = asString(raw.winner)
  // A finished game with no winner is a draw (agreement, stalemate, timeout vs insufficient material...).
  const result: Exclude<GameResult, '*'> = winner === 'white' ? '1-0' : winner === 'black' ? '0-1' : '1/2-1/2'
  const user = color === 'w' ? white : black
  const opp = color === 'w' ? black : white
  const tc = timeControlOf(raw)
  const endedAt = asNumber(raw.lastMoveAt) ?? asNumber(raw.createdAt) ?? 0

  const summary: GameSummary = {
    id: `lichess:${id}`,
    source: 'lichess',
    url: `https://lichess.org/${id}${color === 'b' ? '/black' : ''}`,
    pgn,
    userColor: color,
    opponent: opp.name,
    result,
    outcome: outcomeFor(result, color),
    timeClass: normaliseTimeClass(asString(raw.speed)) ?? tc.clockClass ?? 'classical',
    timeControl: tc.label,
    endedAt,
    rated: raw.rated === true,
  }
  if (user.rating !== undefined) summary.userRating = user.rating
  if (opp.rating !== undefined) summary.opponentRating = opp.rating
  return summary
}

/** `until` for the next page: just before the oldest game's start. */
export function nextCursor(items: readonly Record<string, unknown>[]): string | undefined {
  let oldest: number | undefined
  for (const item of items) {
    const created = asNumber(item.createdAt)
    if (created !== undefined && (oldest === undefined || created < oldest)) oldest = created
  }
  return oldest === undefined ? undefined : String(oldest - 1)
}

export function lichessExportUrl(username: string, cursor?: string): string {
  const params = new URLSearchParams({
    max: String(PAGE_SIZE),
    pgnInJson: 'true',
    clocks: 'true',
    opening: 'true',
  })
  if (cursor !== undefined) params.set('until', cursor)
  return `${API}/${encodeURIComponent(username)}?${params.toString()}`
}

export interface LichessSourceDeps {
  fetch: FetchLike
}

export function createLichessSource({ fetch }: LichessSourceDeps): GameSource {
  return {
    id: 'lichess',
    label: 'Lichess',
    validateUsername: validateLichessUsername,
    async fetchGames(username: string, options: FetchOptions = {}): Promise<FetchPage> {
      const { signal, cursor } = options
      const user = username.trim()
      const text = await getText(fetch, lichessExportUrl(user, cursor), {
        signal,
        // Accept is a CORS-safelisted header, so this adds no preflight.
        headers: { Accept: 'application/x-ndjson' },
        site: SITE,
        notFound: `No Lichess player called "${user}".`,
      })
      const { items, skipped: unreadable } = parseNdjson(text)
      const games: GameSummary[] = []
      let skipped = unreadable
      for (const item of items) {
        const game = mapLichessGame(item, user)
        if (game) games.push(game)
        else skipped++
      }
      games.sort((a, b) => b.endedAt - a.endedAt)
      // A full page means there may be older games.
      const hasMore = items.length + unreadable >= PAGE_SIZE
      const page: FetchPage = { games, skipped, hasMore }
      const next = hasMore ? nextCursor(items) : undefined
      if (next !== undefined) page.cursor = next
      else page.hasMore = false
      return page
    },
  }
}
