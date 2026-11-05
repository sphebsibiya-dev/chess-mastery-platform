import { SourceError, type FetchLike } from './types'

export function abortError(): Error {
  return new DOMException('The request was cancelled.', 'AbortError')
}

export function isAbortError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'AbortError'
}

export function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw abortError()
}

export interface GetTextOptions {
  signal?: AbortSignal
  headers?: Record<string, string>
  /** Site name for messages, e.g. 'chess.com'. */
  site: string
  /** Message for HTTP 404. */
  notFound: string
}

/**
 * GET a URL and return the body text, mapping failures to `SourceError`.
 * Aborts are rethrown as an `AbortError`, never as a `SourceError`.
 */
export async function getText(fetchFn: FetchLike, url: string, options: GetTextOptions): Promise<string> {
  const { signal, headers, site, notFound } = options
  throwIfAborted(signal)
  let response: Awaited<ReturnType<FetchLike>>
  try {
    response = await fetchFn(url, headers ? { signal, headers } : { signal })
  } catch (err) {
    if (isAbortError(err) || signal?.aborted) throw abortError()
    throw new SourceError('network', `Couldn't reach ${site}. Check your connection and try again.`)
  }
  throwIfAborted(signal)
  if (response.status === 404) throw new SourceError('not-found', notFound)
  if (response.status === 429) {
    throw new SourceError('rate-limited', `${site} is limiting requests, try again in a minute.`)
  }
  if (!response.ok) {
    throw new SourceError('bad-response', `${site} returned an error (HTTP ${response.status}). Try again later.`)
  }
  let text: string
  try {
    text = await response.text()
  } catch (err) {
    if (isAbortError(err) || signal?.aborted) throw abortError()
    throw new SourceError('network', `Couldn't reach ${site}. Check your connection and try again.`)
  }
  throwIfAborted(signal)
  return text
}

/** Parse JSON, mapping failures (e.g. an HTML challenge page) to `SourceError('bad-response')`. */
export function parseJson(text: string, site: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new SourceError('bad-response', `${site} sent an unexpected response. Try again later.`)
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}
