import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HomePage } from './App'
import type { CartResponse, CustomerAddress, CustomerOrder, OrderItem } from './api'
import type CartPanel from './CartPanel'
import type OrderHistoryPanel from './OrderHistoryPanel'
import { createTestProduct } from './test/testData'

vi.mock('./auth', () => ({
  beginLogin: vi.fn(),
  beginPasswordReset: vi.fn(),
  beginRegistration: vi.fn(),
  endSession: vi.fn(),
  getCurrentSession: vi.fn(),
}))

vi.mock('./CartPanel', () => ({
  default: (props: ComponentProps<typeof CartPanel>) => (
    <div>
      <p>cart-items:{props.cart ? props.cart.items.reduce((sum, item) => sum + item.quantity, 0) : 'none'}</p>
      <p>cart-loading:{String(props.isLoading)}</p>
      <p>cart-checking-out:{String(props.isCheckingOut)}</p>
      {props.error && <p role="alert">{props.error}</p>}
      <button onClick={() => void props.onUpdate(1, 2)} type="button">update</button>
      <button
        onClick={() => { void props.onUpdate(1, 2); void props.onUpdate(1, 3) }}
        type="button"
      >
        double update
      </button>
      <button
        onClick={() => { void props.onRemove(1); void props.onRemove(1) }}
        type="button"
      >
        double remove
      </button>
      <button onClick={() => void props.onCheckout()} type="button">checkout</button>
      <button
        onClick={() => { void props.onCheckout(); void props.onCheckout() }}
        type="button"
      >
        double checkout
      </button>
    </div>
  ),
}))

vi.mock('./OrderHistoryPanel', () => ({
  default: function MockOrderHistory(props: ComponentProps<typeof OrderHistoryPanel>) {
    const [outcome, setOutcome] = useState('idle')
    const restore = (token: string) => props.onRestoreCancelledOrder?.(token, orderItems)
    const report = (result: Awaited<ReturnType<NonNullable<typeof restore>>> | undefined) =>
      setOutcome(result ? result.items.map((item) => item.status).join(',') : 'null')
    return (
      <div>
        <p>latest-order:{props.latestOrder?.id ?? 'none'}</p>
        <p>outcome:{outcome}</p>
        <button onClick={() => void restore(props.token)?.then(report)} type="button">restore</button>
        <button
          onClick={() => { void restore(props.token); void restore(props.token)?.then(report) }}
          type="button"
        >
          double restore
        </button>
        <button onClick={() => void restore('other-token')?.then(report)} type="button">
          restore other token
        </button>
        <button
          onClick={() => void props.onRefreshCart?.(props.token).then((ok) => setOutcome(`refresh:${ok}`))}
          type="button"
        >
          refresh
        </button>
        <button
          onClick={() => void props.onRefreshCart?.('other-token').then((ok) => setOutcome(`refresh:${ok}`))}
          type="button"
        >
          refresh other token
        </button>
      </div>
    )
  },
}))

const product = createTestProduct({ id: 7, stock: 5, price: '12.50' })
const orderItems: OrderItem[] = [{
  id: 5,
  product_id: 7,
  product_name: product.name,
  unit_price: '12.50',
  quantity: 2,
  line_total: '25.00',
}]
const address: CustomerAddress = {
  id: 301,
  label: 'Ev',
  recipient_name: 'Ada Buyer',
  phone: '+905551234567',
  city: 'Istanbul',
  district: 'Kadikoy',
  address_line: 'Example Street 1',
  postal_code: null,
  is_default: true,
  created_at: '2026-11-04T20:00:00Z',
  updated_at: '2026-11-04T20:00:00Z',
}

type Handler = (headers: Headers) => Response | Promise<Response>
const routes = new Map<string, Handler>()
const calls: Array<{ key: string; headers: Headers }> = []

function cartWith(quantity: number): CartResponse {
  return {
    items: quantity === 0 ? [] : [{
      id: 1,
      product_id: product.id,
      product_name: product.name,
      unit_price: product.price,
      quantity,
      available_stock: product.stock,
      is_available: true,
      line_total: (quantity * 12.5).toFixed(2),
    }],
    subtotal: (quantity * 12.5).toFixed(2),
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status })
}

function count(key: string) {
  return calls.filter((call) => call.key === key).length
}

function orderKeys() {
  return calls
    .filter((call) => call.key === 'POST /api/v1/orders')
    .map((call) => call.headers.get('Idempotency-Key'))
}

function order(id: number): CustomerOrder {
  return { id, status: 'pending', items: orderItems } as unknown as CustomerOrder
}

function renderHome(token = 'token-a', subject = 'buyer-1') {
  const view = (nextToken: string, nextSubject: string) => (
    <HomePage
      email="buyer@example.com"
      isAdmin={false}
      message="Welcome"
      onLogout={vi.fn()}
      roles={['buyer']}
      sessionError={null}
      subject={nextSubject}
      token={nextToken}
    />
  )
  const utils = render(view(token, subject))
  return {
    ...utils,
    changeToken: (nextToken: string, nextSubject = subject) =>
      utils.rerender(view(nextToken, nextSubject)),
  }
}

async function openCart() {
  fireEvent.click(await screen.findByRole('button', { name: /^Sepet \(\d+\)$/ }))
  await screen.findByText(/cart-items:/)
}

async function openCartReadyForCheckout(addressLoads = 1) {
  await openCart()
  await screen.findByText('cart-loading:false')
  await waitFor(() => expect(count('GET /api/v1/addresses')).toBe(addressLoads))
}

beforeEach(() => {
  routes.clear()
  calls.length = 0
  routes.set('GET /api/v1/cart', () => json(cartWith(0)))
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)
    const key = `${init?.method ?? 'GET'} ${path.startsWith('/api/v1/products?') ? '/api/v1/products' : path}`
    const headers = new Headers(init?.headers)
    calls.push({ key, headers })
    const route = routes.get(key)
    if (route) return route(headers)
    if (key === 'GET /api/v1/products') {
      return json({ products: [product], total: 1, limit: 20, offset: 0 })
    }
    if (key === 'GET /api/v1/addresses') return json([address])
    if (key === 'GET /api/v1/seller-applications/me') return json(null)
    throw new Error(`Unexpected request: ${key}`)
  }))
})

describe('cart coordination', () => {
  it('reloads a cart load that went stale while a mutation was still running', async () => {
    const initialLoad = deferred<Response>()
    const pendingAdd = deferred<Response>()
    let loads = 0
    routes.set('GET /api/v1/cart', () => (++loads === 1 ? initialLoad.promise : json(cartWith(1))))
    routes.set('POST /api/v1/cart/items', () => pendingAdd.promise)
    renderHome()

    fireEvent.click(await screen.findByRole('button', { name: `Sepete ekle ${product.name}` }))
    await act(async () => {
      initialLoad.resolve(json(cartWith(0)))
      await initialLoad.promise
    })
    expect(loads).toBe(1)
    await act(async () => {
      pendingAdd.resolve(json(cartWith(1)))
      await pendingAdd.promise
    })

    await waitFor(() => expect(loads).toBe(2))
    await screen.findByText('cart-loading:false')
    expect(screen.getByRole('button', { name: 'Sepet (1)' })).toBeInTheDocument()
  })

  it('reloads when a stale cart load fails after the mutation already ended', async () => {
    const initialLoad = deferred<Response>()
    let loads = 0
    routes.set('GET /api/v1/cart', () => (++loads === 1 ? initialLoad.promise : json(cartWith(1))))
    routes.set('POST /api/v1/cart/items', () => json(cartWith(1)))
    renderHome()

    fireEvent.click(await screen.findByRole('button', { name: `Sepete ekle ${product.name}` }))
    await screen.findByText('cart-loading:true')
    await act(async () => {
      initialLoad.reject(new TypeError('offline'))
      await initialLoad.promise.catch(() => undefined)
    })

    await waitFor(() => expect(loads).toBe(2))
    await screen.findByText('cart-loading:false')
  })

  it('serializes repeated cart callbacks into a single request', async () => {
    routes.set('POST /api/v1/cart/items', () => json(cartWith(1)))
    routes.set('PUT /api/v1/cart/items/1', () => json(cartWith(2)))
    routes.set('DELETE /api/v1/cart/items/1', () => new Response(null, { status: 204 }))
    routes.set('POST /api/v1/orders', () => json(order(90), 201))
    renderHome()
    await openCartReadyForCheckout()

    const add = screen.getByRole('button', { name: `Sepete ekle ${product.name}` })
    await act(async () => {
      fireEvent.click(add)
      fireEvent.click(add)
    })
    await screen.findByText(/cart-items:1/)
    expect(count('POST /api/v1/cart/items')).toBe(1)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'double update' })) })
    await screen.findByText(/cart-items:2/)
    expect(count('PUT /api/v1/cart/items/1')).toBe(1)

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'double remove' })) })
    await waitFor(() => expect(count('DELETE /api/v1/cart/items/1')).toBe(1))
    await screen.findByText('cart-checking-out:false')

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'double checkout' })) })
    await screen.findByText('latest-order:90')
    expect(count('POST /api/v1/orders')).toBe(1)
  })

  it.each([
    { subject: 'buyer-1', sameKey: true },
    { subject: 'buyer-2', sameKey: false },
  ])('checkout key survives a token change only for the same buyer ($subject)', async ({
    subject,
    sameKey,
  }) => {
    routes.set('POST /api/v1/orders', () => { throw new TypeError('offline') })
    const { changeToken } = renderHome('token-a', 'buyer-1')
    await openCartReadyForCheckout()
    fireEvent.click(screen.getByRole('button', { name: 'checkout' }))
    await waitFor(() => expect(count('POST /api/v1/orders')).toBe(1))
    await screen.findByText('cart-checking-out:false')

    changeToken('token-b', subject)
    await screen.findByText('cart-loading:false')
    await waitFor(() => expect(count('GET /api/v1/addresses')).toBe(2))
    fireEvent.click(screen.getByRole('button', { name: 'checkout' }))
    await waitFor(() => expect(count('POST /api/v1/orders')).toBe(2))

    const keys = orderKeys()
    expect(keys[0]).toBeTruthy()
    expect(keys[0] === keys[1]).toBe(sameKey)
  })

  it('ignores an old-token checkout result but still releases its idempotency key', async () => {
    const firstOrder = deferred<Response>()
    let orders = 0
    routes.set('POST /api/v1/orders', () => (++orders === 1 ? firstOrder.promise : json(order(92), 201)))
    const { changeToken } = renderHome('token-a')
    await openCartReadyForCheckout()
    fireEvent.click(screen.getByRole('button', { name: 'checkout' }))
    await screen.findByText('cart-checking-out:true')

    changeToken('token-b')
    await screen.findByText('cart-checking-out:false')
    await act(async () => {
      firstOrder.resolve(json(order(91), 201))
      await firstOrder.promise
    })
    expect(screen.getByText('cart-checking-out:false')).toBeInTheDocument()
    expect(screen.getByText('latest-order:none')).toBeInTheDocument()

    await screen.findByText('cart-loading:false')
    await waitFor(() => expect(count('GET /api/v1/addresses')).toBe(2))
    fireEvent.click(screen.getByRole('button', { name: 'checkout' }))
    await screen.findByText('latest-order:92')
    const keys = orderKeys()
    expect(keys[0]).not.toBe(keys[1])
  })

  it('keeps the idempotency key when an old-token checkout fails', async () => {
    const firstOrder = deferred<Response>()
    let orders = 0
    routes.set('POST /api/v1/orders', () => (++orders === 1 ? firstOrder.promise : json(order(93), 201)))
    const { changeToken } = renderHome('token-a')
    await openCartReadyForCheckout()
    fireEvent.click(screen.getByRole('button', { name: 'checkout' }))
    await screen.findByText('cart-checking-out:true')
    changeToken('token-b')
    await screen.findByText('cart-checking-out:false')
    await act(async () => {
      firstOrder.reject(new TypeError('offline'))
      await firstOrder.promise.catch(() => undefined)
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    await screen.findByText('cart-loading:false')
    await waitFor(() => expect(count('GET /api/v1/addresses')).toBe(2))
    fireEvent.click(screen.getByRole('button', { name: 'checkout' }))
    await screen.findByText('latest-order:93')
    const keys = orderKeys()
    expect(keys[0]).toBe(keys[1])
  })

  it('never shows the previous token cart, order or badge after a failed cart load', async () => {
    routes.set('GET /api/v1/cart', (headers) => (
      headers.get('Authorization') === 'Bearer token-a'
        ? json(cartWith(2))
        : json({ detail: 'down' }, 503)
    ))
    routes.set('POST /api/v1/orders', () => json(order(94), 201))
    const { changeToken } = renderHome('token-a')
    await screen.findByRole('button', { name: 'Sepet (2)' })
    await openCartReadyForCheckout()
    fireEvent.click(screen.getByRole('button', { name: 'checkout' }))
    await screen.findByText('latest-order:94')

    changeToken('token-b')

    expect(await screen.findByRole('button', { name: 'Sepet (0)' })).toBeInTheDocument()
    expect(await screen.findByText('cart-items:none')).toBeInTheDocument()
    expect(await screen.findByText('cart-loading:false')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Sepet yüklenemedi')
    expect(screen.getByText('latest-order:none')).toBeInTheDocument()
  })

  it('drops a cart update that resolves after the token changed', async () => {
    const pendingUpdate = deferred<Response>()
    routes.set('GET /api/v1/cart', (headers) => json(
      cartWith(headers.get('Authorization') === 'Bearer token-a' ? 1 : 3),
    ))
    routes.set('PUT /api/v1/cart/items/1', () => pendingUpdate.promise)
    const { changeToken } = renderHome('token-a')
    await openCart()
    await screen.findByRole('button', { name: 'Sepet (1)' })
    fireEvent.click(screen.getByRole('button', { name: 'update' }))
    await waitFor(() => expect(count('PUT /api/v1/cart/items/1')).toBe(1))

    changeToken('token-b')
    await screen.findByRole('button', { name: 'Sepet (3)' })
    await act(async () => {
      pendingUpdate.resolve(json(cartWith(2)))
      await pendingUpdate.promise
    })

    expect(screen.getByRole('button', { name: 'Sepet (3)' })).toBeInTheDocument()
  })

  it('does not report an add failure of the old token on the new token', async () => {
    const pendingAdd = deferred<Response>()
    routes.set('POST /api/v1/cart/items', () => pendingAdd.promise)
    const { changeToken } = renderHome('token-a')
    fireEvent.click(await screen.findByRole('button', { name: `Sepete ekle ${product.name}` }))
    await waitFor(() => expect(count('POST /api/v1/cart/items')).toBe(1))

    changeToken('token-b')
    await act(async () => {
      pendingAdd.reject(new TypeError('offline'))
      await pendingAdd.promise.catch(() => undefined)
    })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Sepete ekle ${product.name}` })).toBeEnabled()
  })
})

describe('old-token results after a token change', () => {
  it('drops a successful add that resolves for the previous token', async () => {
    const pendingAdd = deferred<Response>()
    routes.set('POST /api/v1/cart/items', () => pendingAdd.promise)
    const { changeToken } = renderHome('token-a')
    fireEvent.click(await screen.findByRole('button', { name: `Sepete ekle ${product.name}` }))
    await waitFor(() => expect(count('POST /api/v1/cart/items')).toBe(1))

    changeToken('token-b')
    await act(async () => {
      pendingAdd.resolve(json(cartWith(4)))
      await pendingAdd.promise
    })

    expect(screen.getByRole('button', { name: 'Sepet (0)' })).toBeInTheDocument()
  })

  it.each([
    { action: 'update', route: 'PUT /api/v1/cart/items/1' },
    { action: 'double remove', route: 'DELETE /api/v1/cart/items/1' },
  ])('hides a failed $action of the previous token', async ({ action, route }) => {
    const pending = deferred<Response>()
    routes.set(route, () => pending.promise)
    const { changeToken } = renderHome('token-a')
    await openCart()
    fireEvent.click(screen.getByRole('button', { name: action }))
    await waitFor(() => expect(count(route)).toBe(1))

    changeToken('token-b')
    await act(async () => {
      pending.reject(new TypeError('offline'))
      await pending.promise.catch(() => undefined)
    })

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('does not release a checkout key that now belongs to another buyer', async () => {
    const firstOrder = deferred<Response>()
    let orders = 0
    routes.set('POST /api/v1/orders', () => {
      if (++orders === 1) return firstOrder.promise
      throw new TypeError('offline')
    })
    const { changeToken } = renderHome('token-a', 'buyer-1')
    await openCartReadyForCheckout()
    fireEvent.click(screen.getByRole('button', { name: 'checkout' }))
    await screen.findByText('cart-checking-out:true')
    changeToken('token-b', 'buyer-2')
    await screen.findByText('cart-loading:false')
    await waitFor(() => expect(count('GET /api/v1/addresses')).toBe(2))
    fireEvent.click(screen.getByRole('button', { name: 'checkout' }))
    await waitFor(() => expect(count('POST /api/v1/orders')).toBe(2))
    await screen.findByText('cart-checking-out:false')

    await act(async () => {
      firstOrder.resolve(json(order(95), 201))
      await firstOrder.promise
    })
    fireEvent.click(screen.getByRole('button', { name: 'checkout' }))
    await waitFor(() => expect(count('POST /api/v1/orders')).toBe(3))

    const keys = orderKeys()
    expect(keys[1]).toBe(keys[2])
    expect(keys[0]).not.toBe(keys[1])
  })
})

describe('cancelled order restore coordination', () => {
  it('commits each added item and rejects repeated or foreign-token restores', async () => {
    routes.set('POST /api/v1/cart/items', () => json(cartWith(2)))
    renderHome()
    await screen.findByRole('button', { name: 'Sepet (0)' })

    fireEvent.click(screen.getByRole('button', { name: 'restore' }))
    await screen.findByText('outcome:added')
    await screen.findByRole('button', { name: 'Sepet (2)' })

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'double restore' }))
    })
    await screen.findByText('outcome:null')
    expect(count('POST /api/v1/cart/items')).toBe(2)

    fireEvent.click(screen.getByRole('button', { name: 'restore other token' }))
    await screen.findByText('outcome:null')
    expect(count('POST /api/v1/cart/items')).toBe(2)
  })

  it('shows an unknown-outcome warning when the follow-up cart read also fails', async () => {
    let cartReads = 0
    routes.set('GET /api/v1/cart', () => (++cartReads === 1 ? json(cartWith(0)) : json({ detail: 'down' }, 503)))
    routes.set('POST /api/v1/cart/items', () => json({ detail: 'boom' }, 500))
    renderHome()
    await openCart()
    await screen.findByText('cart-loading:false')

    fireEvent.click(screen.getByRole('button', { name: 'restore' }))

    await screen.findByText('outcome:unknown')
    await waitFor(() => expect(cartReads).toBeGreaterThan(2))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sepet yüklenemedi')
  })

  it('does not report a failed follow-up read for a token that is no longer active', async () => {
    const followUp = deferred<Response>()
    let cartReads = 0
    routes.set('GET /api/v1/cart', () => (++cartReads === 2 ? followUp.promise : json(cartWith(0))))
    routes.set('POST /api/v1/cart/items', () => json({ detail: 'boom' }, 500))
    const { changeToken } = renderHome('token-a')
    await openCart()
    await screen.findByText('cart-loading:false')
    fireEvent.click(screen.getByRole('button', { name: 'restore' }))
    await waitFor(() => expect(cartReads).toBe(2))

    changeToken('token-b')
    await act(async () => {
      followUp.reject(new TypeError('offline'))
      await followUp.promise.catch(() => undefined)
    })

    await screen.findByText('cart-loading:false')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('opens the cart on refresh and reports failures', async () => {
    let failRefresh = false
    routes.set('GET /api/v1/cart', () => (failRefresh ? json({ detail: 'down' }, 503) : json(cartWith(1))))
    renderHome()
    await screen.findByRole('button', { name: 'Sepet (1)' })

    fireEvent.click(screen.getByRole('button', { name: 'refresh' }))
    await screen.findByText('outcome:refresh:true')
    expect(screen.getByText(/cart-items:1/)).toBeInTheDocument()

    failRefresh = true
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }))
    await screen.findByText('outcome:refresh:false')
    expect(screen.getByRole('alert')).toHaveTextContent('Sepet yenilenemedi')
  })

  it('refuses a refresh for another token, during a mutation, or after the cart changed', async () => {
    const pendingAdd = deferred<Response>()
    const refresh = deferred<Response>()
    let cartReads = 0
    routes.set('GET /api/v1/cart', () => (++cartReads === 2 ? refresh.promise : json(cartWith(0))))
    routes.set('POST /api/v1/cart/items', () => pendingAdd.promise)
    renderHome()
    await screen.findByRole('button', { name: 'Sepet (0)' })

    fireEvent.click(screen.getByRole('button', { name: 'refresh other token' }))
    await screen.findByText('outcome:refresh:false')
    expect(cartReads).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: 'refresh' }))
    await waitFor(() => expect(cartReads).toBe(2))
    fireEvent.click(screen.getByRole('button', { name: `Sepete ekle ${product.name}` }))
    await waitFor(() => expect(count('POST /api/v1/cart/items')).toBe(1))
    await act(async () => {
      refresh.resolve(json(cartWith(9)))
      await refresh.promise
    })
    await screen.findByText('outcome:refresh:false')

    fireEvent.click(screen.getByRole('button', { name: 'refresh' }))
    await waitFor(() => expect(screen.getByText('outcome:refresh:false')).toBeInTheDocument())
    expect(cartReads).toBe(2)
    await act(async () => {
      pendingAdd.resolve(json(cartWith(1)))
      await pendingAdd.promise
    })
  })

  it('does not apply a failed refresh to a different token', async () => {
    const refresh = deferred<Response>()
    let cartReads = 0
    routes.set('GET /api/v1/cart', () => (++cartReads === 2 ? refresh.promise : json(cartWith(1))))
    const { changeToken } = renderHome('token-a')
    await screen.findByRole('button', { name: 'Sepet (1)' })
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }))
    await waitFor(() => expect(cartReads).toBe(2))

    changeToken('token-b')
    await act(async () => {
      refresh.reject(new TypeError('offline'))
      await refresh.promise.catch(() => undefined)
    })

    await screen.findByText('outcome:refresh:false')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
