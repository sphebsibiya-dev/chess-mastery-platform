export function abortError(): DOMException {
  return new DOMException('Analysis aborted', 'AbortError')
}

export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}
