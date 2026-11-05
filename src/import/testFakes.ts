/** Test doubles for the online sources: a scripted `fetch` and a Map-backed `Storage`. */
import type { FetchLike, StorageLike } from './types'

export interface FakeReply {
  status?: number
  body?: unknown
  /** Raw body text; overrides `body`. */
  text?: string
  /** Make fetch itself reject (like a CORS or DNS failure). */
  throws?: Error
}

export interface FakeFetch {
  fetch: FetchLike
  calls: string[]
  /** Highest number of requests in flight at once. */
  maxConcurrent: number
}

/** `routes` maps a URL (or a URL prefix ending in `*`) to a reply. Unknown URLs get a 404. */
export function fakeFetch(routes: Record<string, FakeReply | (() => FakeReply)>): FakeFetch {
  const state: FakeFetch = { fetch: undefined as unknown as FetchLike, calls: [], maxConcurrent: 0 }
  let inFlight = 0
  const find = (url: string): FakeReply | undefined => {
    const exact = routes[url]
    if (exact) return typeof exact === 'function' ? exact() : exact
    for (const [pattern, reply] of Object.entries(routes)) {
      if (pattern.endsWith('*') && url.startsWith(pattern.slice(0, -1))) {
        return typeof reply === 'function' ? reply() : reply
      }
    }
    return undefined
  }
  state.fetch = async (url, init) => {
    state.calls.push(url)
    inFlight++
    state.maxConcurrent = Math.max(state.maxConcurrent, inFlight)
    try {
      // Yield so overlapping requests (if any) would be observed.
      await new Promise((resolve) => setTimeout(resolve, 0))
      if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const reply = find(url) ?? { status: 404, body: { message: 'not found' } }
      if (reply.throws) throw reply.throws
      const status = reply.status ?? 200
      const text = reply.text ?? JSON.stringify(reply.body ?? {})
      return { ok: status >= 200 && status < 300, status, text: async () => text }
    } finally {
      inFlight--
    }
  }
  return state
}

export class MapStorage implements StorageLike {
  readonly map = new Map<string, string>()
  /** When set, `setItem` throws a quota error. */
  failWrites = false

  get length(): number {
    return this.map.size
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null
  }
  getItem(key: string): string | null {
    return this.map.get(key) ?? null
  }
  setItem(key: string, value: string): void {
    if (this.failWrites) throw new DOMException('Quota exceeded', 'QuotaExceededError')
    this.map.set(key, value)
  }
  removeItem(key: string): void {
    this.map.delete(key)
  }
}
