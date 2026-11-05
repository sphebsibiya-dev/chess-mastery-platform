import type { StorageLike } from './types'

/** Every key this app writes to storage starts with this. */
export const KEY_PREFIX = 'mogfish:'

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
    if (this.tryWrite(key, text)) return
    // Probably over quota: drop our other keys and try once more.
    this.evictOthers(key)
    this.tryWrite(key, text)
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

  private evictOthers(keep: string): void {
    const storage = this.storage
    if (!storage) return
    try {
      const keys: string[] = []
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i)
        if (k !== null && k.startsWith(KEY_PREFIX) && k !== keep) keys.push(k)
      }
      for (const k of keys) storage.removeItem(k)
    } catch {
      // Storage unusable; memory still has the data.
    }
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
