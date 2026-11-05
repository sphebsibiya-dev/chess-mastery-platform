import type { StorageLike } from './types'

/** Every key this app writes to storage starts with this. */
export const KEY_PREFIX = 'mogfish:'
/** Cached chess.com months: `mogfish:chesscom:<user>:<YYYY-MM>`. Only these are ever evicted. */
const EVICTABLE = /^mogfish:chesscom:[^:]+:(\d{4}-\d{2})$/
/**
 * Entries longer than this (UTF-16 code units, ~half a typical 5 MB quota) are
 * kept in memory only, so one huge month can't push every other month out.
 */
export const MAX_PERSIST_CHARS = 2_500_000

interface MemoryEntry {
  value: unknown
  /** ms epoch, or undefined for no expiry. */
  expires?: number
}

export interface ArchiveCacheOptions {
  /** localStorage, or null for memory only (e.g. storage blocked). */
  storage: StorageLike | null
  now?: () => number
}

/**
 * Two-level cache for online game archives:
 * - `persist` entries (past chess.com months, which never change) go to storage
 *   and memory.
 * - other entries (archive list, current month) stay in memory with a TTL.
 * Storage failures (quota, privacy mode) never throw; data stays in memory.
 * On a quota error, cached chess.com months are evicted oldest month first until
 * the write fits; other `mogfish:` keys are never touched.
 */
export class ArchiveCache {
  private readonly storage: StorageLike | null
  private readonly now: () => number
  private readonly memory = new Map<string, MemoryEntry>()

  constructor({ storage, now = Date.now }: ArchiveCacheOptions) {
    this.storage = storage
    this.now = now
  }

  get<T>(key: string): T | undefined {
    const entry = this.memory.get(key)
    if (entry) {
      if (entry.expires === undefined || entry.expires > this.now()) return entry.value as T
      this.memory.delete(key)
    }
    const stored = this.readStorage(key)
    if (stored !== undefined) {
      this.memory.set(key, { value: stored })
      return stored as T
    }
    return undefined
  }

  /** Keep in memory for `ttlMs`. */
  setTemporary(key: string, value: unknown, ttlMs: number): void {
    this.memory.set(key, { value, expires: this.now() + ttlMs })
  }

  /** Keep in memory and storage with no expiry. */
  setPersistent(key: string, value: unknown): void {
    this.memory.set(key, { value })
    if (!this.storage) return
    let text: string
    try {
      text = JSON.stringify(value)
    } catch {
      return
    }
    if (text.length > MAX_PERSIST_CHARS) return
    if (this.tryWrite(key, text)) return
    // Probably over quota: evict the oldest cached month and retry, until it fits
    // or nothing evictable is left (then it stays in memory only).
    for (const victim of this.evictionOrder(key)) {
      try {
        this.storage.removeItem(victim)
      } catch {
        return
      }
      if (this.tryWrite(key, text)) return
    }
  }

  private readStorage(key: string): unknown {
    if (!this.storage) return undefined
    try {
      const text = this.storage.getItem(key)
      return text === null ? undefined : (JSON.parse(text) as unknown)
    } catch {
      return undefined
    }
  }

  private tryWrite(key: string, text: string): boolean {
    try {
      this.storage?.setItem(key, text)
      return true
    } catch {
      return false
    }
  }

  /** Cached month keys other than `keep`, oldest month first (ties by key). */
  private evictionOrder(keep: string): string[] {
    const storage = this.storage
    if (!storage) return []
    const months: { key: string; month: string }[] = []
    try {
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i)
        const match = k === null || k === keep ? null : EVICTABLE.exec(k)
        if (k !== null && match) months.push({ key: k, month: match[1] })
      }
    } catch {
      return []
    }
    return months
      .sort((a, b) => (a.month === b.month ? (a.key < b.key ? -1 : 1) : a.month < b.month ? -1 : 1))
      .map((m) => m.key)
  }
}

/** `window.localStorage` if it is usable, else null. */
export function browserStorage(): StorageLike | null {
  try {
    const storage = globalThis.localStorage
    if (!storage) return null
    storage.getItem(`${KEY_PREFIX}probe`) // throws if access is blocked
    return storage
  } catch {
    return null
  }
}
