import { afterEach, describe, expect, it, vi } from 'vitest'
import schema from '../../../docs/openapi.json'
import * as api from './api'
import { createTestProduct, productRequest } from './test/testData'

type Operation = {
  security?: Record<string, string[]>[]
  parameters?: { in: string; name: string; required?: boolean }[]
  requestBody?: { required?: boolean }
}
type Paths = Record<string, Record<string, Operation>>

function assertCallMatchesContract(path: string, init: RequestInit, paths: Paths) {
  const url = new URL(path, 'http://localhost')
  const matches = Object.entries(paths).filter(([template]) => {
    const pattern = template.replace(/\{[^}]+\}/g, '[^/]+')
    return new RegExp(`^${pattern}$`).test(url.pathname)
  })
  const method = (init.method ?? 'GET').toLowerCase()
  const operation = matches.map(([, methods]) => methods[method]).find(Boolean)
  expect(operation, `${method.toUpperCase()} ${url.pathname} is absent from OpenAPI`).toBeDefined()
  if (!operation) return

  const headers = new Headers(init.headers)
  if (operation.security?.some((requirement) => 'HTTPBearer' in requirement)) {
    expect(headers.get('Authorization')).toMatch(/^Bearer \S+$/)
  }
  for (const parameter of operation.parameters ?? []) {
    if (parameter.in === 'header' && parameter.required) {
      expect(headers.get(parameter.name), `Missing header ${parameter.name}`).toBeTruthy()
    }
    if (parameter.in === 'query' && parameter.required) {
      expect(url.searchParams.has(parameter.name), `Missing query ${parameter.name}`).toBe(true)
    }
  }
  if (operation.requestBody?.required) {
    expect(headers.get('Content-Type')).toContain('application/json')
    expect(typeof init.body).toBe('string')
    expect(() => JSON.parse(init.body as string)).not.toThrow()
  }
  for (const name of url.searchParams.keys()) {
    expect(operation.parameters?.some((parameter) => parameter.in === 'query' && parameter.name === name),
      `Undocumented query parameter ${name}`).toBe(true)
  }
}

const paths: Paths = schema.paths
const token = 'contract-token'
const address: api.AddressRequest = {
  label: 'Home', recipient_name: 'Test', phone: '1234567890', city: 'City',
  district: 'District', address_line: 'Example address', postal_code: null, is_default: true,
}
const application: api.SellerApplicationRequest = {
  applicant_type: 'company', legal_name: 'Example', representative_name: null,
  store_name: 'Store', contact_phone: '1234567890', city: 'City', district: 'District',
  primary_category: 'Category', business_description: 'Description',
}
const calls: [string, () => Promise<unknown>][] = [
  ['identity', () => api.getCurrentUser(token)],
  ['home', () => api.getHome(token)],
  ['products', () => api.getProducts(token, 20, 0, { search: 'test', sort: 'name' })],
  ['create product', () => api.createProduct(token, productRequest(createTestProduct()))],
  ['update product', () => api.updateProduct(token, 1, productRequest(createTestProduct()))],
  ['delete product', () => api.deleteProduct(token, 1)],
  ['cart', () => api.getMyCart(token)],
  ['add cart item', () => api.addCartItem(token, { product_id: 1, quantity: 1 })],
  ['update cart item', () => api.updateCartItem(token, 1, { quantity: 2 })],
  ['delete cart item', () => api.deleteCartItem(token, 1)],
  ['create order', () => api.createOrder(token, 'key', { address_id: 1, delivery_method: 'standard' })],
  ['addresses', () => api.getMyAddresses(token)],
  ['create address', () => api.createAddress(token, address)],
  ['update address', () => api.updateAddress(token, 1, address)],
  ['delete address', () => api.deleteAddress(token, 1)],
  ['return', () => api.createProductReturn(token, 1, { order_item_id: 1, quantity: 1, reason: 'Reason' }, 'key')],
  ['orders', () => api.getMyOrders(token)],
  ['payment', () => api.createPayment(token, 1, 'key')],
  ['order', () => api.getMyOrder(token, 1)],
  ['admin orders', () => api.getAdminOrders(token)],
  ['seller orders', () => api.getSellerOrders(token)],
  ['seller status', () => api.updateSellerOrderStatus(token, 1, 'processing')],
  ['admin status', () => api.updateAdminOrderStatus(token, 1, 'processing')],
  ['admin refund', () => api.refundAdminOrder(token, 1, 'Reason')],
  ['my seller application', () => api.getMySellerApplication(token)],
  ['create seller application', () => api.createSellerApplication(token, application)],
  ['update seller application', () => api.updateMySellerApplication(token, application)],
  ['submit seller application', () => api.submitMySellerApplication(token)],
  ['withdraw seller application', () => api.withdrawMySellerApplication(token)],
  ['seller applications', () => api.getSellerApplications(token)],
  ['review seller application', () => api.reviewSellerApplication(token, 1, { action: 'approve' })],
]

describe('frontend calls against the OpenAPI contract', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each(calls)('%s', async (_name, call) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetchMock)
    await call()
    expect(fetchMock).toHaveBeenCalledOnce()
    const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    assertCallMatchesContract(path, init, paths)
  })

  it('rejects unknown paths and methods and missing required headers', () => {
    expect(() => assertCallMatchesContract('/api/v1/missing', {}, paths)).toThrow()
    expect(() => assertCallMatchesContract('/api/v1/orders', { method: 'PUT' }, paths)).toThrow()
    expect(() => assertCallMatchesContract('/api/v1/orders', {
      method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
      body: '{}',
    }, paths)).toThrow()
  })
})
