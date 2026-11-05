import { Chess } from 'chess.js'
import { START_FEN } from '../chess/constants'
import type { GameHeaders, GameResult, ImportedGame, ImportedMove, ImportResult, ImportSource } from './types'

const TAG_LINE = /^\s*\[\w+\s+"/
const SAN_LIKE = /^(?:[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=?[QRBN])?|[O0]-[O0](?:-[O0])?)[+#]?[!?]*$/
const MOVETEXT_START =/^\s*\d+\s*\./
const TERMINATION_AT_END = /(?:^|\s)(?:1-0|0-1|1\/2-1\/2|\*)\s*$/
const CLOCK = /\[%clk\s+(\d+(?::\d+){1,2}(?:\.\d+)?)\s*\]/
const COMMAND = /\[%[^\]]*\]/g
const RESULTS: readonly GameResult[] = ['1-0', '0-1', '1/2-1/2', '*']

/** Normalise line endings to `\n`. */
function normalise(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

/**
 * Split a paste or file that may hold several games into one string per game.
 * A new game starts at:
 * - a tag line whose previous non-blank line is not a tag line, or
 * - a movetext line starting with a move number (`1.`) whose previous non-blank
 *   line ends with a game-termination marker (`1-0`, `0-1`, `1/2-1/2`, `*`),
 *   so headerless games in a multi-game paste are split too.
 */
export function splitPgnGames(text: string): string[] {
  const lines = normalise(text).split('\n')
  const games: string[][] = []
  let current: string[] = []
  let prevNonBlankIsTag: boolean | null = null
  let prevNonBlankEndsGame = false

  for (const line of lines) {
    const isTag = TAG_LINE.test(line)
    const startsMovetext = MOVETEXT_START.test(line)
    const startsNewGame =
      (isTag && prevNonBlankIsTag === false) || (startsMovetext && prevNonBlankEndsGame)
    if (startsNewGame && current.some((l) => l.trim() !== '')) {
      games.push(current)
      current = []
    }
    current.push(line)
    if (line.trim() !== '') {
      prevNonBlankIsTag = isTag
      prevNonBlankEndsGame = !isTag && TERMINATION_AT_END.test(line)
    }
  }
  games.push(current)

  return games.map((g) => g.join('\n').trim()).filter((g) => g !== '')
}

/** Parse `[%clk h:mm:ss(.f)]` (or `m:ss`) from a comment into seconds. */
export function parseClock(comment: string): number | undefined {
  const match = CLOCK.exec(comment)
  if (!match) return undefined
  const parts = match[1].split(':').map(Number)
  if (parts.some((p) => Number.isNaN(p))) return undefined
  const seconds = parts.reduce((total, part) => total * 60 + part, 0)
  return Math.round(seconds * 1000) / 1000
}

/** Remove `[%...]` commands and surrounding whitespace; undefined if nothing is left. */
function cleanComment(comment: string): string | undefined {
  const text = comment.replace(COMMAND, '').replace(/\s+/g, ' ').trim()
  return text === '' ? undefined : text
}

function known(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const v = value.trim()
  if (v === '' || v === '?' || v === '????.??.??') return undefined
  return v
}

function toInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) ? n : undefined
}

function buildHeaders(tags: Record<string, string>): GameHeaders {
  const raw: Record<string, string> = {}
  for (const [key, value] of Object.entries(tags)) {
    const v = known(value)
    if (v !== undefined) raw[key] = v
  }
  const result = raw.Result
  return {
    white: raw.White,
    black: raw.Black,
    whiteElo: toInt(raw.WhiteElo),
    blackElo: toInt(raw.BlackElo),
    result: RESULTS.includes(result as GameResult) ? (result as GameResult) : undefined,
    date: raw.Date,
    event: raw.Event,
    site: raw.Site,
    timeControl: raw.TimeControl,
    termination: raw.Termination,
    eco: raw.ECO,
    opening: raw.Opening,
    raw,
  }
}

/** Small, stable string hash (FNV-1a, 32-bit) used as a game id. */
function hash(text: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** An error with a user-readable message plus the raw parser text for details. */
class PgnError extends Error {
  readonly detail?: string
  constructor(message: string, detail?: string) {
    super(message)
    this.name = 'PgnError'
    this.detail = detail
  }
}

function toPgnError(err: unknown): PgnError {
  const message = err instanceof Error ? err.message : String(err)
  const illegal = /Invalid move in PGN:\s*(\S+)/.exec(message)
  // chess.js reports any unknown word as an invalid move; only call it an
  // illegal move when the token actually looks like chess notation.
  if (illegal && SAN_LIKE.test(illegal[1])) return new PgnError(`Illegal move "${illegal[1]}"`, message)
  return new PgnError(UNREADABLE, message)
}

const NO_MOVES = 'No moves found'
export const EMPTY_INPUT = 'Paste a PGN or upload a .pgn file first.'
export const UNREADABLE = "Couldn't read this as a chess game. Check that it is in PGN format."

export interface ParseGameOptions {
  /** Defaults to `'pgn'`. */
  source?: ImportSource
  /** Defaults to a hash of the PGN text. */
  id?: string
}

/**
 * Parse one game. Throws an Error with a user-readable message on failure.
 * Online sources pass their own `source` and `id` so the game keeps a stable identity.
 */
export function parseGame(pgn: string, options: ParseGameOptions = {}): ImportedGame {
  const chess = new Chess()
  try {
    chess.loadPgn(pgn)
  } catch (err) {
    throw toPgnError(err)
  }

  const history = chess.history({ verbose: true })
  if (history.length === 0) throw new PgnError(NO_MOVES)

  const comments = new Map<string, string>()
  for (const { fen, comment } of chess.getComments()) comments.set(fen, comment)

  const moves: ImportedMove[] = history.map((m, i) => {
    const rawComment = comments.get(m.after)
    const fullMove = Number(m.before.split(' ')[5]) || 1
    const move: ImportedMove = {
      ply: i + 1,
      moveNumber: fullMove,
      color: m.color,
      san: m.san,
      lan: m.lan,
      from: m.from,
      to: m.to,
      fenBefore: m.before,
      fenAfter: m.after,
    }
    if (m.promotion) move.promotion = m.promotion as ImportedMove['promotion']
    if (rawComment !== undefined) {
      const comment = cleanComment(rawComment)
      const clock = parseClock(rawComment)
      if (comment !== undefined) move.comment = comment
      if (clock !== undefined) move.clockSeconds = clock
    }
    return move
  })

  const headers = buildHeaders(chess.getHeaders())
  return {
    id: options.id ?? hash(pgn),
    source: options.source ?? 'pgn',
    headers,
    startFen: moves[0]?.fenBefore ?? headers.raw.FEN ?? START_FEN,
    moves,
    pgn,
  }
}

/**
 * Parse pasted or uploaded PGN text that may contain one or more games.
 * Returns `ok: false` only if no game could be parsed.
 */
export function parsePgn(text: string): ImportResult {
  const parts = splitPgnGames(text)
  if (parts.length === 0) return { ok: false, error: EMPTY_INPUT }

  const games: ImportedGame[] = []
  const skipped: { index: number; error: string; detail?: string }[] = []
  parts.forEach((part, index) => {
    try {
      games.push(parseGame(part))
    } catch (err) {
      const e = err instanceof PgnError ? err : toPgnError(err)
      skipped.push(e.detail === undefined ? { index, error: e.message } : { index, error: e.message, detail: e.detail })
    }
  })

  if (games.length === 0) {
    const first = skipped[0]
    const error = parts.length > 1 ? `No games could be read. Game 1: ${first.error}` : first.error
    return first.detail === undefined ? { ok: false, error } : { ok: false, error, detail: first.detail }
  }
  return { ok: true, games, skipped }
}
