import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminOrdersPanel from './AdminOrdersPanel'
import type { AdminOrder } from './api'
import {
  getAdminOrders,
  refundAdminOrder,
  updateAdminOrderStatus,
} from './api'

vi.mock('./api', () => ({
  getAdminOrders: vi.fn(),
  refundAdminOrder: vi.fn(),
  updateAdminOrderStatus: vi.fn(),
}))

const sampleOrder: AdminOrder = {
  id: 21,
  owner_subject: 'buyer-subject',
  status: 'paid',
  payment_status: 'succeeded',
  item_subtotal: '25.00',
  total_amount: '74.90',
  shipping_address: {
    label: 'Ev',
    recipient_name: 'Ada Buyer',
    phone: '+905551234567',
    city: 'Istanbul',
    district: 'Kadikoy',
    address_line: 'Example Street 1',
    postal_code: null,
  },
  delivery_method: 'standard',
  delivery_fee: '49.90',
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
  fulfillments: [{
    id: 33,
    store_name: 'Sample Store',
    status: 'paid',
    items: [{
      id: 31,
      product_id: 12,
      product_name: 'Sample product',
      unit_price: '12.50',
      quantity: 2,
      line_total: '25.00',
    }],
    history: [{
      action: 'payment_succeeded',
      from_status: 'pending_payment',
      to_status: 'paid',
      created_at: '2026-11-04T20:01:00Z',
      actor_subject: null,
    }],
  }],
  history: [
    {
      action: 'payment_succeeded',
      from_status: 'pending_payment',
      to_status: 'paid',
      reason: null,
      created_at: '2026-11-04T20:01:00Z',
      actor_subject: null,
    },
  ],
}

describe('AdminOrdersPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getAdminOrders).mockResolvedValue([sampleOrder])
  })

  it('updates order fulfillment and records a local refund with a required reason', async () => {
    const user = userEvent.setup()
    const processingOrder: AdminOrder = {
      ...sampleOrder,
      status: 'processing',
    }
    const refundedOrder: AdminOrder = {
      ...sampleOrder,
      status: 'cancelled',
      payment_status: 'refunded',
    }
    vi.mocked(updateAdminOrderStatus).mockResolvedValue(processingOrder)
    vi.mocked(refundAdminOrder).mockResolvedValue(refundedOrder)

    render(<AdminOrdersPanel token="admin-token" />)

    expect(await screen.findByText('Sample Store')).toBeInTheDocument()
    const packages = screen.getByRole('region', { name: 'Sipariş 21 satıcı paketleri' })
    expect(within(packages).getByText('Sample product · 2 adet')).toBeInTheDocument()
    expect(packages).toHaveTextContent('Sample Store')
    expect(screen.getByText('İşlemi yapan: Sistem')).toBeInTheDocument()
    expect(screen.getByText('Teslimat adresi')).toBeInTheDocument()
    expect(screen.getByText(/Standart teslimat:/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Hazırlanıyor aşamasına geçir' }))
    await waitFor(() => {
      expect(updateAdminOrderStatus).toHaveBeenCalledWith(
        'admin-token',
        21,
        'processing',
      )
    })

    const reason = screen.getByRole('textbox', { name: 'İptal/iade nedeni' })
    expect(screen.getByText(/gerçek para transferi yapmaz/)).toBeInTheDocument()
    expect(screen.getByRole('button', {
      name: 'İptal et ve yerel iade kaydı oluştur',
    })).toBeDisabled()
    await user.type(reason, 'Alıcı talebi')
    await user.click(screen.getByRole('button', {
      name: 'İptal et ve yerel iade kaydı oluştur',
    }))

    await waitFor(() => {
      expect(refundAdminOrder).toHaveBeenCalledWith('admin-token', 21, 'Alıcı talebi')
    })
    expect(await screen.findByText('İptal edildi')).toBeInTheDocument()
  })

  it('shows an explicit message when orders cannot be loaded', async () => {
    vi.mocked(getAdminOrders).mockRejectedValue(new Error('network error'))

    render(<AdminOrdersPanel token="admin-token" />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Siparişler yüklenemedi. Lütfen tekrar dene.',
    )
  })

  it('recovers after a failed refresh', async () => {
    vi.mocked(getAdminOrders)
      .mockRejectedValueOnce(new Error('initial failure'))
      .mockRejectedValueOnce(new Error('retry failure'))
      .mockResolvedValueOnce([sampleOrder])
    const user = userEvent.setup()
    render(<AdminOrdersPanel token="admin-token" />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Siparişler yüklenemedi.')
    await user.click(screen.getByRole('button', { name: 'Yenile' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Siparişler yüklenemedi.')
    await user.click(screen.getByRole('button', { name: 'Yenile' }))
    expect(await screen.findByRole('heading', { name: 'Sipariş #21' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(getAdminOrders).toHaveBeenCalledTimes(3)
  })

  it('reports status update and refund failures without losing the order or reason', async () => {
    vi.mocked(updateAdminOrderStatus).mockRejectedValue(new Error('status failure'))
    vi.mocked(refundAdminOrder).mockRejectedValue(new Error('refund failure'))
    const user = userEvent.setup()
    render(<AdminOrdersPanel token="admin-token" />)

    await user.click(await screen.findByRole('button', { name: 'Hazırlanıyor aşamasına geçir' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Sipariş #21 güncellenemedi.')
    const reason = screen.getByRole('textbox', { name: 'İptal/iade nedeni' })
    await user.type(reason, '  Alıcı talebi  ')
    await user.click(screen.getByRole('button', { name: 'İptal et ve yerel iade kaydı oluştur' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sipariş #21 için iade kaydı oluşturulamadı.',
    )
    expect(refundAdminOrder).toHaveBeenCalledWith('admin-token', 21, 'Alıcı talebi')
    expect(reason).toHaveValue('  Alıcı talebi  ')
    expect(screen.getByRole('heading', { name: 'Sipariş #21' })).toBeInTheDocument()
  })

  it('displays fulfillment audit actors and hides refund actions for shipped orders', async () => {
    vi.mocked(getAdminOrders).mockResolvedValue([{
      ...sampleOrder,
      status: 'shipped',
      fulfillments: [{
        ...sampleOrder.fulfillments[0],
        status: 'shipped',
        history: [{
          action: 'seller_status_changed',
          from_status: 'processing',
          to_status: 'shipped',
          actor_subject: 'seller-subject',
          created_at: '2026-11-04T20:01:00Z',
        }],
      }],
    }])
    render(<AdminOrdersPanel token="admin-token" />)

    expect(await screen.findByText('Satıcı paket durumunu güncelledi')).toBeInTheDocument()
    expect(screen.getByText('İşlemi yapan: seller-subject')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'İptal/iade nedeni' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Teslim edildi aşamasına geçir' })).toBeEnabled()
  })
})
