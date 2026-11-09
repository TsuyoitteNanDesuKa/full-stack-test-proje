import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const script = fileURLToPath(new URL('./ci-summary.mjs', import.meta.url))
const junit = '<testsuites><testsuite><testcase name="example" /></testsuite></testsuites>'
const metric = { pct: 95 }
const total = { statements: metric, branches: metric, functions: metric, lines: metric }

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'ci-summary-test-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const files = {
    'artifacts/backend/backend-junit.xml': junit,
    'artifacts/postgres/postgres-junit.xml': junit,
    'artifacts/frontend/test-results/frontend-junit.xml': junit,
    'artifacts/e2e/e2e-junit.xml': junit,
    'artifacts/backend/backend-coverage.json': JSON.stringify({
      totals: { percent_covered: 95, percent_branches_covered: 90 },
    }),
    'artifacts/frontend/coverage/coverage-summary.json': JSON.stringify({
      total,
      'C:\\agent\\apps\\web\\src\\App.tsx': total,
      '/home/runner/apps/web/src/CartPanel.tsx': total,
    }),
  }
  for (const [name, content] of Object.entries(files)) {
    const path = join(dir, name)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, content)
  }
  const summary = join(dir, 'summary.md')
  const env = {
    ...process.env,
    GITHUB_STEP_SUMMARY: summary,
    BACKEND_RESULT: 'success',
    POSTGRES_RESULT: 'success',
    FRONTEND_RESULT: 'success',
    E2E_RESULT: 'success',
    KEYCLOAK_E2E_RESULT: 'skipped',
    KEYCLOAK_E2E_REQUIRED: 'false',
  }
  return { dir, summary, env }
}

test('reports measured files from the actual coverage report', async (t) => {
  const { dir, summary, env } = await fixture(t)
  execFileSync(process.execPath, [script], { cwd: dir, env })
  const output = await readFile(summary, 'utf8')
  assert.match(output, /All quality stages passed/)
  assert.match(output, /measured files: `src\/App\.tsx`, `src\/CartPanel\.tsx`/)
  assert.match(output, /Keycloak E2E.*Skipped/)
})

test('fails when the frontend coverage report has no measured files', async (t) => {
  const { dir, summary, env } = await fixture(t)
  await writeFile(
    join(dir, 'artifacts/frontend/coverage/coverage-summary.json'),
    JSON.stringify({ total }),
  )
  const result = spawnSync(process.execPath, [script], { cwd: dir, env, encoding: 'utf8' })
  assert.equal(result.status, 1, result.stderr)
  assert.match(await readFile(summary, 'utf8'), /measured-file scope unavailable/)
})

test('fails when the frontend coverage report has no total', async (t) => {
  const { dir, summary, env } = await fixture(t)
  await writeFile(
    join(dir, 'artifacts/frontend/coverage/coverage-summary.json'),
    JSON.stringify({ '/home/runner/apps/web/src/App.tsx': total }),
  )
  const result = spawnSync(process.execPath, [script], { cwd: dir, env, encoding: 'utf8' })
  assert.equal(result.status, 1, result.stderr)
  assert.match(await readFile(summary, 'utf8'), /Coverage report unavailable/)
})

test('requires Keycloak reports on scheduled and manual runs', async (t) => {
  const { dir, env } = await fixture(t)
  env.KEYCLOAK_E2E_REQUIRED = 'true'
  env.KEYCLOAK_E2E_RESULT = 'failure'
  const result = spawnSync(process.execPath, [script], { cwd: dir, env, encoding: 'utf8' })
  assert.equal(result.status, 1, result.stderr)
})
