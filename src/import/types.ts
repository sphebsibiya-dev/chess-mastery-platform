/** Where a game came from. Every source produces the same `ImportedGame` shape. */
export type ImportSource = 'pgn' | 'chesscom' | 'lichess'

export type GameResult = '1-0' | '0-1' | '1/2-1/2' | '*'

export interface GameHeaders {
  white?: string
  black?: string
  whiteElo?: number
  blackElo?: number
  result?: GameResult
  date?: string
  event?: string
  site?: string
  timeControl?: string
  termination?: string
  eco?: string
  opening?: string
  /** Every tag as given, with `?` placeholder values dropped. */
  raw: Record<string, string>
}

export interface ImportedMove {
  /** 1-based half-move index. */
  ply: number
  /** Full-move number (1. e4 e5 -> both 1). */
  moveNumber: number
  color: 'w' | 'b'
  /** e.g. 'e8=Q+' */
  san: string
  /** e.g. 'e7e8q' */
  lan: string
  from: string
  to: string
  promotion?: 'q' | 'r' | 'b' | 'n'
  fenBefore: string
  fenAfter: string
  /** Comment text with `[%...]` commands removed. */
  comment?: string
  /** Remaining clock after the move, from `[%clk h:mm:ss(.f)]`. */
  clockSeconds?: number
}

export interface ImportedGame {
  /** Stable hash of the PGN text, or the source's game id. */
  id: string
  source: ImportSource
  headers: GameHeaders
  /** FEN header, or the standard start position. */
  startFen: string
  moves: ImportedMove[]
  /** Original single-game PGN. */
  pgn: string
  /** Which side the user played; undefined for pasted PGN where the user is unknown. */
  userColor?: 'w' | 'b'
}

export type ImportResult =
  | { ok: true; games: ImportedGame[]; skipped: { index: number; error: string; detail?: string }[] }
  /** `error` is user-readable; `detail` is the raw parser message, when there is one. */
  | { ok: false; error: string; detail?: string }

/** Speed category, normalised across sites (Lichess `ultraBullet` -> bullet, `correspondence` -> daily). */
export type TimeClass = 'bullet' | 'blitz' | 'rapid' | 'classical' | 'daily'

export type OnlineSourceId = 'chesscom' | 'lichess'

/**
 * One row in an online game list. Carries the raw PGN; it only becomes an
 * `ImportedGame` (via `summaryToGame`) when the user picks it.
 */
export interface GameSummary {
  /** 'chesscom:<uuid>' | 'lichess:<id>' */
  id: string
  source: OnlineSourceId
  url: string
  pgn: string
  /** Which side the searched user played. */
  userColor: 'w' | 'b'
  /** 'Anonymous' / 'Stockfish level 3' when there is no account. */
  opponent: string
  userRating?: number
  opponentRating?: number
  /** From White's side, as in PGN. */
  result: GameResult
  /** From the user's side. */
  outcome: 'win' | 'loss' | 'draw'
  timeClass: TimeClass
  /** Display form, e.g. '3+2', '1 day'. */
  timeControl: string
  /** When the game ended, ms since epoch. */
  endedAt: number
  rated: boolean
}

export interface FetchPage {
  /** Newest first. */
  games: GameSummary[]
  /** Games left out (variants, aborted games, unreadable rows). */
  skipped: number
  hasMore: boolean
  /** Opaque value to pass back to `fetchGames` for the next (older) page. */
  cursor?: string
}

export interface FetchOptions {
  signal?: AbortSignal
  cursor?: string
}

/** A site that lists a user's games. Add a new source by implementing this. */
export interface GameSource {
  id: OnlineSourceId
  label: string
  /** A user-readable error, or null if the username looks valid. */
  validateUsername(username: string): string | null
  fetchGames(username: string, options?: FetchOptions): Promise<FetchPage>
}

export type SourceErrorKind = 'not-found' | 'rate-limited' | 'network' | 'bad-response'

/** A fetch failure with a user-readable message. */
export class SourceError extends Error {
  readonly kind: SourceErrorKind
  constructor(kind: SourceErrorKind, message: string) {
    super(message)
    this.name = 'SourceError'
    this.kind = kind
  }
}

/** The subset of `fetch` the sources use, so tests can pass a fake. */
export type FetchLike = (
  url: string,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; text(): Promise<string> }>

/** The subset of `Storage` the archive cache uses. */
export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>
