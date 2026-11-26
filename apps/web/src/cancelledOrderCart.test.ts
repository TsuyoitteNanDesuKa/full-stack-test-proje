import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addCartItem, ApiError } from './api'
import type { CartResponse, OrderItem } from './api'
import { addCancelledOrderItemsToCart } from './cancelledOrderCart'

vi.mock('./api', async (importOriginal) => ({
  ...await importOriginal<typeof import('./api')>(),
  addCartItem: vi.fn(),
}))

const items: OrderItem[] = [
  {
    id: 1,
    product_id: 11,
    product_name: 'Liva krem',
    unit_price: '10.00',
    quantity: 2,
    line_total: '20.00',
  },
  {
    id: 2,
    product_id: 12,
    product_name: 'Silinmiş ürün',
    unit_price: '15.00',
    quantity: 1,
    line_total: '15.00',
  },
  {
    id: 3,
    product_id: 13,
    product_name: 'Stoku yetersiz ürün',
    unit_price: '20.00',
    quantity: 3,
    line_total: '60.00',
  },
]

const cart: CartResponse = { items: [], subtotal: '0.00' }

describe('addCancelledOrderItemsToCart', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(addCartItem).mockReset()
  })

  it('continues past deleted and insufficient-stock items and uses original quantities', async () => {
    vi.mocked(addCartItem)
      .mockResolvedValueOnce(cart)
      .mockRejectedValueOnce(new ApiError('Ürün artık mevcut değil.', 404))
      .mockRejectedValueOnce(new ApiError('Stok yetersiz.', 409))
    const onCartUpdated = vi.fn()

    const result = await addCancelledOrderItemsToCart('buyer-token', items, {
      isCurrentToken: () => true,
      onCartUpdated,
    })

    expect(addCartItem).toHaveBeenNthCalledWith(1, 'buyer-token', {
      product_id: 11,
      quantity: 2,
    })
    expect(result.items.map(({ status }) => status)).toEqual([
      'added',
      'deleted',
      'insufficient_stock',
    ])
    expect(result.uncertain).toBe(false)
    expect(onCartUpdated).toHaveBeenCalledWith(cart)
  })

  it('stops after an ambiguous failure and does not send later additions', async () => {
    vi.mocked(addCartItem)
      .mockResolvedValueOnce(cart)
      .mockRejectedValueOnce(new TypeError('Network unavailable'))
      .mockResolvedValueOnce(cart)

    const result = await addCancelledOrderItemsToCart('buyer-token', items, {
      isCurrentToken: () => true,
      onCartUpdated: vi.fn(),
    })

    expect(result.items.map(({ status }) => status)).toEqual([
      'added',
      'unknown',
      'not_attempted',
    ])
    expect(result.uncertain).toBe(true)
    expect(addCartItem).toHaveBeenCalledTimes(2)
  })

  it('treats a server error as unknown and stops without retrying', async () => {
    vi.mocked(addCartItem)
      .mockRejectedValueOnce(new ApiError('Server error', 503))
      .mockResolvedValueOnce(cart)

    const result = await addCancelledOrderItemsToCart('buyer-token', items, {
      isCurrentToken: () => true,
      onCartUpdated: vi.fn(),
    })

    expect(result.items.map(({ status }) => status)).toEqual([
      'unknown',
      'not_attempted',
      'not_attempted',
    ])
    expect(result.uncertain).toBe(true)
    expect(addCartItem).toHaveBeenCalledTimes(1)
  })

  it('stops on authorization and other non-item failures', async () => {
    vi.mocked(addCartItem).mockRejectedValueOnce(new ApiError('Unauthorized', 401))

    const result = await addCancelledOrderItemsToCart('buyer-token', items, {
      isCurrentToken: () => true,
      onCartUpdated: vi.fn(),
    })

    expect(result.items.map(({ status }) => status)).toEqual([
      'failed',
      'not_attempted',
      'not_attempted',
    ])
    expect(result.uncertain).toBe(false)
    expect(addCartItem).toHaveBeenCalledTimes(1)
  })
})
