import { describe, expect, it } from 'vitest'
import { ArchiveCache, MAX_PERSIST_CHARS } from './cache'
import { MapStorage } from './testFakes'

/** Throws a quota error when the total length of stored values would exceed `capacity`. */
class QuotaStorage extends MapStorage {
  private readonly capacity: number
  constructor(capacity: number) {
    super()
    this.capacity = capacity
  }
  override setItem(key: string, value: string): void {
    let used = value.length
    for (const [k, v] of this.map) if (k !== key) used += v.length
    if (used > this.capacity) throw new DOMException('Quota exceeded', 'QuotaExceededError')
    super.setItem(key, value)
  }
}

describe('ArchiveCache', () => {
  it('reads a persisted entry back from a fresh instance', () => {
    const storage = new MapStorage()
    new ArchiveCache({ storage }).setPersistent('mogfish:chesscom:a:2026-10', { games: [1, 2] })
    expect(new ArchiveCache({ storage }).get('mogfish:chesscom:a:2026-10')).toEqual({ games: [1, 2] })
  })

  it('never persists temporary entries, and expires them after the TTL', () => {
    const storage = new MapStorage()
    let now = 1000
    const cache = new ArchiveCache({ storage, now: () => now })
    cache.setTemporary('mogfish:chesscom:a:2026-11', { games: [] }, 500)
    expect(storage.map.size).toBe(0)
    expect(cache.get('mogfish:chesscom:a:2026-11')).toEqual({ games: [] })
    now = 1499
    expect(cache.get('mogfish:chesscom:a:2026-11')).toBeDefined()
    now = 1500
    expect(cache.get('mogfish:chesscom:a:2026-11')).toBeUndefined()
    expect(new ArchiveCache({ storage }).get('mogfish:chesscom:a:2026-11')).toBeUndefined()
  })

  it('keeps data in memory when storage writes throw (quota)', () => {
    const storage = new MapStorage()
    storage.failWrites = true
    const cache = new ArchiveCache({ storage })
    expect(() => cache.setPersistent('mogfish:chesscom:a:2026-10', { x: 1 })).not.toThrow()
    expect(cache.get('mogfish:chesscom:a:2026-10')).toEqual({ x: 1 })
  })

  it('evicts cached months oldest first, only as many as needed, and never other keys', () => {
    const storage = new QuotaStorage(100)
    storage.setItem('mogfish:settings', 'x'.repeat(10)) // not a cached month: never evicted
    storage.setItem('other-app', 'y'.repeat(10))
    storage.setItem('mogfish:chesscom:bob:2026-03', 'a'.repeat(20))
    storage.setItem('mogfish:chesscom:amy:2025-12', 'b'.repeat(20)) // oldest month, other user
    storage.setItem('mogfish:chesscom:amy:2026-05', 'c'.repeat(20))
    // 80 of 100 used; the 30-char write fits after evicting just the oldest month (20 chars).
    new ArchiveCache({ storage }).setPersistent('mogfish:chesscom:amy:2026-10', 'z'.repeat(28))
    expect([...storage.map.keys()].sort()).toEqual([
      'mogfish:chesscom:amy:2026-05',
      'mogfish:chesscom:amy:2026-10',
      'mogfish:chesscom:bob:2026-03',
      'mogfish:settings',
      'other-app',
    ])
  })

  it('keeps evicting in month order until the write fits', () => {
    const storage = new QuotaStorage(100)
    storage.setItem('mogfish:chesscom:a:2026-01', 'a'.repeat(30))
    storage.setItem('mogfish:chesscom:a:2026-02', 'b'.repeat(30))
    storage.setItem('mogfish:chesscom:a:2026-03', 'c'.repeat(30))
    new ArchiveCache({ storage }).setPersistent('mogfish:chesscom:a:2026-04', 'z'.repeat(48)) // 50 chars as JSON
    expect([...storage.map.keys()].sort()).toEqual(['mogfish:chesscom:a:2026-03', 'mogfish:chesscom:a:2026-04'])
  })

  it('keeps a month that cannot fit in memory only, without touching non-month keys', () => {
    const storage = new QuotaStorage(100)
    storage.setItem('mogfish:settings', 'x'.repeat(60))
    storage.setItem('mogfish:chesscom:a:2026-01', 'a'.repeat(30))
    const cache = new ArchiveCache({ storage })
    cache.setPersistent('mogfish:chesscom:a:2026-02', 'z'.repeat(58)) // 60 chars: can't fit beside settings
    expect(storage.map.has('mogfish:chesscom:a:2026-02')).toBe(false)
    expect(storage.map.has('mogfish:settings')).toBe(true)
    expect(cache.get('mogfish:chesscom:a:2026-02')).toBe('z'.repeat(58))
  })

  it('does not persist (or evict for) an entry over the size limit', () => {
    const storage = new MapStorage()
    storage.setItem('mogfish:chesscom:a:2026-01', '"old"')
    const cache = new ArchiveCache({ storage })
    const huge = 'z'.repeat(MAX_PERSIST_CHARS)
    cache.setPersistent('mogfish:chesscom:a:2026-02', huge)
    expect(storage.map.has('mogfish:chesscom:a:2026-02')).toBe(false)
    expect(storage.map.has('mogfish:chesscom:a:2026-01')).toBe(true)
    expect(cache.get('mogfish:chesscom:a:2026-02')).toBe(huge)
  })

  it('works with no storage at all', () => {
    const cache = new ArchiveCache({ storage: null })
    cache.setPersistent('k', 1)
    expect(cache.get('k')).toBe(1)
  })

  it('ignores corrupt stored JSON', () => {
    const storage = new MapStorage()
    storage.setItem('mogfish:bad', '{not json')
    expect(new ArchiveCache({ storage }).get('mogfish:bad')).toBeUndefined()
  })
})
