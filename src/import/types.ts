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
}

export type ImportResult =
  | { ok: true; games: ImportedGame[]; skipped: { index: number; error: string }[] }
  | { ok: false; error: string }
