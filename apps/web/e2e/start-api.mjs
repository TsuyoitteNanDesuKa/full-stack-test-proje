import { spawn, spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const apiDirectory = resolve(scriptDirectory, '../../api')
const pythonExecutable = resolve(
  apiDirectory,
  '.venv',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
)
const databaseUrl = process.env.SHOP_DATABASE_URL
const databasePath = process.env.E2E_DATABASE_PATH
const apiPort = process.env.E2E_API_PORT ?? '8001'

if (
  !databaseUrl?.startsWith('sqlite:///') ||
  !databasePath ||
  !isAbsolute(databasePath) ||
  !basename(databasePath).startsWith('liva-playwright-') ||
  relative(tmpdir(), databasePath).startsWith('..')
) {
  throw new Error('Playwright API server must use its isolated SQLite database.')
}

if (existsSync(databasePath)) {
  throw new Error(`Refusing to overwrite an existing E2E database: ${databasePath}`)
}

function cleanup() {
  for (const suffix of ['', '-shm', '-wal']) {
    const filePath = `${databasePath}${suffix}`
    if (existsSync(filePath)) {
      rmSync(filePath)
    }
  }
}

function runUv(args) {
  const result = spawnSync('uv', args, {
    cwd: apiDirectory,
    env: process.env,
    stdio: 'inherit',
  })

  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`uv ${args.join(' ')} failed with exit code ${result.status}.`)
  }
}

try {
  runUv(['run', 'alembic', 'upgrade', 'head'])
  runUv(['run', 'python', '../web/e2e/seed_test_user.py'])
} catch (error) {
  cleanup()
  throw error
}

if (!existsSync(pythonExecutable)) {
  throw new Error(`Backend virtual environment not found: ${pythonExecutable}`)
}

const server = spawn(
  pythonExecutable,
  [
    '-m',
    'uvicorn',
    'shop_api.main:create_app',
    '--factory',
    '--host',
    '127.0.0.1',
    '--port',
    apiPort,
  ],
  {
    cwd: apiDirectory,
    env: process.env,
    stdio: 'inherit',
  },
)

let isShuttingDown = false

function shutdown(signal) {
  if (isShuttingDown) {
    return
  }
  isShuttingDown = true
  server.kill(signal)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

server.on('error', (error) => {
  cleanup()
  console.error(error)
  process.exitCode = 1
})

server.on('exit', (code) => {
  cleanup()
  process.exitCode = code ?? 1
})
