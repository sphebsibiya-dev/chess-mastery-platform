// Copies the Stockfish 19 lite single-threaded engine (JS loader + WASM) and its
// licence into public/stockfish/ so Vite serves them as static, same-origin files.
// Runs from the `predev` and `prebuild` npm scripts and is safe to run more than once.
// public/stockfish/ is gitignored: the binaries come from node_modules, never from git.
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = join(root, 'node_modules', 'stockfish')
const out = join(root, 'public', 'stockfish')

const files = [
  ['bin/stockfish-19-lite-single.js', 'stockfish-19-lite-single.js'],
  ['bin/stockfish-19-lite-single.wasm', 'stockfish-19-lite-single.wasm'],
  ['Copying.txt', 'Copying.txt'],
]

mkdirSync(out, { recursive: true })
for (const [from, to] of files) {
  const src = join(pkg, from)
  if (!existsSync(src)) {
    console.error(`copy-stockfish: missing ${src}. Run npm install first.`)
    process.exit(1)
  }
  cpSync(src, join(out, to))
}
console.log(`copy-stockfish: copied ${files.length} files to public/stockfish/`)
