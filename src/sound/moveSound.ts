import type { Move } from 'chess.js'

export type MoveSound = 'move' | 'capture' | 'castle' | 'check'

const SOUND_PATHS: Record<MoveSound, string> = {
  move: '/sounds/move.wav',
  capture: '/sounds/capture.wav',
  castle: '/sounds/castle.wav',
  check: '/sounds/check.wav',
}

const audio = new Map<MoveSound, HTMLAudioElement>()
let muted = false

function soundFor(move: Pick<Move, 'flags'>, inCheck: boolean): MoveSound {
  if (inCheck) return 'check'
  if (move.flags.includes('k') || move.flags.includes('q')) return 'castle'
  if (move.flags.includes('c') || move.flags.includes('e')) return 'capture'
  return 'move'
}

function getAudio(kind: MoveSound): HTMLAudioElement {
  let element = audio.get(kind)
  if (!element) {
    element = new Audio(SOUND_PATHS[kind])
    element.preload = 'auto'
    audio.set(kind, element)
  }
  return element
}

export function moveSoundKind(move: Pick<Move, 'flags'>, inCheck: boolean): MoveSound {
  return soundFor(move, inCheck)
}

export function setSoundMuted(value: boolean): void {
  muted = value
}

export function isSoundMuted(): boolean {
  return muted
}

/** Plays only after a caller's user gesture or an established navigation interaction. */
export function playMoveSound(move: Pick<Move, 'flags'>, inCheck: boolean): void {
  if (muted || typeof window === 'undefined') return
  const element = getAudio(soundFor(move, inCheck))
  element.currentTime = 0
  void element.play().catch(() => undefined)
}

