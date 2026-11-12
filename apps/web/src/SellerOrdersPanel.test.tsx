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
})
