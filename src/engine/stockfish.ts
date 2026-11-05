import { abortError } from './abort'
import { parseBestMove, parseInfo, type UciInfo } from './uci'
import type { AnalyseOptions, Engine, EngineLine, EngineResult } from './types'

/** The part of `Worker` the engine uses, so tests can pass a fake. */
export interface WorkerLike {
  postMessage(message: string): void
  terminate(): void
  onmessage: ((event: MessageEvent) => void) | null
  onerror: ((event: ErrorEvent) => void) | null
}

export interface StockfishOptions {
  /** Transposition table size in MB. */
  hash?: number
  /** How long to wait for `uciok`/`readyok` before giving up. */
  startTimeoutMs?: number
}

/** Path of the engine under `public/` (copied there by scripts/copy-stockfish.mjs). */
export const STOCKFISH_PATH = 'stockfish/stockfish-19-lite-single.js'

/**
 * Starts Stockfish 19 lite (single-threaded WASM) as a classic Web Worker.
 * The engine finds its `.wasm` next to the `.js` (same name), so both are served
 * from our own origin and nothing leaves the device. No COOP/COEP headers needed.
 */
export function createStockfishWorker(): Worker {
  return new Worker(import.meta.env.BASE_URL + STOCKFISH_PATH)
}

interface Waiter {
  onLine: (line: string) => boolean
  reject: (err: unknown) => void
}

/**
 * Promise-based UCI wrapper around a Stockfish worker.
 * Calls run one at a time through a queue; `analyse` supports cancellation
 * through an AbortSignal (sends `stop` and waits for `bestmove` so the engine is
 * idle before the next search starts).
 */
export class StockfishEngine implements Engine {
  private readonly worker: WorkerLike
  private readonly hash: number
  private readonly startTimeoutMs: number
  private queue: Promise<unknown> = Promise.resolve()
  private waiter: Waiter | null = null
  private started: Promise<void> | null = null
  private failure: Error | null = null
  /** The `MultiPV` value the engine currently uses (UCI default 1). */
  private multiPv = 1

  constructor(worker: WorkerLike, options: StockfishOptions = {}) {
    this.worker = worker
    this.hash = options.hash ?? 32
    this.startTimeoutMs = options.startTimeoutMs ?? 30_000
    worker.onmessage = (event) => {
      const data = typeof event.data === 'string' ? event.data : String(event.data)
      for (const line of data.split('\n')) {
        if (line.trim()) this.handleLine(line)
      }
    }
    worker.onerror = (event) => {
      this.fail(new Error(event.message ? `Engine error: ${event.message}` : 'The engine failed to load.'))
    }
  }

  /** UCI handshake. Resolves once the engine answered `uciok` and `readyok`. */
  ready(): Promise<void> {
    if (!this.started) this.started = this.enqueue(() => this.handshake())
    return this.started
  }

  /** Sends `ucinewgame` and waits until the engine is ready again. */
  async newGame(): Promise<void> {
    await this.ready()
    return this.enqueue(async () => {
      this.send('ucinewgame')
      this.send('isready')
      await this.waitFor((line) => line === 'readyok')
    })
  }

  async analyse(fen: string, { depth, multiPv = 1, signal }: AnalyseOptions): Promise<EngineResult> {
    if (signal?.aborted) throw abortError()
    await this.ready()
    return this.enqueue(() => this.search(fen, depth, multiPv, signal))
  }

  /** Stops the worker. Pending and later calls reject. */
  terminate(): void {
    this.fail(new Error('Engine terminated'))
    this.worker.onmessage = null
    this.worker.onerror = null
    this.worker.terminate()
  }

  private async handshake(): Promise<void> {
    const timer = setTimeout(
      () => this.fail(new Error('The engine did not start in time.')),
      this.startTimeoutMs,
    )
    try {
      this.send('uci')
      await this.waitFor((line) => line === 'uciok')
      this.send(`setoption name Hash value ${this.hash}`)
      this.send('isready')
      await this.waitFor((line) => line === 'readyok')
    } finally {
      clearTimeout(timer)
    }
  }

  private async search(fen: string, depth: number, multiPv: number, signal?: AbortSignal): Promise<EngineResult> {
    if (signal?.aborted) throw abortError()
    // Latest info per MultiPV index; a deeper iteration overwrites the earlier one.
    const latest = new Map<number, UciInfo>()
    let aborted = false
    const onAbort = () => {
      aborted = true
      this.send('stop')
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      if (multiPv !== this.multiPv) {
        this.send(`setoption name MultiPV value ${multiPv}`)
        this.multiPv = multiPv
      }
      this.send(`position fen ${fen}`)
      this.send(`go depth ${depth}`)
      let bestMove: string | undefined
      await this.waitFor((line) => {
        const info = parseInfo(line)
        if (info) {
          latest.set(info.multipv, info)
          return false
        }
        const best = parseBestMove(line)
        if (!best) return false
        bestMove = best.bestMove
        return true
      })
      if (aborted) throw abortError()
      const final = latest.get(1)
      if (!final) throw new Error(`Engine returned no evaluation for ${fen}`)
      const lines: EngineLine[] = [...latest.values()]
        .filter((info) => info.depth === final.depth && info.pv.length > 0)
        .sort((a, b) => a.multipv - b.multipv)
        .map((info) => ({ move: info.pv[0], score: info.score, pv: info.pv }))
      return { score: final.score, bestMove, pv: final.pv, depth: final.depth, lines }
    } finally {
      signal?.removeEventListener('abort', onAbort)
    }
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = () => {
      if (this.failure) throw this.failure
      return task()
    }
    const result = this.queue.then(run, run)
    // Keep the chain alive whatever happens to this task.
    this.queue = result.catch(() => undefined)
    return result
  }

  private waitFor(onLine: (line: string) => boolean): Promise<void> {
    if (this.failure) return Promise.reject(this.failure)
    return new Promise<void>((resolve, reject) => {
      this.waiter = {
        onLine: (line) => {
          if (!onLine(line)) return false
          resolve()
          return true
        },
        reject,
      }
    })
  }

  private handleLine(line: string): void {
    const waiter = this.waiter
    if (waiter && waiter.onLine(line.trim())) {
      if (this.waiter === waiter) this.waiter = null
    }
  }

  private fail(err: Error): void {
    if (this.failure) return
    this.failure = err
    const waiter = this.waiter
    this.waiter = null
    waiter?.reject(err)
  }

  private send(command: string): void {
    this.worker.postMessage(command)
  }
}
