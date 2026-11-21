import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OrderHistoryPanel from './OrderHistoryPanel'
import type { CustomerOrder } from './api'
import { cancelMyOrder, getMyOrdersPage } from './api'

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  cancelMyOrder: vi.fn(),
  createPayment: vi.fn(),
  createProductReturn: vi.fn(),
  getMyOrdersPage: vi.fn(),
}))

const pendingOrder = {
  id: 21,
  status: 'pending_payment',
  payment_status: 'pending',
  item_subtotal: '25.00',
  total_amount: '25.00',
  shipping_address: null,
  delivery_method: 'standard',
  delivery_fee: '0.00',
  created_at: '2026-11-04T20:00:00Z',
  items: [],
  fulfillments: [],
  history: [],
  returns: [],
} as unknown as CustomerOrder

function page(items: CustomerOrder[], offset = 0, hasMore = false) {
  return { items, limit: 20, offset, has_more: hasMore }
}

describe('OrderHistoryPanel remaining gaps', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('shows the latest order confirmation and hides it after that order is cancelled', async () => {
    vi.mocked(getMyOrdersPage).mockResolvedValue(page([pendingOrder]))
    vi.mocked(cancelMyOrder).mockResolvedValueOnce({
      ...pendingOrder,
      status: 'cancelled',
      history: [
        {
          action: 'buyer_cancelled',
          from_status: 'pending_payment',
          to_status: 'cancelled',
          reason: null,
          created_at: '2026-11-04T20:20:00Z',
          actor_subject: 'buyer',
        },
      ],
    } as unknown as CustomerOrder)
    const user = userEvent.setup()

    render(<OrderHistoryPanel token="buyer-token" refreshVersion={0} latestOrder={pendingOrder} />)
    expect(screen.getByText(/Siparişin oluşturuldu: #21/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Siparişlerim' }))
    await user.click(await screen.findByRole('button', { name: 'Siparişi iptal et' }))
    await user.click(screen.getByRole('button', { name: 'Sipariş iptalini onayla' }))

    expect(await screen.findByText('Siparişin iptal edildi.')).toBeInTheDocument()
    expect(screen.queryByText(/Siparişin oluşturuldu: #21/)).not.toBeInTheDocument()
  })

  it('shows the empty-page message on a later page without orders', async () => {
    vi.mocked(getMyOrdersPage)
      .mockResolvedValueOnce(page([pendingOrder], 0, true))
      .mockResolvedValueOnce(page([], 20, false))
    const user = userEvent.setup()

    render(<OrderHistoryPanel token="buyer-token" refreshVersion={0} latestOrder={null} />)
    await user.click(screen.getByRole('button', { name: 'Siparişlerim' }))
    await user.click(await screen.findByRole('button', { name: 'Sonraki sayfa' }))

    expect(await screen.findByText('Bu sayfada sipariş yok.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Önceki sayfa' })).toBeEnabled()
  })

  it('reloads the first page when the signed-in token changes while the panel is open', async () => {
    vi.mocked(getMyOrdersPage).mockResolvedValue(page([pendingOrder]))
    const user = userEvent.setup()

    const { rerender } = render(
      <OrderHistoryPanel token="buyer-token" refreshVersion={0} latestOrder={null} />,
    )
    await user.click(screen.getByRole('button', { name: 'Siparişlerim' }))
    await screen.findByText(/#21/)

    rerender(<OrderHistoryPanel token="other-buyer-token" refreshVersion={0} latestOrder={null} />)

    expect(getMyOrdersPage).toHaveBeenLastCalledWith('other-buyer-token', 20, 0)
  })

  it('offers the hosted test checkout link for an order awaiting payment', async () => {
    vi.mocked(getMyOrdersPage).mockResolvedValue(page([pendingOrder]))
    const user = userEvent.setup()

    render(<OrderHistoryPanel token="buyer-token" refreshVersion={0} latestOrder={null} />)
    await user.click(screen.getByRole('button', { name: 'Siparişlerim' }))
    expect(await screen.findByRole('button', { name: 'Ödemeye devam et' })).toBeInTheDocument()
  })
})
