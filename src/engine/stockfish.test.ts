import { describe, expect, it } from 'vitest'
import { isAbortError } from './abort'
import { StockfishEngine, type WorkerLike } from './stockfish'

/**
 * A fake worker that answers like Stockfish. `go` replies are queued in
 * `searches`; by default each `go` immediately emits the next recorded reply.
 * With `manualGo`, the test controls when the search finishes.
 */
class FakeWorker implements WorkerLike {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  sent: string[] = []
  terminated = false
  searches: string[][] = []
  manualGo = false
  pendingGo = false

  postMessage(message: string): void {
    this.sent.push(message)
    if (message === 'uci') this.emit('id name Stockfish 19 Lite', 'uciok')
    else if (message === 'isready') this.emit('readyok')
    else if (message.startsWith('go')) {
      if (this.manualGo) this.pendingGo = true
      else this.emit(...(this.searches.shift() ?? ['bestmove (none)']))
    } else if (message === 'stop' && this.pendingGo) {
      this.pendingGo = false
      this.emit('info depth 3 score cp 1 pv e2e4', 'bestmove e2e4')
    }
  }

  terminate(): void {
    this.terminated = true
  }

  emit(...lines: string[]): void {
    // Real workers deliver messages asynchronously.
    queueMicrotask(() => {
      for (const line of lines) this.onmessage?.({ data: line } as MessageEvent)
    })
  }

  /** Finishes a manual search. */
  finish(...lines: string[]): void {
    this.pendingGo = false
    this.emit(...lines)
  }
}

const FEN = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1'

// Recorded from `stockfish-19-lite-single.js` (go depth 10 from FEN above).
const RECORDED = [
  'info string Network replica 1: Local memory. Shared memory not supported by the OS. Local allocation fallback.',
  'info depth 1 seldepth 2 multipv 1 score cp -6 nodes 20 nps 666 hashfull 0 time 30 pv e7e5',
  'info depth 9 seldepth 10 multipv 1 score cp -36 nodes 7734 nps 84065 hashfull 1 time 92 pv c7c5 g1f3 b8c6',
  'info depth 10 seldepth 16 multipv 1 score cp -38 nodes 14111 nps 82040 hashfull 3 time 172 pv e7e6 b1c3 d7d5',
  'bestmove e7e6 ponder b1c3',
]

describe('StockfishEngine', () => {
  it('completes the UCI handshake', async () => {
    const worker = new FakeWorker()
    const engine = new StockfishEngine(worker, { hash: 32 })
    await engine.ready()
    expect(worker.sent).toEqual(['uci', 'setoption name Hash value 32', 'isready'])
    // Only once.
    await engine.ready()
    expect(worker.sent).toHaveLength(3)
  })

  it('analyses a position and returns the last info and bestmove', async () => {
    const worker = new FakeWorker()
    worker.searches.push(RECORDED)
    const engine = new StockfishEngine(worker)
    const result = await engine.analyse(FEN, { depth: 14 })
    expect(worker.sent.slice(-2)).toEqual([`position fen ${FEN}`, 'go depth 14'])
    expect(result).toEqual({
      score: { type: 'cp', value: -38 },
      bestMove: 'e7e6',
      pv: ['e7e6', 'b1c3', 'd7d5'],
      depth: 10,
    })
  })

  it('handles several lines in one message', async () => {
    const worker = new FakeWorker()
    worker.searches.push([RECORDED.join('\n')])
    const engine = new StockfishEngine(worker)
    const result = await engine.analyse(FEN, { depth: 10 })
    expect(result.bestMove).toBe('e7e6')
  })

  it('sends ucinewgame and waits for readyok', async () => {
    const worker = new FakeWorker()
    const engine = new StockfishEngine(worker)
    await engine.newGame()
    expect(worker.sent.slice(-2)).toEqual(['ucinewgame', 'isready'])
  })

  it('runs concurrent calls one after the other', async () => {
    const worker = new FakeWorker()
    worker.manualGo = true
    const engine = new StockfishEngine(worker)
    const first = engine.analyse('fen-1', { depth: 5 })
    const second = engine.analyse('fen-2', { depth: 5 })
    await new Promise((r) => setTimeout(r, 0))
    expect(worker.sent.filter((m) => m.startsWith('position'))).toEqual(['position fen fen-1'])

    worker.finish('info depth 5 score cp 10 pv a2a3', 'bestmove a2a3')
    expect((await first).bestMove).toBe('a2a3')
    await new Promise((r) => setTimeout(r, 0))
    expect(worker.sent.filter((m) => m.startsWith('position'))).toEqual(['position fen fen-1', 'position fen fen-2'])

    worker.finish('info depth 5 score cp -10 pv h7h6', 'bestmove h7h6')
    expect((await second).bestMove).toBe('h7h6')
  })

  it('stops the search on abort, rejects with AbortError, and keeps working', async () => {
    const worker = new FakeWorker()
    worker.manualGo = true
    const engine = new StockfishEngine(worker)
    const controller = new AbortController()
    const pending = engine.analyse(FEN, { depth: 20, signal: controller.signal })
    await new Promise((r) => setTimeout(r, 0))
    controller.abort()
    const err = await pending.catch((e: unknown) => e)
    expect(isAbortError(err)).toBe(true)
    expect(worker.sent).toContain('stop')

    const next = engine.analyse(FEN, { depth: 5 })
    await new Promise((r) => setTimeout(r, 0))
    worker.finish('info depth 5 score cp 7 pv e7e5', 'bestmove e7e5')
    expect((await next).score).toEqual({ type: 'cp', value: 7 })
  })

  it('rejects at once when the signal is already aborted', async () => {
    const engine = new StockfishEngine(new FakeWorker())
    const controller = new AbortController()
    controller.abort()
    const err = await engine.analyse(FEN, { depth: 5, signal: controller.signal }).catch((e: unknown) => e)
    expect(isAbortError(err)).toBe(true)
  })

  it('terminate() stops the worker and later calls reject', async () => {
    const worker = new FakeWorker()
    worker.manualGo = true
    const engine = new StockfishEngine(worker)
    const pending = engine.analyse(FEN, { depth: 5 })
    await new Promise((r) => setTimeout(r, 0))
    engine.terminate()
    expect(worker.terminated).toBe(true)
    await expect(pending).rejects.toThrow('Engine terminated')
    await expect(engine.analyse(FEN, { depth: 5 })).rejects.toThrow('Engine terminated')
  })

  it('rejects when the worker reports an error', async () => {
    const worker = new FakeWorker()
    worker.postMessage = (m) => void worker.sent.push(m) // never answers
    const engine = new StockfishEngine(worker)
    const pending = engine.ready()
    worker.onerror?.({ message: 'wasm failed' } as ErrorEvent)
    await expect(pending).rejects.toThrow('Engine error: wasm failed')
  })

  it('times out if the engine never starts', async () => {
    const worker = new FakeWorker()
    worker.postMessage = (m) => void worker.sent.push(m)
    const engine = new StockfishEngine(worker, { startTimeoutMs: 10 })
    await expect(engine.ready()).rejects.toThrow('did not start')
  })
})
