import type { Arrow } from 'react-chessboard'
import { uciToSquares } from '../chess/uci'
import type { Eval, PositionAnalysis } from '../engine/types'
import type { ImportedMove } from '../import/types'
import type { KeyMoment, KeyMomentKind } from '../review/keyMoments'
import type { GameTimes, MoveTime, TimeFlag } from '../review/timeTrouble'
import type { MoveClass } from '../review/types'
import { formatClockSeconds, formatSpent } from './evalGraphGeometry'

/** Colour of the engine's best-move arrow. */
export const ENGINE_ARROW_COLOR = 'rgba(46, 160, 67, 0.85)'

/** Badge symbol, accessible label, and the phrase used in "Nf3 is …". */
export const CLASS_INFO: Record<MoveClass, { symbol: string; label: string; phrase: string }> = {
  brilliant: { symbol: '!!', label: 'Brilliant', phrase: 'brilliant' },
  great: { symbol: '!', label: 'Great move', phrase: 'a great move' },
  best: { symbol: '★', label: 'Best move', phrase: 'the best move' },
  excellent: { symbol: '+', label: 'Excellent', phrase: 'excellent' },
  good: { symbol: '✓', label: 'Good', phrase: 'good' },
  book: { symbol: '≡', label: 'Book', phrase: 'a book move' },
  inaccuracy: { symbol: '?!', label: 'Inaccuracy', phrase: 'an inaccuracy' },
  mistake: { symbol: '?', label: 'Mistake', phrase: 'a mistake' },
  miss: { symbol: '✕', label: 'Miss', phrase: 'a miss' },
  blunder: { symbol: '??', label: 'Blunder', phrase: 'a blunder' },
  forced: { symbol: '□', label: 'Forced', phrase: 'the only legal move' },
}

/** Classes that never get ", best was X": the move was the best one, the only one, or a book move. */
const NO_BEST_SUFFIX: ReadonlySet<MoveClass> = new Set(['best', 'forced', 'book', 'brilliant', 'great'])

/** Whether the analysis panel should add ", best was X" after the class phrase. */
export function showsBestMove(cls: MoveClass): boolean {
  return !NO_BEST_SUFFIX.has(cls)
}

/**
 * Short eval text, White POV: '+0.35', '-1.20', '0.00', 'M3' (White mates),
 * '-M3' (Black mates), '#' (checkmate on the board), 'Draw'.
 */
export function formatEval(e: Eval): string {
  switch (e.kind) {
    case 'draw':
      return 'Draw'
    case 'mate':
      if (e.in === 0) return '#'
      return `${e.winner === 'w' ? '' : '-'}M${e.in}`
    case 'cp': {
      const pawns = (e.cp / 100).toFixed(2)
      return e.cp > 0 ? `+${pawns}` : e.cp === 0 ? '0.00' : pawns
    }
  }
}

/**
 * The engine's best move in the position at `ply` as a board arrow. Returns an
 * array so other arrow sources (e.g. user drawings) can be concatenated with it.
 */
export function engineArrows(positions: readonly PositionAnalysis[], ply: number): Arrow[] {
  const best = positions[ply]?.bestMove
  const squares = best ? uciToSquares(best) : undefined
  return squares ? [{ startSquare: squares.from, endSquare: squares.to, color: ENGINE_ARROW_COLOR }] : []
}

type MoveRef = Pick<ImportedMove, 'moveNumber' | 'color' | 'san'>

/** '23. Qxb2' for White, '23... Qxb2' for Black. */
export function moveLabel(move: MoveRef): string {
  return `${move.moveNumber}${move.color === 'w' ? '.' : '...'} ${move.san}`
}

export const MOMENT_KIND_LABELS: Record<KeyMomentKind, string> = {
  blunder: 'Blunder',
  'missed-tactic': 'Missed tactic',
  'turning-point': 'Turning point',
}

/**
 * Kinds as one phrase: 'Blunder, turning point'. A move classed `miss` leads
 * with 'Miss' (its label in the move list) instead of 'blunder' / 'missed
 * tactic', so both places use the same word: 'Miss, turning point'.
 */
export function momentKindsText(kinds: readonly KeyMomentKind[], cls?: MoveClass): string {
  const isMiss = cls === 'miss'
  const shown = isMiss ? kinds.filter((k) => k === 'turning-point') : kinds
  const parts = shown.map((k) => MOMENT_KIND_LABELS[k].toLowerCase())
  if (isMiss) parts.unshift(CLASS_INFO.miss.label)
  const text = parts.join(', ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** CSS modifier for a moment row: a miss uses the missed-tactic colour. */
export function momentClass(moment: Pick<KeyMoment, 'kinds' | 'cls'>): string {
  return `moment-${moment.cls === 'miss' ? 'missed-tactic' : moment.kinds[0]}`
}

/** 'White 52% → 18%' (White's win% before and after). */
export function momentSwingText(moment: Pick<KeyMoment, 'whiteWpBefore' | 'whiteWpAfter'>): string {
  return `White ${Math.round(moment.whiteWpBefore)}% → ${Math.round(moment.whiteWpAfter)}%`
}

/** '23... Qxb2 · Blunder, turning point · White 52% → 18% · best Rd1' */
export function momentText(moment: KeyMoment, move: MoveRef): string {
  const parts = [moveLabel(move), momentKindsText(moment.kinds, moment.cls), momentSwingText(moment)]
  if (moment.bestMoveSan && moment.bestMoveSan !== move.san) parts.push(`best ${moment.bestMoveSan}`)
  return parts.join(' · ')
}

export interface TimeBadge {
  flag: TimeFlag
  label: string
}

/** Badge for one move's time flag: 'Low clock: 0:09' or 'Played in 1s (usual 12s)'. */
export function timeBadge(time: MoveTime | undefined, medianSpent: number | undefined): TimeBadge | undefined {
  if (!time) return undefined
  if (time.flags.includes('low-clock') && time.clockSeconds !== undefined) {
    return { flag: 'low-clock', label: `Low clock: ${formatClockSeconds(time.clockSeconds)}` }
  }
  if (time.flags.includes('too-fast') && time.spentSeconds !== undefined) {
    const usual = medianSpent !== undefined ? ` (usual ${formatSpent(medianSpent)})` : ''
    return { flag: 'too-fast', label: `Played in ${formatSpent(time.spentSeconds)}${usual}` }
  }
  return undefined
}

/** One badge (or undefined) per move, index = ply - 1. */
export function timeBadges(
  times: GameTimes,
  moves: readonly Pick<ImportedMove, 'color'>[],
): (TimeBadge | undefined)[] {
  return times.moves.map((t, i) => timeBadge(t, times.medianSpent[moves[i]?.color ?? 'w']))
}

/** 'White in time trouble from move 34 (0:12 left)' */
export function timeTroubleText(move: Pick<ImportedMove, 'moveNumber' | 'color'>, clockSeconds: number): string {
  const side = move.color === 'w' ? 'White' : 'Black'
  return `${side} in time trouble from move ${move.moveNumber} (${formatClockSeconds(clockSeconds)} left)`
}

/** 'Clock 0:12 · took 1s' for the current move; undefined without clock data. */
export function moveClockText(time: MoveTime | undefined): string | undefined {
  if (time?.clockSeconds === undefined) return undefined
  const took = time.spentSeconds !== undefined ? ` · took ${formatSpent(time.spentSeconds)}` : ''
  return `Clock ${formatClockSeconds(time.clockSeconds)}${took}`
}

/** Screen-reader value for the graph slider: '21. Qxb2, -3.40'. */
export function graphValueText(move: MoveRef | undefined, evaluation: Eval | undefined): string {
  const where = move ? moveLabel(move) : 'Start position'
  return `${where}, ${evaluation ? formatEval(evaluation) : 'not analysed yet'}`
}
