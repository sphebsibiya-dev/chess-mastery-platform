import type { UciScore } from './types'

export interface UciInfo {
  depth: number
  /** MultiPV index, 1 = best line. 1 when the token is missing. */
  multipv: number
  score: UciScore
  pv: string[]
}

/**
 * Parses a UCI `info` line that carries a usable score.
 * Returns null for anything else: non-info lines, `info string`, lines without
 * depth or score, bound-only scores (`lowerbound`/`upperbound`, which are not
 * exact). Secondary MultiPV lines are kept with their `multipv` index.
 */
export function parseInfo(line: string): UciInfo | null {
  const tokens = line.trim().split(/\s+/)
  if (tokens[0] !== 'info') return null

  let depth: number | undefined
  let multipv = 1
  let score: UciScore | undefined
  let pv: string[] = []

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i]
    switch (token) {
      case 'string':
        // The rest of the line is free text.
        return null
      case 'depth':
        depth = Number(tokens[++i])
        break
      case 'multipv':
        multipv = Number(tokens[++i])
        if (!Number.isInteger(multipv) || multipv < 1) return null
        break
      case 'score': {
        const type = tokens[++i]
        const value = Number(tokens[++i])
        if ((type !== 'cp' && type !== 'mate') || !Number.isFinite(value)) return null
        score = { type, value }
        break
      }
      case 'lowerbound':
      case 'upperbound':
        return null
      case 'pv':
        pv = tokens.slice(i + 1)
        i = tokens.length
        break
    }
  }

  if (depth === undefined || !Number.isFinite(depth) || !score) return null
  return { depth, multipv, score, pv }
}

/**
 * Parses a `bestmove` line. Returns null if the line is not a bestmove line.
 * `bestMove` is undefined for `bestmove (none)` (no legal moves).
 */
export function parseBestMove(line: string): { bestMove: string | undefined } | null {
  const tokens = line.trim().split(/\s+/)
  if (tokens[0] !== 'bestmove') return null
  const move = tokens[1]
  return { bestMove: move && move !== '(none)' && move !== '0000' ? move : undefined }
}
