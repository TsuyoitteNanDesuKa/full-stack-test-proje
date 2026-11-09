import { generateKeyPairSync } from 'node:crypto'
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const webDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const databasePath = resolve(tmpdir(), `liva-playwright-${process.pid}.sqlite`)
let identityKeyDirectory
const childEnvironment = { ...process.env }
const playwrightArguments = process.argv.slice(2)

if (
  playwrightArguments.includes('--grep') &&
  playwrightArguments.some((argument) => argument.includes('@keycloak')) &&
  process.env.E2E_KEYCLOAK_E2E !== '1'
) {
  throw new Error(
    'Set E2E_KEYCLOAK_E2E=1 before selecting the @keycloak browser suite.',
  )
}

if (existsSync(databasePath)) {
  throw new Error(`Refusing to overwrite an existing E2E database: ${databasePath}`)
}

if (process.env.E2E_KEYCLOAK_E2E !== '1') {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  identityKeyDirectory = mkdtempSync(join(tmpdir(), 'liva-playwright-oidc-'))
  const privateKeyPath = join(identityKeyDirectory, 'private.pem')
  const publicJwk = {
    ...publicKey.export({ format: 'jwk' }),
    alg: 'RS256',
    kid: 'liva-playwright-e2e',
    use: 'sig',
  }
  writeFileSync(
    privateKeyPath,
    privateKey.export({ type: 'pkcs8', format: 'pem' }),
    { mode: 0o600 },
  )
  childEnvironment.E2E_TEST_PRIVATE_KEY_PATH = privateKeyPath
  childEnvironment.E2E_TEST_PUBLIC_JWK = JSON.stringify(publicJwk)
}

if (
  !basename(databasePath).startsWith('liva-playwright-') ||
  relative(tmpdir(), databasePath).startsWith('..')
) {
  throw new Error('Playwright database path must be inside the isolated temp directory.')
}

const playwrightCli = resolve(webDirectory, 'node_modules/@playwright/test/cli.js')
const testProcess = spawn(process.execPath, [
  playwrightCli,
  'test',
  ...playwrightArguments,
], {
  cwd: webDirectory,
  env: { ...childEnvironment, PLAYWRIGHT_E2E_DATABASE_PATH: databasePath },
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
  if (identityKeyDirectory && existsSync(identityKeyDirectory)) {
    rmSync(identityKeyDirectory, { recursive: true })
  }
}

process.exitCode = exitCode
