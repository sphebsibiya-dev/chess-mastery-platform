import { TIME_CLASS_LABELS } from './timeControl'
import type { FetchPage, GameSummary, OnlineSourceId, TimeClass } from './types'

/** Rows rendered at once; "Show more" adds another chunk. */
export const LIST_CHUNK = 100

/** A loaded online game list, kept by the parent so "back" restores it. */
export interface OnlineSession {
  source: OnlineSourceId
  username: string
  /** Newest first, unique by id. */
  games: GameSummary[]
  cursor?: string
  hasMore: boolean
  filter: TimeClass | 'all'
  /** Games left out so far (variants, aborted games). */
  skipped: number
  /** How many rows of the (filtered) list are rendered. */
  visible: number
}

export function emptySession(source: OnlineSourceId, username: string): OnlineSession {
  return { source, username, games: [], hasMore: false, filter: 'all', skipped: 0, visible: LIST_CHUNK }
}

/**
 * Add a fetched page to a list. `prev` undefined starts a new list.
 * Games already in the list (by id) are dropped: Lichess pages overlap by the
 * boundary game on purpose. Paging stops when an older page adds no new games,
 * unless it only held skipped rows (e.g. aborted games) and the cursor moved on;
 * a run of identical timestamps can't loop forever.
 */
export function mergePage(
  prev: OnlineSession | undefined,
  page: FetchPage,
  start: { source: OnlineSourceId; username: string },
): OnlineSession {
  const base = prev ?? emptySession(start.source, start.username)
  const seen = new Set(base.games.map((g) => g.id))
  const added: GameSummary[] = []
  for (const g of page.games) {
    if (seen.has(g.id)) continue
    seen.add(g.id)
    added.push(g)
  }
  const stuck =
    prev !== undefined && added.length === 0 && (page.skipped === 0 || page.cursor === prev.cursor)
  const hasMore = page.hasMore && page.cursor !== undefined && !stuck
  const next: OnlineSession = {
    ...base,
    games: [...base.games, ...added],
    hasMore,
    skipped: base.skipped + page.skipped,
    // Loading older games should show them: keep everything shown so far visible, plus a chunk.
    visible: prev ? Math.max(base.visible, base.games.length) + LIST_CHUNK : LIST_CHUNK,
  }
  if (hasMore) next.cursor = page.cursor
  else delete next.cursor
  return next
}

/** e.g. '1119 games for hikaru', '42 of 1119 games for hikaru (Bullet)'. */
export function listHeading(session: Pick<OnlineSession, 'games' | 'username' | 'filter'>, shown: number): string {
  const total = session.games.length
  if (total === 0) return `No games found for ${session.username}.`
  const noun = `game${total === 1 ? '' : 's'}`
  if (session.filter === 'all') return `${total} ${noun} for ${session.username}`
  return `${shown} of ${total} ${noun} for ${session.username} (${TIME_CLASS_LABELS[session.filter]})`
}
