/** A score as Stockfish reports it: from the side to move's point of view. */
export type UciScore = { type: 'cp' | 'mate'; value: number }

/**
 * An evaluation, always from White's point of view.
 * - `cp`: centipawns, positive is good for White.
 * - `mate`: forced mate; `in` is moves (not plies), 0 means checkmate is on the board.
 * - `draw`: stalemate, insufficient material etc. on the board.
 */
export type Eval =
  | { kind: 'cp'; cp: number }
  | { kind: 'mate'; in: number; winner: 'w' | 'b' }
  | { kind: 'draw' }

/** One engine line (MultiPV entry), side-to-move POV like `EngineResult.score`. */
export interface EngineLine {
  /** First move of the line, UCI notation. */
  move: string
  score: UciScore
  pv: string[]
}

/** One engine line from a position, White POV. */
export interface AnalysisLine {
  move: string
  eval: Eval
  pv: string[]
}

/** Raw engine result for one position, side-to-move POV. */
export interface EngineResult {
  score: UciScore
  /** Best move in UCI notation, e.g. 'e2e4'. Undefined when there is no legal move. */
  bestMove?: string
  pv: string[]
  depth: number
  /**
   * The top lines at the final depth, best first. `lines[0]` matches `score`/`pv`.
   * Lines that did not reach the final depth are left out; may be empty when the
   * best line has no PV.
   */
  lines: EngineLine[]
}

export interface AnalyseOptions {
  depth: number
  /** Number of lines to search (UCI `MultiPV`). Default 1. */
  multiPv?: number
  signal?: AbortSignal
}

/** What `analyseGame` needs from an engine. `StockfishEngine` implements it. */
export interface Engine {
  analyse(fen: string, opts: AnalyseOptions): Promise<EngineResult>
  /** Clears engine state between games (`ucinewgame`). */
  newGame?(): Promise<void>
}

export interface PositionAnalysis {
  fen: string
  /** White POV. */
  eval: Eval
  /** UCI best move from this position, if any. */
  bestMove?: string
  pv: string[]
  /** Search depth reached; 0 for positions scored without the engine (mate/draw on the board). */
  depth: number
  /**
   * Top engine lines, best first, White POV. One line normally; two when the move
   * played from here was the engine's best (see `analyseGame`). Empty for positions
   * scored without the engine.
   */
  lines: AnalysisLine[]
}

export interface GameAnalysis {
  gameId: string
  depth: number
  /** Start position plus the position after every move: length = moves.length + 1. */
  positions: PositionAnalysis[]
}
