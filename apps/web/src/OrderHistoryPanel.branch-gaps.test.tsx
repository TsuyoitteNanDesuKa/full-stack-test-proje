import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OrderHistoryPanel from './OrderHistoryPanel'
import type { CustomerOrder } from './api'
import {
  ApiError,
  cancelMyOrder,
  createPayment,
  createProductReturn,
  getMyOrdersPage,
} from './api'

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  cancelMyOrder: vi.fn(),
  createPayment: vi.fn(),
  createProductReturn: vi.fn(),
  getMyOrdersPage: vi.fn(),
}))

const order: CustomerOrder = {
  id: 21,
  status: 'paid',
  payment_status: 'pending',
  item_subtotal: '25.00',
  total_amount: '25.00',
  shipping_address: null,
  delivery_method: 'standard',
  delivery_fee: '0.00',
  created_at: '2026-11-04T20:00:00Z',
  items: [
    {
      id: 31,
      product_id: 12,
      product_name: 'Sample product',
      unit_price: '12.50',
      quantity: 2,
      line_total: '25.00',
      fulfillment_id: null,
    },
  ],
  fulfillments: [],
  history: [],
  returns: [],
} as unknown as CustomerOrder

function page(items: CustomerOrder[], hasMore = false) {
  return { items, limit: 20, offset: 0, has_more: hasMore }
}

function deliveredOrder(): CustomerOrder {
  return {
    ...order,
    status: 'delivered',
    payment_status: 'succeeded',
    history: [
      {
        action: 'fulfillment_status_changed',
        from_status: 'shipped',
        to_status: 'delivered',
        reason: null,
        created_at: new Date().toISOString(),
        actor_subject: null,
      },
    ],
  } as unknown as CustomerOrder
}

describe('OrderHistoryPanel branch gaps', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('shows a load error and recovers when the retry button succeeds', async () => {
    vi.mocked(getMyOrdersPage)
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce(page([order]))
    const user = userEvent.setup()

    render(<OrderHistoryPanel token="buyer-token" refreshVersion={0} latestOrder={null} />)

    await user.click(screen.getByRole('button', { name: 'Siparişlerim' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sipariş geçmişi yüklenemedi. Lütfen tekrar dene.',
    )
    await user.click(screen.getByRole('button', { name: 'Yenile' }))

    expect(await screen.findByText(/#21/)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
  })

  it('shows a generic message when cancellation fails with a non-API error', async () => {
    vi.mocked(getMyOrdersPage).mockResolvedValue(page([order]))
    vi.mocked(cancelMyOrder).mockRejectedValueOnce(new TypeError('offline'))
    const user = userEvent.setup()

    render(<OrderHistoryPanel token="buyer-token" refreshVersion={0} latestOrder={null} />)
    await user.click(screen.getByRole('button', { name: 'Siparişlerim' }))
    await user.click(await screen.findByRole('button', { name: 'Siparişi iptal et' }))
    await user.click(await screen.findByRole('button', { name: 'Sipariş iptalini onayla' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sipariş iptal edilemedi. Bağlantıyı kontrol edip tekrar dene.',
    )
  })

  it('shows the API message when cancellation is rejected by the server', async () => {
    vi.mocked(getMyOrdersPage).mockResolvedValue(page([order]))
    vi.mocked(cancelMyOrder).mockRejectedValueOnce(
      new ApiError('Kargoya verilen paket nedeniyle sipariş iptal edilemez.', 409),
    )
    const user = userEvent.setup()

    render(<OrderHistoryPanel token="buyer-token" refreshVersion={0} latestOrder={null} />)
    await user.click(screen.getByRole('button', { name: 'Siparişlerim' }))
    await user.click(await screen.findByRole('button', { name: 'Siparişi iptal et' }))
    await user.click(await screen.findByRole('button', { name: 'Sipariş iptalini onayla' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Kargoya verilen paket nedeniyle sipariş iptal edilemez.',
    )
  })

  it('shows a payment start failure for the order', async () => {
    vi.mocked(getMyOrdersPage).mockResolvedValue(
      page([{ ...order, status: 'pending_payment' } as CustomerOrder]),
    )
    vi.mocked(createPayment).mockRejectedValueOnce(new Error('server'))
    const user = userEvent.setup()

    render(<OrderHistoryPanel token="buyer-token" refreshVersion={0} latestOrder={null} />)
    await user.click(screen.getByRole('button', { name: 'Siparişlerim' }))
    await user.click(await screen.findByRole('button', { name: 'Ödemeye devam et' }))

    expect(await screen.findByText('Ödeme başlatılamadı. Lütfen tekrar dene.')).toBeInTheDocument()
  })

  it('rejects a return reason shorter than five characters without calling the API', async () => {
    const delivered = deliveredOrder()
    vi.mocked(getMyOrdersPage).mockResolvedValue(page([delivered]))
    const user = userEvent.setup()

    render(<OrderHistoryPanel token="buyer-token" refreshVersion={0} latestOrder={null} />)
    await user.click(screen.getByRole('button', { name: 'Siparişlerim' }))
    await user.click(await screen.findByRole('button', { name: 'İade et Sample product' }))
    await user.type(screen.getByLabelText('İade nedeni'), 'abc')
    await user.click(screen.getByRole('button', { name: 'İade talebini gönder' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'İade miktarı ve en az 5 karakterlik nedeni kontrol et.',
    )
    expect(createProductReturn).not.toHaveBeenCalled()
  })

  it('shows a generic return error when the return request fails without an API message', async () => {
    const delivered = deliveredOrder()
    vi.mocked(getMyOrdersPage).mockResolvedValue(page([delivered]))
    vi.mocked(createProductReturn).mockRejectedValueOnce(new TypeError('offline'))
    const user = userEvent.setup()

    render(<OrderHistoryPanel token="buyer-token" refreshVersion={0} latestOrder={null} />)
    await user.click(screen.getByRole('button', { name: 'Siparişlerim' }))
    await user.click(await screen.findByRole('button', { name: 'İade et Sample product' }))
    await user.type(screen.getByLabelText('İade nedeni'), 'Customer requested refund')
    await user.click(screen.getByRole('button', { name: 'İade talebini gönder' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'İade talebi gönderilemedi. Bağlantıyı kontrol edip tekrar dene.',
    )
  })
})

