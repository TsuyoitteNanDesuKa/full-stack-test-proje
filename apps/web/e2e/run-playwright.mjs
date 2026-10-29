import { spawn } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const webDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const databasePath = resolve(tmpdir(), `liva-playwright-${process.pid}.sqlite`)

if (existsSync(databasePath)) {
  throw new Error(`Refusing to overwrite an existing E2E database: ${databasePath}`)
}

if (
  !basename(databasePath).startsWith('liva-playwright-') ||
  relative(tmpdir(), databasePath).startsWith('..')
) {
  throw new Error('Playwright database path must be inside the isolated temp directory.')
}

const playwrightCli = resolve(webDirectory, 'node_modules/@playwright/test/cli.js')
const testProcess = spawn(process.execPath, [playwrightCli, 'test'], {
  cwd: webDirectory,
  env: {
    ...process.env,
    PLAYWRIGHT_E2E_DATABASE_PATH: databasePath,
  },
  stdio: 'inherit',
})

let exitCode = 1

try {
  exitCode = await new Promise((resolveExit, reject) => {
    testProcess.once('error', reject)
    testProcess.once('exit', (code) => resolveExit(code ?? 1))
  })
} finally {
  for (const suffix of ['', '-shm', '-wal']) {
    const filePath = `${databasePath}${suffix}`
    if (existsSync(filePath)) {
      rmSync(filePath)
    }
  }
}

process.exitCode = exitCode
