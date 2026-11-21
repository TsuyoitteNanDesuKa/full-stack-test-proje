import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminOrdersPanel from './AdminOrdersPanel'
import type { AdminOrder } from './api'
import { getAdminOrders, refundAdminOrder, updateAdminOrderStatus } from './api'

vi.mock('./api', () => ({
  getAdminOrders: vi.fn(),
  refundAdminOrder: vi.fn(),
  updateAdminOrderStatus: vi.fn(),
}))

const paidOrder: AdminOrder = {
  id: 21,
  owner_subject: 'buyer-subject',
  status: 'paid',
  payment_status: 'succeeded',
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
    },
  ],
  fulfillments: [],
  history: [],
} as unknown as AdminOrder

describe('AdminOrdersPanel branch gaps', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('reports an error when the admin orders response is not a list', async () => {
    vi.mocked(getAdminOrders).mockResolvedValueOnce({ unexpected: true } as unknown as AdminOrder[])

    render(<AdminOrdersPanel token="admin-token" />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Siparişler yüklenemedi. Lütfen tekrar dene.',
    )
  })

  it('shows an error from the refresh button when reloading returns an invalid payload', async () => {
    vi.mocked(getAdminOrders)
      .mockResolvedValueOnce([paidOrder])
      .mockResolvedValueOnce({ unexpected: true } as unknown as AdminOrder[])
    const user = userEvent.setup()

    render(<AdminOrdersPanel token="admin-token" />)
    await screen.findByText(/#21/)
    await user.click(screen.getByRole('button', { name: 'Yenile' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Siparişler yüklenemedi. Lütfen tekrar dene.',
    )
  })

  it('ignores a late response after the panel unmounts', async () => {
    let resolveLoad: (value: AdminOrder[]) => void = () => {}
    vi.mocked(getAdminOrders).mockReturnValueOnce(
      new Promise<AdminOrder[]>((resolve) => {
        resolveLoad = resolve
      }),
    )

    const { unmount } = render(<AdminOrdersPanel token="admin-token" />)
    unmount()
    resolveLoad([paidOrder])

    await waitFor(() => expect(getAdminOrders).toHaveBeenCalledTimes(1))
  })

  it('does not submit a refund when the reason is shorter than five characters', async () => {
    vi.mocked(getAdminOrders).mockResolvedValue([paidOrder])
    const user = userEvent.setup()

    render(<AdminOrdersPanel token="admin-token" />)
    await user.type(await screen.findByLabelText('İptal/iade nedeni'), 'abcd')
    await user.click(screen.getByRole('button', { name: 'İptal et ve yerel iade kaydı oluştur' }))

    expect(refundAdminOrder).not.toHaveBeenCalled()
  })

  it('shows the recorded event reason in the order history', async () => {
    vi.mocked(getAdminOrders).mockResolvedValue([
      {
        ...paidOrder,
        history: [
          {
            action: 'admin_status_changed',
            from_status: 'paid',
            to_status: 'processing',
            reason: 'Stok kontrolü yapıldı',
            created_at: '2026-11-04T20:10:00Z',
            actor_subject: 'admin',
          },
        ],
      } as AdminOrder,
    ])

    render(<AdminOrdersPanel token="admin-token" />)

    expect(await screen.findByText('Stok kontrolü yapıldı')).toBeInTheDocument()
  })

  it('reports a status update failure and keeps the order list unchanged', async () => {
    vi.mocked(getAdminOrders).mockResolvedValue([paidOrder])
    vi.mocked(updateAdminOrderStatus).mockRejectedValueOnce(new Error('conflict'))
    const user = userEvent.setup()

    render(<AdminOrdersPanel token="admin-token" />)
    await user.click(await screen.findByRole('button', { name: 'Hazırlanıyor aşamasına geçir' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sipariş #21 güncellenemedi. Durumu yenileyip tekrar dene.',
    )
    expect(screen.getByRole('button', { name: 'Hazırlanıyor aşamasına geçir' })).toBeEnabled()
  })
})
