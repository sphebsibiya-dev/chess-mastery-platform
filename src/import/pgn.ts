import { Chess } from 'chess.js'
import { START_FEN } from '../chess/constants'
import type { GameHeaders, GameResult, ImportedGame, ImportedMove, ImportResult } from './types'

const TAG_LINE = /^\s*\[\w+\s+"/
const CLOCK = /\[%clk\s+(\d+(?::\d+){1,2}(?:\.\d+)?)\s*\]/
const COMMAND = /\[%[^\]]*\]/g
const RESULTS: readonly GameResult[] = ['1-0', '0-1', '1/2-1/2', '*']

/** Normalise line endings to `\n`. */
function normalise(text: string): string {
  return text.replace(/\r\n?/g, '\n')
}

/**
 * Split a paste or file that may hold several games into one string per game.
 * A new game starts at a tag line whose previous non-blank line is not a tag line.
 */
export function splitPgnGames(text: string): string[] {
  const lines = normalise(text).split('\n')
  const games: string[][] = []
  let current: string[] = []
  let prevNonBlankIsTag: boolean | null = null

  for (const line of lines) {
    const isTag = TAG_LINE.test(line)
    if (isTag && prevNonBlankIsTag === false && current.some((l) => l.trim() !== '')) {
      games.push(current)
      current = []
    }
    current.push(line)
    if (line.trim() !== '') prevNonBlankIsTag = isTag
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

function friendlyError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  const illegal = /Invalid move in PGN:\s*(\S+)/.exec(message)
  if (illegal) return `Illegal move "${illegal[1]}"`
  const snippet = message.length > 80 ? `${message.slice(0, 77)}...` : message
  return `Couldn't read this PGN (${snippet})`
}

const NO_MOVES = 'No moves found'

/** Parse one game. Throws an Error with a user-readable message on failure. */
function parseSingleGame(pgn: string): ImportedGame {
  const chess = new Chess()
  try {
    chess.loadPgn(pgn)
  } catch (err) {
    throw new Error(friendlyError(err))
  }

  const history = chess.history({ verbose: true })
  if (history.length === 0) throw new Error(NO_MOVES)

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
    id: hash(pgn),
    source: 'pgn',
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
  if (parts.length === 0) return { ok: false, error: NO_MOVES }

  const games: ImportedGame[] = []
  const skipped: { index: number; error: string }[] = []
  parts.forEach((part, index) => {
    try {
      games.push(parseSingleGame(part))
    } catch (err) {
      skipped.push({ index, error: err instanceof Error ? err.message : String(err) })
    }
  })

  if (games.length === 0) {
    const first = skipped[0]?.error ?? NO_MOVES
    const error = parts.length > 1 ? `No games could be read. Game 1: ${first}` : first
    return { ok: false, error }
  }
  return { ok: true, games, skipped }
}
