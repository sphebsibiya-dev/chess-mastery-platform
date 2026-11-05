import { describe, expect, it } from 'vitest'
import { ArchiveCache } from './cache'
import { MapStorage } from './testFakes'

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

  it('evicts older mogfish keys (and only those) to make room', () => {
    const storage = new MapStorage()
    storage.setItem('mogfish:chesscom:a:2020-01', '{}')
    storage.setItem('other-app', 'keep')
    const original = storage.setItem.bind(storage)
    let failures = 1
    storage.setItem = (key: string, value: string) => {
      if (failures-- > 0) throw new DOMException('Quota exceeded', 'QuotaExceededError')
      original(key, value)
    }
    new ArchiveCache({ storage }).setPersistent('mogfish:chesscom:a:2026-10', { x: 1 })
    expect(storage.map.has('mogfish:chesscom:a:2020-01')).toBe(false)
    expect(storage.map.get('other-app')).toBe('keep')
    expect(storage.map.get('mogfish:chesscom:a:2026-10')).toBe('{"x":1}')
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
