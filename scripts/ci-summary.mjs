import { appendFile, readFile } from 'node:fs/promises'

const summaryPath = process.env.GITHUB_STEP_SUMMARY

if (!summaryPath) {
  throw new Error('GITHUB_STEP_SUMMARY is required to publish the CI report.')
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

async function readTestCounts(path) {
  let xml
  try {
    xml = await readFile(path, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') {
      return null
    }
    throw error
  }

  const cases =
    xml.match(/<testcase\b[^>]*(?:\/>|>[\s\S]*?<\/testcase\s*>)/g) ?? []
  const failed = cases.filter((testCase) => /<(failure|error)\b/.test(testCase)).length
  const skipped = cases.filter((testCase) => /<skipped\b/.test(testCase)).length

  return {
    total: cases.length,
    passed: cases.length - failed - skipped,
    failed,
    skipped,
  }
}

function percentage(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? `${value.toFixed(1).replace(/\.0$/, '')}%`
    : 'N/A'
}

function stageStatus(result) {
  switch (result) {
    case 'success':
      return '✅ Passed'
    case 'failure':
      return '❌ Failed'
    case 'cancelled':
      return '⚪ Cancelled'
    case 'skipped':
      return '⏭️ Skipped'
    default:
      return `⚠️ ${result ?? 'Unknown'}`
  }
}

function testCount(counts) {
  if (!counts) {
    return 'Report unavailable'
  }
  const completion =
    counts.total === 0 ? 'N/A' : percentage((counts.passed / counts.total) * 100)
  return `${counts.passed}/${counts.total} passed (${completion}); ${counts.failed} failed; ${counts.skipped} skipped`
}

const [backendTests, frontendTests, e2eTests, backendCoverage, frontendCoverage] =
  await Promise.all([
    readTestCounts('artifacts/backend/backend-junit.xml'),
    readTestCounts('artifacts/frontend/test-results/frontend-junit.xml'),
    readTestCounts('artifacts/e2e/e2e-junit.xml'),
    readJson('artifacts/backend/backend-coverage.json'),
    readJson('artifacts/frontend/coverage/coverage-summary.json'),
  ])

const stages = [
  {
    name: 'Backend',
    result: process.env.BACKEND_RESULT,
    tests: backendTests,
    coverage: backendCoverage
      ? `Statements ${percentage(backendCoverage.totals?.percent_covered)}; branches ${percentage(backendCoverage.totals?.percent_branches_covered)}`
      : 'Coverage report unavailable',
    scope: '`pytest`: unit/API/integration; `shop_api` package (operator `create_user.py` excluded)',
  },
  {
    name: 'Frontend',
    result: process.env.FRONTEND_RESULT,
    tests: frontendTests,
    coverage: frontendCoverage?.total
      ? `Statements ${percentage(frontendCoverage.total.statements?.pct)}; branches ${percentage(frontendCoverage.total.branches?.pct)}; functions ${percentage(frontendCoverage.total.functions?.pct)}; lines ${percentage(frontendCoverage.total.lines?.pct)}`
      : 'Coverage report unavailable',
    scope: '`Vitest`: API client, login/catalog, and admin product creation; coverage measured for `src/App.tsx`, `src/api.ts`, and `src/ProductCreatePage.tsx`',
  },
  {
    name: 'Browser E2E',
    result: process.env.E2E_RESULT,
    tests: e2eTests,
    coverage: 'Behavioral scenarios; source coverage is not measured by E2E',
    scope: '`Playwright` Chromium: customer login/catalog, admin login/product creation, authorization, and invalid credentials; REQ-001/REQ-002/REQ-003',
  },
]

const reportedStages = stages.filter((stage) => stage.tests)
const totalTests = reportedStages.reduce((total, stage) => total + stage.tests.total, 0)
const totalPassed = reportedStages.reduce((total, stage) => total + stage.tests.passed, 0)
const totalFailed = reportedStages.reduce((total, stage) => total + stage.tests.failed, 0)
const totalSkipped = reportedStages.reduce((total, stage) => total + stage.tests.skipped, 0)
const reportsComplete =
  stages.every((stage) => stage.tests !== null) &&
  backendCoverage !== null &&
  frontendCoverage !== null
const allStagesPassed =
  stages.every((stage) => stage.result === 'success') && reportsComplete

const summary = [
  '# CI test report',
  '',
  `**Overall:** ${
    allStagesPassed
      ? '✅ All quality stages passed'
      : '❌ A quality stage failed or a required report is unavailable'
  }`,
  '',
  '## Stage results',
  '',
  '| Stage | Job status | Tests passed | Code coverage / measurement | Test scope |',
  '|---|---|---:|---|---|',
  ...stages.map(
    (stage) =>
      `| ${stage.name} | ${stageStatus(stage.result)} | ${testCount(stage.tests)} | ${stage.coverage} | ${stage.scope} |`,
  ),
  '',
  '## Combined test result',
  '',
  `**${totalPassed}/${totalTests} passed**; ${totalFailed} failed; ${totalSkipped} skipped across stages with an available JUnit report.`,
  '',
  '> Coverage percentages are reported per codebase and measured-file scope; they are not combined into a single percentage. Passing coverage thresholds does not replace checking whether critical requirements are tested.',
  '',
  '## Additional quality gates',
  '',
  '- Backend job includes Ruff lint and format checks.',
  '- Frontend job includes Oxlint, TypeScript validation, and a production build.',
  '- Browser E2E runs against the isolated API/database and records Playwright traces on failure.',
  '- Download the run artifacts for detailed HTML coverage reports, JUnit XML results, and browser diagnostics.',
  '',
].join('\n')

await appendFile(summaryPath, `${summary}\n`, 'utf8')

if (!allStagesPassed) {
  process.exitCode = 1
}
