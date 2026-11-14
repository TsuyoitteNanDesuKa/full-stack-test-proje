import http from 'k6/http'
import { check, sleep } from 'k6'
import exec from 'k6/execution'
import { Counter, Rate, Trend } from 'k6/metrics'

const scenario = __ENV.PERF_SCENARIO
const scenarios = ['catalog', 'catalog_search', 'orders_10', 'orders_100', 'orders_1000', 'seller', 'checkout']
if (!scenarios.includes(scenario)) {
  throw new Error(`PERF_SCENARIO must be one of: ${scenarios.join(', ')}`)
}
const baseUrl = __ENV.PERF_API_URL
if (baseUrl !== 'http://127.0.0.1:18001' && baseUrl !== 'http://localhost:18001') {
  throw new Error('PERF_API_URL must point to the isolated local API on port 18001.')
}
if (!__ENV.PERF_FIXTURES || !__ENV.PERF_REPORT) {
  throw new Error('PERF_FIXTURES and PERF_REPORT must be explicitly configured.')
}
const fixtures = JSON.parse(open(__ENV.PERF_FIXTURES))
if (!fixtures.catalog_token || !fixtures.seller_token ||
    !fixtures.buyer_tokens?.['10'] || !fixtures.buyer_tokens?.['100'] ||
    !fixtures.buyer_tokens?.['1000'] || fixtures.checkout?.length !== 10) {
  throw new Error('Performance fixtures are incomplete.')
}

const smoke = __ENV.PERF_SMOKE === '1'
const rampSeconds = smoke ? 2 : 60
const steadySeconds = smoke ? 5 : 180
const stages = smoke
  ? [{ duration: '2s', target: 2 }, { duration: '5s', target: 2 }, { duration: '2s', target: 0 }]
  : [{ duration: '1m', target: 10 }, { duration: '3m', target: 10 }, { duration: '30s', target: 0 }]
const operations = scenario === 'checkout'
  ? ['cart_read', 'cart_add', 'checkout', 'payment_create', 'payment_complete']
  : [scenario]
const thresholds = {
  perf_requests: ['count>0'],
  perf_failed: ['rate<0.01'],
}
for (const operation of operations) {
  const limit = ['checkout', 'payment_create', 'payment_complete'].includes(operation) ? 1000 : 500
  thresholds[`perf_latency{operation:${operation}}`] = [`p(95)<=${limit}`]
  thresholds[`perf_operation_count{operation:${operation}}`] = ['count>0']
}

export const options = {
  scenarios: {
    load: { executor: 'ramping-vus', startVUs: 0, stages, gracefulRampDown: '30s' },
  },
  thresholds,
  systemTags: ['status', 'method', 'name', 'scenario', 'error_code'],
  summaryTrendStats: ['count', 'avg', 'min', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
}

const latency = new Trend('perf_latency', true)
const failed = new Rate('perf_failed')
const requests = new Counter('perf_requests')
const operationCount = new Counter('perf_operation_count')
const responseBytes = new Trend('perf_response_bytes')
const statuses = new Counter('perf_status')

export function setup() {
  return { runId: `${Date.now()}-${Math.floor(Math.random() * 1_000_000_000)}` }
}

function request(operation, method, path, token, body, expectedStatus, validate) {
  const elapsed = (Date.now() - exec.scenario.startTime) / 1000
  const measured = elapsed >= rampSeconds && elapsed < rampSeconds + steadySeconds
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  if (body?.idempotencyKey) headers['Idempotency-Key'] = body.idempotencyKey
  const response = http.request(method, `${baseUrl}${path}`, body?.payload ? JSON.stringify(body.payload) : null, {
    headers,
    timeout: '60s',
    tags: { name: operation, phase: measured ? 'steady' : 'ramp' },
  })
  let data
  try {
    data = response.json()
  } catch {
    data = null
  }
  const ok = response.status === expectedStatus && data !== null && validate(data)
  check(response, { [`${operation}: status and business result`]: () => ok }, { phase: measured ? 'steady' : 'ramp' })
  if (measured) {
    const tags = { operation }
    requests.add(1, tags)
    operationCount.add(1, tags)
    statuses.add(1, { ...tags, status: String(response.status) })
    failed.add(!ok, tags)
    const bytes = response.headers['Content-Length']
      ? Number(response.headers['Content-Length'])
      : (response.body ? unescape(encodeURIComponent(response.body)).length : 0)
    responseBytes.add(bytes, tags)
    if (ok) latency.add(response.timings.duration, tags)
  }
  return ok ? data : null
}

export default function (run) {
  if (scenario === 'catalog' || scenario === 'catalog_search') {
    const query = scenario === 'catalog' ? '?limit=20&offset=0' : '?limit=20&offset=0&search=Perf&category=Perf&sort=price_asc'
    request(scenario, 'GET', `/api/v1/products${query}`, fixtures.catalog_token, null, 200,
      (data) => Array.isArray(data.products) && data.products.length === 20 && data.total === (scenario === 'catalog' ? 1000 : 500))
  } else if (scenario.startsWith('orders_')) {
    const count = scenario.split('_')[1]
    request(scenario, 'GET', '/api/v1/orders', fixtures.buyer_tokens[count], null, 200,
      (data) => Array.isArray(data) && data.length === Number(count))
  } else if (scenario === 'seller') {
    request(scenario, 'GET', '/api/v1/seller/orders?limit=50&offset=0', fixtures.seller_token, null, 200,
      (data) => Array.isArray(data) && data.length === 50)
  } else {
    const buyer = fixtures.checkout[exec.vu.idInTest - 1]
    if (!buyer) throw new Error('No isolated buyer is configured for this virtual user.')
    const key = `perf-${run.runId}-${exec.vu.idInTest}-${exec.vu.iterationInInstance}`
    const cart = request('cart_read', 'GET', '/api/v1/cart', buyer.token, null, 200,
      (data) => Array.isArray(data.items) && data.items.length === 0)
    if (!cart) return sleep(1)
    const added = request('cart_add', 'POST', '/api/v1/cart/items', buyer.token,
      { payload: { product_id: buyer.product_id, quantity: 1 } }, 200,
      (data) => data.items?.length === 1 && data.items[0].product_id === buyer.product_id && data.items[0].quantity === 1)
    if (!added) return sleep(1)
    const order = request('checkout', 'POST', '/api/v1/orders', buyer.token,
      { idempotencyKey: `${key}-order`, payload: { address_id: buyer.address_id, delivery_method: 'standard' } }, 201,
      (data) => Number.isInteger(data.id) && data.status === 'pending_payment')
    if (!order) return sleep(1)
    const payment = request('payment_create', 'POST', `/api/v1/orders/${order.id}/payments`, buyer.token,
      { idempotencyKey: `${key}-payment` }, 201,
      (data) => Number.isInteger(data.id) && data.status === 'pending' &&
        /^\/api\/v1\/payments\/mock-checkout\/\d+\/[a-f0-9]{64}$/.test(data.checkout_url))
    if (!payment) return sleep(1)
    request('payment_complete', 'POST', payment.checkout_url, null,
      { payload: { status: 'succeeded' } }, 200, (data) => data.id === payment.id && data.status === 'succeeded')
  }
  sleep(1)
}

export function handleSummary(data) {
  return { [__ENV.PERF_REPORT]: JSON.stringify(data, null, 2), stdout: JSON.stringify({
    scenario, mode: smoke ? 'smoke' : 'baseline', report: __ENV.PERF_REPORT,
    metrics: data.metrics,
  }, null, 2) }
}
