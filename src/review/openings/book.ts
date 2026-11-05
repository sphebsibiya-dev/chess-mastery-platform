import { START_FEN } from '../../chess/constants'
import type { ImportedGame } from '../../import/types'

/** A named opening from the Lichess `chess-openings` list. */
export interface Opening {
  /** ECO code, e.g. 'C60'. */
  eco: string
  /** e.g. 'Ruy Lopez' or 'Sicilian Defense: Najdorf Variation'. */
  name: string
}

/**
 * Book positions keyed by `positionKey`. The value is the opening named at that
 * exact position, or null for a book position without a name of its own (an
 * intermediate position of a longer named line).
 */
export type OpeningBook = ReadonlyMap<string, Opening | null>

/**
 * The part of a FEN that identifies a book position: placement, side to move and
 * castling rights. The en-passant square and the move clocks are dropped so FENs
 * from chess.js and from imported games always match.
 */
export function positionKey(fen: string): string {
  return fen.trim().split(/\s+/).slice(0, 3).join(' ')
}

/** Undoes the generator's front coding (2 base-36 digits of shared prefix, then the rest). */
function frontDecode(text: string): string[] {
  const out: string[] = []
  let prev = ''
  for (const line of text.split('\n')) {
    if (!line) continue
    const shared = parseInt(line.slice(0, 2), 36)
    prev = prev.slice(0, shared) + line.slice(2)
    out.push(prev)
  }
  return out
}

/**
 * Decodes the generated data (see the header of `openings.generated.ts`).
 * Each line of `positions` is a front-coded key, optionally followed by a tab and
 * a base-36 index into `names`.
 */
export function parseBook(names: string, positions: string): Map<string, Opening | null> {
  const openings: Opening[] = frontDecode(names).map((entry) => {
    const [name, eco] = entry.split('\t')
    return { eco, name }
  })
  const book = new Map<string, Opening | null>()
  let prev = ''
  for (const line of positions.split('\n')) {
    if (!line) continue
    const tab = line.indexOf('\t')
    const coded = tab < 0 ? line : line.slice(0, tab)
    const key = prev.slice(0, parseInt(coded.slice(0, 2), 36)) + coded.slice(2)
    prev = key
    const opening = tab < 0 ? null : openings[parseInt(line.slice(tab + 1), 36)]
    if (opening === undefined) throw new Error(`Bad opening index in book line: ${line}`)
    book.set(key, opening)
  }
  return book
}

/** The generated data module's exports. */
export interface BookData {
  OPENING_NAMES: string
  OPENING_POSITIONS: string
}

/**
 * Makes a memoised book loader around `importData`. A failed load is not
 * memoised, so the next call tries again.
 */
export function createBookLoader(importData: () => Promise<BookData>): () => Promise<OpeningBook> {
  let loading: Promise<OpeningBook> | null = null
  return () => {
    if (!loading) {
      const attempt = importData().then(({ OPENING_NAMES, OPENING_POSITIONS }) =>
        parseBook(OPENING_NAMES, OPENING_POSITIONS),
      )
      loading = attempt
      attempt.catch(() => {
        if (loading === attempt) loading = null
      })
    }
    return loading
  }
}

/**
 * Loads the bundled opening book. The data is a separate, lazily loaded chunk
 * (no network request beyond our own bundle); the result is memoised.
 */
export const loadOpeningBook: () => Promise<OpeningBook> = createBookLoader(() => import('./openings.generated'))

/**
 * Loads the book for a review, or resolves to undefined (with a console warning)
 * if it cannot be loaded, so the review simply has no book moves.
 */
export async function loadOpeningBookOrNone(
  load: () => Promise<OpeningBook> = loadOpeningBook,
): Promise<OpeningBook | undefined> {
  try {
    return await load()
  } catch (err) {
    console.warn('Opening book failed to load; reviewing without book moves.', err)
    return undefined
  }
}

export interface BookPrefix {
  /** Number of leading moves (plies) whose resulting position is in the book. */
  plies: number
  /** The deepest named opening reached within those plies. */
  opening?: Opening
}

/**
 * How far a game follows the book: the leading run of moves whose position
 * after the move is a book position. The run is based on positions only, so
 * transpositions count and a forced move inside the book does not break it.
 * Games that start from a custom position have no book moves.
 */
export function bookPrefix(game: Pick<ImportedGame, 'startFen' | 'moves'>, book: OpeningBook): BookPrefix {
  if (positionKey(game.startFen) !== positionKey(START_FEN)) return { plies: 0 }
  let plies = 0
  let opening: Opening | undefined
  for (const move of game.moves) {
    const key = positionKey(move.fenAfter)
    if (!book.has(key)) break
    plies++
    opening = book.get(key) ?? opening
  }
  return opening ? { plies, opening } : { plies }
}
