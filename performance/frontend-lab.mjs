import { spawn, spawnSync } from 'node:child_process'
import { generateKeyPairSync, sign, createHash } from 'node:crypto'
import { createServer, request } from 'node:http'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, rmdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join, resolve, sep } from 'node:path'
import { createRequire } from 'node:module'
import { gzipSync } from 'node:zlib'

const repo = resolve(process.argv[2] ?? '')
const output = resolve(process.argv[3] ?? '')
const web = join(repo, 'apps', 'web')
const api = join(repo, 'apps', 'api')
const dist = join(web, 'dist')
const python = join(api, '.venv', 'Scripts', 'python.exe')
const { chromium } = createRequire(join(web, 'package.json'))('playwright')
const authority = 'http://127.0.0.1:18082/realms/e2e'
const webUrl = 'http://127.0.0.1:18080'
const apiUrl = 'http://127.0.0.1:18081'
const publicKeyId = 'frontend-lab'
if (!process.argv[2] || !process.argv[3] || existsSync(output)) {
  throw new Error('Provide repository root and a new output file; existing files are not overwritten.')
}
if (!existsSync(join(dist, 'index.html')) || !existsSync(python) || !existsSync(chromium.executablePath())) {
  throw new Error('Production build, backend virtual environment, or Playwright Chromium is missing.')
}

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const jwk = { ...publicKey.export({ format: 'jwk' }), alg: 'RS256', kid: publicKeyId, use: 'sig' }
function token(role) {
  const now = Math.floor(Date.now() / 1000)
  const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const input = `${b64({ alg: 'RS256', kid: publicKeyId, typ: 'JWT' })}.${b64({
    iss: authority, aud: 'shop-api', sub: `lab-${role}`, email: `${role}@example.com`,
    iat: now, exp: now + 3600, realm_access: { roles: [role] },
  })}`
  return `${input}.${sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`
}

const identity = createServer((req, res) => {
  if (req.url !== '/realms/e2e/protocol/openid-connect/certs') {
    res.writeHead(404).end()
    return
  }
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
  res.end(JSON.stringify({ keys: [jwk] }))
})
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' }
const server = createServer((req, res) => {
  const url = new URL(req.url, webUrl)
  if (url.pathname.startsWith('/api/')) {
    const upstream = request(`${apiUrl}${url.pathname}${url.search}`, { method: req.method, headers: { ...req.headers, host: '127.0.0.1:18081' } }, (response) => {
      res.writeHead(response.statusCode, response.headers)
      response.pipe(res)
    })
    upstream.on('error', () => res.writeHead(502).end('API proxy failed'))
    req.pipe(upstream)
    return
  }
  const file = resolve(dist, `.${url.pathname === '/' ? '/index.html' : url.pathname}`)
  if (!file.startsWith(`${dist}${sep}`) || !existsSync(file)) {
    res.writeHead(404).end()
    return
  }
  const body = readFileSync(file)
  res.writeHead(200, { 'content-type': contentTypes[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store', 'content-length': body.length })
  res.end(body)
})
function listen(instance, port) {
  return new Promise((ok, fail) => {
    instance.once('error', fail)
    instance.listen(port, '127.0.0.1', () => { instance.off('error', fail); ok() })
  })
}
function close(instance) {
  return instance.listening ? new Promise((ok, fail) => instance.close((error) => error ? fail(error) : ok())) : Promise.resolve()
}
async function removeWithRetry(remove) {
  for (let attempt = 0; ; attempt++) {
    try {
      remove()
      return
    } catch (error) {
      if (!['EBUSY', 'EPERM'].includes(error.code) || attempt === 9) throw error
      await new Promise((done) => setTimeout(done, 100))
    }
  }
}
async function waitApi(proc) {
  for (let i = 0; i < 80; i++) {
    if (proc.exitCode !== null) throw new Error(`API exited with ${proc.exitCode}`)
    try {
      const response = await fetch(`${apiUrl}/openapi.json`)
      if (response.ok) return
    } catch (error) {
      if (!(error instanceof TypeError)) throw error
    }
    await new Promise((done) => setTimeout(done, 250))
  }
  throw new Error('Isolated API failed readiness.')
}
async function seed(adminToken) {
  for (let i = 1; i <= 20; i++) {
    const response = await fetch(`${apiUrl}/api/v1/products`, {
      method: 'POST',
      headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: `Laboratory product ${String(i).padStart(2, '0')}`, category: 'Lab', description: 'Synthetic product for frontend measurement.', price: '25.00', stock: 50 }),
    })
    if (response.status !== 201) throw new Error(`Product seed ${i} failed: ${response.status} ${await response.text()}`)
  }
}
function observe() {
  const state = { lcp: null, shifts: [], errors: [] }
  window.__frontendLab = state
  function recordShift(entry) {
    if (entry.hadRecentInput) return
    state.shifts.push({
      value: entry.value,
      time: entry.startTime,
      sources: (entry.sources ?? []).map(({ node, previousRect, currentRect }) => ({
        tag: node?.tagName ?? null,
        id: node?.id ?? null,
        className: typeof node?.className === 'string' ? node.className : null,
        previousRect: previousRect?.toJSON() ?? null,
        currentRect: currentRect?.toJSON() ?? null,
      })),
    })
  }
  try {
    const lcp = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        state.lcp = { ms: entry.startTime, tag: entry.element?.tagName ?? null, size: entry.size }
      }
    })
    lcp.observe({ type: 'largest-contentful-paint', buffered: true })
    const cls = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) recordShift(entry)
    })
    cls.observe({ type: 'layout-shift', buffered: true })
    state.flush = () => {
      for (const entry of lcp.takeRecords()) state.lcp = { ms: entry.startTime, tag: entry.element?.tagName ?? null, size: entry.size }
    for (const entry of cls.takeRecords()) recordShift(entry)
    }
  } catch (error) { state.errors.push(String(error)) }
}
function metrics() {
  const state = window.__frontendLab
  state.flush()
  let max = 0
  let value = 0
  let first = 0
  let last = 0
  for (const shift of state.shifts) {
    if (value && shift.time - last < 1000 && shift.time - first < 5000) value += shift.value
    else { value = shift.value; first = shift.time }
    last = shift.time
    max = Math.max(max, value)
  }
  return { lcp: state.lcp, cls: max, shifts: state.shifts, observerErrors: state.errors, navigation: performance.getEntriesByType('navigation')[0]?.toJSON() }
}

const temp = mkdtempSync(join(tmpdir(), 'qa026-frontend-'))
const database = join(temp, 'frontend-lab.sqlite')
const databaseUrl = `sqlite:///${database.replaceAll('\\', '/')}`
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('SHOP_')))
Object.assign(environment, { SHOP_DATABASE_URL: databaseUrl, SHOP_OIDC_ISSUER: authority, SHOP_OIDC_JWKS_URL: `${authority}/protocol/openid-connect/certs`, SHOP_OIDC_AUDIENCE: 'shop-api' })
let apiProcess
let browser
try {
  const apiPortProbe = createServer()
  await listen(apiPortProbe, 18081)
  await close(apiPortProbe)
  await listen(identity, 18082)
  await listen(server, 18080)
  const migration = spawnSync(python, ['-m', 'alembic', 'upgrade', 'head'], { cwd: api, env: environment, encoding: 'utf8' })
  if (migration.status !== 0) throw new Error(`Migration failed: ${migration.error ?? migration.stderr}`)
  apiProcess = spawn(python, ['-m', 'uvicorn', 'shop_api.main:create_app', '--factory', '--host', '127.0.0.1', '--port', '18081', '--workers', '1', '--no-access-log'], { cwd: api, env: environment, stdio: 'ignore' })
  await waitApi(apiProcess)
  const admin = token('admin')
  const buyer = token('buyer')
  await seed(admin)
  browser = await chromium.launch({ headless: true })
  const browserVersion = browser.version()
  const results = []
  for (const scenario of ['login', 'catalog']) {
    for (let run = 1; run <= 3; run++) {
      const context = await browser.newContext({ viewport: { width: 1365, height: 768 }, deviceScaleFactor: 1, locale: 'tr-TR', serviceWorkers: 'block' })
      try {
        const page = await context.newPage()
        const cdp = await page.context().newCDPSession(page)
        await cdp.send('Network.enable')
        await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
        await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 200000, uploadThroughput: 93750 })
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
        const requests = new Map()
        const scripts = []
        const failures = []
        const badResponses = []
        cdp.on('Network.responseReceived', ({ requestId, type, response }) => {
          if (type === 'Script') requests.set(requestId, { url: response.url, status: response.status, mimeType: response.mimeType })
        })
        cdp.on('Network.loadingFinished', ({ requestId, encodedDataLength }) => {
          const item = requests.get(requestId)
          if (item) scripts.push({ ...item, transferBytes: encodedDataLength })
        })
        page.on('requestfailed', (req) => failures.push({ url: req.url(), error: req.failure()?.errorText }))
        page.on('response', (res) => { if (res.status() >= 400) badResponses.push({ url: res.url(), status: res.status() }) })
        page.on('pageerror', (error) => failures.push({ pageError: error.message }))
        await page.route('**/*', (route) => {
          const url = new URL(route.request().url())
          if (url.origin !== webUrl) {
            failures.push({ blockedExternalOrigin: url.origin })
            return route.abort()
          }
          return route.continue()
        })
        await page.addInitScript(observe)
        if (scenario === 'catalog') {
          await page.addInitScript(({ key, accessToken }) => {
            sessionStorage.setItem(key, JSON.stringify({
              access_token: accessToken, expires_at: Math.floor(Date.now() / 1000) + 3600,
              profile: { sub: 'lab-buyer', email: 'buyer@example.com' },
              scope: 'openid profile email', token_type: 'Bearer', session_state: null,
            }))
          }, { key: `oidc.user:${authority}:shop-web`, accessToken: buyer })
        }
        const response = await page.goto(webUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
        if (response?.status() !== 200) throw new Error(`Navigation failed: ${response?.status()}`)
        try {
          if (scenario === 'login') {
            await page.getByRole('button', { name: /giriş yap/i }).waitFor({ state: 'visible', timeout: 30000 })
          } else {
            await page.getByRole('heading', { name: 'Alışverişe hoş geldiniz.' }).waitFor({ state: 'visible', timeout: 30000 })
            await page.getByRole('row', { name: /Laboratory product 20/ }).waitFor({ state: 'visible', timeout: 30000 })
          }
        } catch (error) {
          throw new Error(`Page not ready: ${error.message}; responses=${JSON.stringify(badResponses)}; failures=${JSON.stringify(failures)}; body=${(await page.locator('body').innerText()).slice(0, 1000)}`)
        }
        await page.waitForTimeout(5000)
        const measured = await page.evaluate(metrics)
        if (!measured.lcp || measured.observerErrors.length || failures.length || badResponses.length || !scripts.length) {
          throw new Error(JSON.stringify({ scenario, run, measured, failures, badResponses, scripts }))
        }
        results.push({ scenario, run, ...measured, scripts, scriptTransferBytes: scripts.reduce((sum, item) => sum + item.transferBytes, 0) })
        console.log(`${scenario} #${run} LCP=${measured.lcp.ms.toFixed(1)} ms CLS=${measured.cls.toFixed(6)} JS transfer=${results.at(-1).scriptTransferBytes} bytes`)
      } finally { await context.close() }
    }
  }
  const assets = readdirSync(join(dist, 'assets')).filter((name) => name.endsWith('.js')).map((name) => {
    const contents = readFileSync(join(dist, 'assets', name))
    return { name, bytes: contents.length, gzipBytes: gzipSync(contents).length, sha256: createHash('sha256').update(contents).digest('hex') }
  })
  if (!assets.length) throw new Error('No JavaScript assets in production build.')
  const git = spawnSync('git', ['--no-pager', 'rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' })
  const status = spawnSync('git', ['status', '--short'], { cwd: repo, encoding: 'utf8' })
  if (git.status !== 0 || status.status !== 0) throw new Error('Cannot record repository state')
  const report = {
    timestamp: new Date().toISOString(), commit: git.stdout.trim(), worktreeStatus: status.stdout.trim().split('\n').filter(Boolean),
    browserVersion, chromiumExecutable: chromium.executablePath(), node: process.version,
    profile: { viewport: '1365x768', deviceScaleFactor: 1, locale: 'tr-TR', cpuSlowdown: 4, latencyMs: 150, downloadBytesPerSecond: 200000, uploadBytesPerSecond: 93750, cache: 'disabled', observationAfterReadyMs: 5000, runs: 3 },
    assets, results,
  }
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' })
} finally {
  if (browser) await browser.close()
  if (apiProcess && apiProcess.exitCode === null) {
    const exited = new Promise((done) => apiProcess.once('exit', done))
    apiProcess.kill()
    await exited
  }
  await close(server)
  await close(identity)
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    await removeWithRetry(() => rmSync(`${database}${suffix}`, { force: true }))
  }
  await removeWithRetry(() => rmdirSync(temp))
}
