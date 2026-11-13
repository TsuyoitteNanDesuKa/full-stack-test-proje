import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SellerOrdersPanel from './SellerOrdersPanel'
import { getSellerOrders, updateSellerOrderStatus } from './api'
import type { SellerOrder } from './api'

vi.mock('./api', () => ({
  getSellerOrders: vi.fn(),
  updateSellerOrderStatus: vi.fn(),
}))

const sellerOrder: SellerOrder = {
  id: 21,
  order_id: 8,
  store_name: 'Sample Store',
  status: 'paid',
  created_at: '2026-11-04T20:00:00Z',
  updated_at: '2026-11-04T20:00:00Z',
  shipping_address: {
    label: 'Ev',
    recipient_name: 'Sample Buyer',
    phone: '05551234567',
    city: 'İstanbul',
    district: 'Kadıköy',
    address_line: 'Örnek Sokak 1',
    postal_code: null,
  },
  items: [{
    id: 4,
    product_id: 2,
    product_name: 'Bakım ürünü',
    unit_price: '100.00',
    quantity: 2,
    line_total: '200.00',
  }],
  history: [{
    action: 'payment_succeeded',
    from_status: 'pending_payment',
    to_status: 'paid',
    created_at: '2026-11-04T20:00:00Z',
  }],
}

describe('SellerOrdersPanel', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(getSellerOrders).mockResolvedValue([sellerOrder])
  })

  it('shows seller-scoped fulfillment details and advances a package status', async () => {
    const user = userEvent.setup()
    vi.mocked(updateSellerOrderStatus).mockResolvedValue({
      ...sellerOrder,
      status: 'processing',
    })
    render(<SellerOrdersPanel token="seller-token" />)

    expect(await screen.findByText('Sample Store')).toBeInTheDocument()
    expect(screen.getByText('Bakım ürünü · 2 adet')).toBeInTheDocument()
    expect(screen.getByText(/Örnek Sokak 1/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Hazırlanmaya al' }))

    expect(updateSellerOrderStatus).toHaveBeenCalledWith('seller-token', 21, 'processing')
    expect(await screen.findByText('Hazırlanıyor')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Sipariş #8 paketinin durumu güncellendi.',
    )
  })

  it('reports load failures and allows retrying', async () => {
    vi.mocked(getSellerOrders)
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce([])
    const user = userEvent.setup()
    render(<SellerOrdersPanel token="seller-token" />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Satıcı siparişleri yüklenemedi.',
    )
    await user.click(screen.getByRole('button', { name: 'Yenile' }))
    await waitFor(() => expect(getSellerOrders).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('Henüz mağazana ait sipariş bulunmuyor.'))
      .toBeInTheDocument()
  })

  it('reports a status update failure without changing the displayed order', async () => {
    vi.mocked(updateSellerOrderStatus).mockRejectedValueOnce(new Error('conflict'))
    const user = userEvent.setup()
    render(<SellerOrdersPanel token="seller-token" />)
    await user.click(await screen.findByRole('button', { name: 'Hazırlanmaya al' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sipariş #8 güncellenemedi.',
    )
    expect(screen.getByText('Ödendi')).toBeInTheDocument()
  })

  it('shows each audit event and an unknown event without exposing an actor', async () => {
    if (!sellerOrder.shipping_address) throw new Error('Expected seller delivery address')
    const actions = [
      ['created', 'Satıcı paketi oluşturuldu'],
      ['seller_status_changed', 'Satıcı paket durumunu güncelledi'],
      ['admin_status_changed', 'Yönetici paket durumunu güncelledi'],
      ['admin_refund', 'Paket iptal edildi'],
      ['legacy_import', 'Önceki paket kaydı'],
      ['payment_failed', 'Paket durumu güncellendi'],
    ]
    vi.mocked(getSellerOrders).mockResolvedValue([{
      ...sellerOrder,
      shipping_address: { ...sellerOrder.shipping_address, postal_code: '34710' },
      history: actions.map(([action]) => ({
        ...sellerOrder.history[0],
        action,
        actor_subject: 'private-actor',
      })),
    }])
    render(<SellerOrdersPanel token="seller-token" />)

    expect(await screen.findByText(/34710/)).toBeInTheDocument()
    for (const [, label] of actions) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.queryByText(/private-actor/)).not.toBeInTheDocument()
  })

  it('advances a processing package to delivered and prevents further updates', async () => {
    const processing: SellerOrder = {
      ...sellerOrder,
      status: 'processing',
      shipping_address: null,
    }
    vi.mocked(getSellerOrders).mockResolvedValue([processing])
    vi.mocked(updateSellerOrderStatus)
      .mockResolvedValueOnce({ ...processing, status: 'shipped' })
      .mockResolvedValueOnce({ ...processing, status: 'delivered' })
    const user = userEvent.setup()
    render(<SellerOrdersPanel token="seller-token" />)

    await user.click(await screen.findByRole('button', { name: 'Gönderildi olarak işaretle' }))
    await user.click(await screen.findByRole('button', { name: 'Teslim edildi olarak işaretle' }))
    expect(await screen.findByText('Teslim edildi')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /olarak işaretle/ })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Sipariş 8 teslimat bilgileri')).not.toBeInTheDocument()
    expect(updateSellerOrderStatus).toHaveBeenNthCalledWith(1, 'seller-token', 21, 'shipped')
    expect(updateSellerOrderStatus).toHaveBeenNthCalledWith(2, 'seller-token', 21, 'delivered')
  })

  it('reports a failed refresh after loading and recovers on retry', async () => {
    vi.mocked(getSellerOrders)
      .mockResolvedValueOnce([sellerOrder])
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce([sellerOrder])
    const user = userEvent.setup()
    render(<SellerOrdersPanel token="seller-token" />)

    await screen.findByText('Sample Store')
    await user.click(screen.getByRole('button', { name: 'Yenile' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Satıcı siparişleri yüklenemedi.')
    await user.click(screen.getByRole('button', { name: 'Yenile' }))
    expect(await screen.findByText('Sample Store')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
