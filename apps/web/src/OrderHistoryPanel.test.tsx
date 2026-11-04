import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OrderHistoryPanel from './OrderHistoryPanel'
import { getMyOrders } from './api'
import type { CustomerOrder } from './api'

vi.mock('./api', () => ({
  getMyOrders: vi.fn(),
}))

const sampleOrder: CustomerOrder = {
  id: 21,
  status: 'pending_payment',
  total_amount: '25.00',
  created_at: '2026-11-04T20:00:00Z',
  items: [
    {
      id: 31,
      product_id: 42,
      product_name: 'Liva krem',
      unit_price: '12.50',
      quantity: 2,
      line_total: '25.00',
    },
  ],
}

describe('OrderHistoryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getMyOrders).mockResolvedValue([])
  })

  it('loads and displays order snapshots when opened', async () => {
    vi.mocked(getMyOrders).mockResolvedValue([sampleOrder])
    render(
      <OrderHistoryPanel
        latestOrder={null}
        refreshVersion={0}
        token="buyer-token"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Siparişlerim' }))

    expect(await screen.findByRole('heading', { name: 'Sipariş #21' })).toBeInTheDocument()
    expect(screen.getByText('Ödeme bekleniyor')).toBeInTheDocument()
    expect(screen.getByText('Liva krem · 2 adet · ₺25,00')).toBeInTheDocument()
    expect(getMyOrders).toHaveBeenCalledWith('buyer-token')
  })

  it('shows an empty state and latest order confirmation', async () => {
    render(
      <OrderHistoryPanel
        latestOrder={sampleOrder}
        refreshVersion={0}
        token="buyer-token"
      />,
    )

    expect(screen.getByRole('status')).toHaveTextContent(
      'Siparişin oluşturuldu: #21. Ödeme adımı bekleniyor.',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Siparişlerim' }))

    expect(await screen.findByText('Henüz siparişin yok.')).toBeInTheDocument()
  })

  it('allows retrying a failed order-history request', async () => {
    vi.mocked(getMyOrders)
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValueOnce([sampleOrder])
    render(
      <OrderHistoryPanel
        latestOrder={null}
        refreshVersion={0}
        token="buyer-token"
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Siparişlerim' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Sipariş geçmişi yüklenemedi.')
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }))

    expect(await screen.findByRole('heading', { name: 'Sipariş #21' })).toBeInTheDocument()
    expect(getMyOrders).toHaveBeenCalledTimes(2)
  })
})
