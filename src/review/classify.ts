import { Chess } from 'chess.js'
import { balanceOf } from '../chess/material'
import { uciToSan, uciToSquares } from '../chess/uci'
import type { AnalysisLine, Eval, GameAnalysis } from '../engine/types'
import type { ImportedGame, ImportedMove } from '../import/types'
import { accuracyFromLoss, gameAccuracy } from './accuracy'
import { bookPrefix, type Opening, type OpeningBook } from './openings/book'
import type { MoveClass, MoveReview, SideAccuracy } from './types'
import { moverWinPercent, winPercent } from './winProbability'

/**
 * Win% loss thresholds (mover's POV, 0..100 scale). A move whose loss is below
 * a threshold gets that class; anything at or above MISTAKE is a blunder.
 * Exported so they can be tuned later.
 */
export const EXCELLENT_MAX_LOSS = 2
export const GOOD_MAX_LOSS = 5
export const INACCURACY_MAX_LOSS = 10
export const MISTAKE_MAX_LOSS = 20

/*
 * Brilliant / Great / Miss. chess.com's rules are private; these are our own
 * documented approximations. All on the 0..100 win% scale unless noted.
 */
/** Brilliant and Great need the mover's win% before the move to be below this (not already totally winning). */
export const ALREADY_WINNING_WP = 95
/** Brilliant: material (in pawns) the mover must give up along the engine line. */
export const BRILLIANT_MIN_SACRIFICE = 2
/** Brilliant: the mover's win% after the move must be at least this. */
export const BRILLIANT_MIN_WP_AFTER = 50
/** Brilliant: plies of the engine line after the move that are replayed (opponent replies 1 and 3). */
export const BRILLIANT_PV_PLIES = 4
/** Great: the best line must be at least this much win% better than the second-best line. */
export const GREAT_MIN_GAP = 15
/**
 * Book: a book move only counts as `book` while it loses less than this. The
 * opening list includes trap lines (e.g. "Barnes Opening: Fool's Mate"), and a
 * losing move there must still be called out. Such a move ends the book run.
 */
export const BOOK_MAX_LOSS = INACCURACY_MAX_LOSS
/** Miss: the opponent's previous move must have lost at least this much... */
export const MISS_MIN_GIFT = 20
/** ...and this move gives back at least this fraction of it (and at least `INACCURACY_MAX_LOSS`). */
export const MISS_MIN_GIVEBACK = 0.5

export function classForLoss(loss: number): 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' {
  if (loss < EXCELLENT_MAX_LOSS) return 'excellent'
  if (loss < GOOD_MAX_LOSS) return 'good'
  if (loss < INACCURACY_MAX_LOSS) return 'inaccuracy'
  if (loss < MISTAKE_MAX_LOSS) return 'mistake'
  return 'blunder'
}

export interface ClassifyInput {
  move: Pick<ImportedMove, 'ply' | 'color' | 'lan' | 'fenBefore'>
  /** Eval of the position before the move (best play), White POV. */
  before: Eval
  /** Eval of the position after the move, White POV. */
  after: Eval
  /** Engine best move (UCI) in the position before the move. */
  bestMove?: string
  /** Top engine lines from the position before the move, best first (for Great). */
  lines?: readonly AnalysisLine[]
  /** Engine line (UCI) from the position after the move (for Brilliant). */
  pvAfter?: readonly string[]
  /** The move is part of the game's leading run of book moves (it is `book` only if its loss is below `BOOK_MAX_LOSS`). */
  inBook?: boolean
  /** The game's previous move and its review (for Miss and the recapture guard on Great). */
  prevMove?: Pick<ImportedMove, 'color' | 'to' | 'san'>
  prevReview?: Pick<MoveReview, 'loss'>
}

/**
 * Brilliant: while captures continue, the engine line is replayed past
 * `BRILLIANT_PV_PLIES`, up to this many plies (so an exchange is seen to its end).
 */
export const BRILLIANT_MAX_PV_PLIES = 10

/**
 * Material the mover gives up along the engine line: the mover's material
 * balance before the move minus the best balance it reaches along `pvAfter`.
 * The line is replayed for `BRILLIANT_PV_PLIES` plies, and further (up to
 * `BRILLIANT_MAX_PV_PLIES`) while the last ply was a capture, so an exchange is
 * followed until it stops. The balance is read each time it is the mover's turn
 * and once more at the end of the replayed line (which catches the mover's own
 * final recapture). Taking the best balance means material won back is a trade,
 * not a sacrifice. Undefined if the opponent has no reply in the line (or the
 * move is illegal).
 */
export function sacrificedMaterial(
  fenBefore: string,
  lan: string,
  color: 'w' | 'b',
  pvAfter: readonly string[],
): number | undefined {
  const chess = new Chess(fenBefore)
  const before = balanceOf(chess, color)
  /** Plays a UCI move; returns whether it captured, or undefined if it is illegal. */
  const play = (uci: string): boolean | undefined => {
    const squares = uciToSquares(uci)
    if (!squares) return undefined
    try {
      return chess.move(squares).isCapture()
    } catch {
      return undefined
    }
  }
  if (play(lan) === undefined) return undefined
  let best: number | undefined
  const sample = () => {
    const balance = balanceOf(chess, color)
    best = best === undefined ? balance : Math.max(best, balance)
  }
  let played = 0
  let lastWasCapture = false
  for (const uci of pvAfter) {
    if (played >= BRILLIANT_MAX_PV_PLIES) break
    if (played >= BRILLIANT_PV_PLIES && !lastWasCapture) break
    const captured = play(uci)
    if (captured === undefined) break
    played++
    lastWasCapture = captured
    if (chess.turn() === color) sample()
  }
  if (played === 0) return undefined
  sample()
  return before - (best as number)
}

/** The move recaptures on the square where the opponent just captured. */
function isRecapture(lan: string, prevMove: ClassifyInput['prevMove']): boolean {
  return !!prevMove && prevMove.san.includes('x') && prevMove.to === lan.slice(2, 4)
}

/**
 * Classifies one move. Precedence, first match wins:
 * 1. `forced`: the only legal move.
 * 2. `book`: part of the game's leading run of opening-book moves, with a loss
 *    below `BOOK_MAX_LOSS` (otherwise it is classified as if out of book).
 * 3. `brilliant`: a good move (loss < `EXCELLENT_MAX_LOSS`, or the engine's best
 *    move) that gives up at least `BRILLIANT_MIN_SACRIFICE` points along the
 *    engine line, leaves the mover at >= `BRILLIANT_MIN_WP_AFTER` and was not
 *    played from an already winning position.
 * 4. `great`: the played move's engine line is at least `GREAT_MIN_GAP` better
 *    than the best other line (the only good move), not already winning, and not a
 *    recapture on the square the opponent just captured on (those are nearly
 *    always the only good move and would make Great meaningless).
 * 5. `best`: the engine's best move (even if eval noise shows a small loss).
 * 6. `miss`: the opponent's previous move gave away at least `MISS_MIN_GIFT` and
 *    this move gives back at least half of it (replaces inaccuracy, mistake or blunder).
 * 7. Otherwise by the mover's win% loss, see `classForLoss`.
 * Accuracy is loss-based whatever the class; forced and book moves count as 100.
 */
export function classifyMove({
  move,
  before,
  after,
  bestMove,
  lines,
  pvAfter,
  inBook,
  prevMove,
  prevReview,
}: ClassifyInput): MoveReview {
  const wpBefore = moverWinPercent(before, move.color)
  const wpAfter = moverWinPercent(after, move.color)
  const loss = Math.max(0, wpBefore - wpAfter)
  const legalMoves = new Chess(move.fenBefore).moves().length
  const isBest = bestMove !== undefined && move.lan === bestMove
  const notWinning = wpBefore < ALREADY_WINNING_WP

  const brilliant = (): boolean => {
    if (!notWinning || wpAfter < BRILLIANT_MIN_WP_AFTER) return false
    if (!isBest && loss >= EXCELLENT_MAX_LOSS) return false
    const sacrifice = sacrificedMaterial(move.fenBefore, move.lan, move.color, pvAfter ?? [])
    return sacrifice !== undefined && sacrifice >= BRILLIANT_MIN_SACRIFICE
  }

  const great = (): boolean => {
    if (!notWinning || !lines) return false
    // Compare the played move's line with the best other line, without assuming
    // lines[0] is the played move: the two-line re-search can rank the top
    // moves differently from the first search.
    const played = lines.find((l) => l.move === move.lan)
    const others = lines.filter((l) => l.move !== move.lan)
    if (!played || others.length === 0) return false
    const playedWp = moverWinPercent(played.eval, move.color)
    const bestOtherWp = Math.max(...others.map((l) => moverWinPercent(l.eval, move.color)))
    return playedWp - bestOtherWp >= GREAT_MIN_GAP && !isRecapture(move.lan, prevMove)
  }

  const miss = (): boolean =>
    !!prevMove &&
    !!prevReview &&
    prevMove.color !== move.color &&
    prevReview.loss >= MISS_MIN_GIFT &&
    loss >= MISS_MIN_GIVEBACK * prevReview.loss &&
    loss >= INACCURACY_MAX_LOSS

  let cls: MoveClass
  if (legalMoves === 1) cls = 'forced'
  else if (inBook && loss < BOOK_MAX_LOSS) cls = 'book'
  else if (brilliant()) cls = 'brilliant'
  else if (great()) cls = 'great'
  else if (isBest) cls = 'best'
  else if (miss()) cls = 'miss'
  else cls = classForLoss(loss)

  const review: MoveReview = {
    ply: move.ply,
    cls,
    wpBefore,
    wpAfter,
    loss,
    accuracy: cls === 'forced' || cls === 'book' ? 100 : accuracyFromLoss(loss),
  }
  const bestMoveSan = bestMove ? uciToSan(move.fenBefore, bestMove) : undefined
  if (bestMoveSan) review.bestMoveSan = bestMoveSan
  return review
}

export interface GameReview {
  reviews: MoveReview[]
  accuracy: SideAccuracy
  /**
   * The deepest named opening reached within the game's book moves (the run ends
   * at the first move that is out of book or loses `BOOK_MAX_LOSS` or more).
   * Only set when a book is given.
   */
  opening?: Opening
}

export interface ClassifyGameOptions {
  /** Opening book; without it no move is `book` and no opening is returned. */
  book?: OpeningBook
}

/** Classifies every move and computes each side's accuracy. */
export function classifyGame(
  game: ImportedGame,
  analysis: GameAnalysis,
  { book }: ClassifyGameOptions = {},
): GameReview {
  const { positions } = analysis
  if (positions.length !== game.moves.length + 1) {
    throw new Error(`Expected ${game.moves.length + 1} positions, got ${positions.length}`)
  }
  // Positions alone give the longest possible book run; it ends earlier at the
  // first book move that loses too much (forced moves inside the book keep it going).
  let bookPlies = book ? bookPrefix(game, book).plies : 0

  const reviews: MoveReview[] = []
  for (const [i, move] of game.moves.entries()) {
    const inBook = i < bookPlies
    const review = classifyMove({
      move,
      before: positions[i].eval,
      after: positions[i + 1].eval,
      bestMove: positions[i].bestMove,
      lines: positions[i].lines,
      pvAfter: positions[i + 1].pv,
      inBook,
      prevMove: game.moves[i - 1],
      prevReview: reviews[i - 1],
    })
    if (inBook && review.cls !== 'book' && review.cls !== 'forced') bookPlies = i
    reviews.push(review)
  }
  const accuracy = gameAccuracy(
    positions.map((p) => winPercent(p.eval)),
    reviews.map((r, i) => ({ color: game.moves[i].color, accuracy: r.accuracy })),
  )
  const result: GameReview = { reviews, accuracy }
  const bookMoves = { startFen: game.startFen, moves: game.moves.slice(0, bookPlies) }
  const opening = book ? bookPrefix(bookMoves, book).opening : undefined
  if (opening) result.opening = opening
  return result
}
