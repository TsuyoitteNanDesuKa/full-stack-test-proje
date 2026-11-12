import axe from 'axe-core'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AddressBookPanel from './AddressBookPanel'
import AdminOrdersPanel from './AdminOrdersPanel'
import CartPanel from './CartPanel'
import OrderHistoryPanel from './OrderHistoryPanel'
import ProductCreatePage from './ProductCreatePage'
import type { CartItem, CustomerAddress, CustomerOrder } from './api'
import { getAdminOrders, getMyOrders } from './api'

vi.mock('./api', async (importOriginal) => ({
  ...await importOriginal<typeof import('./api')>(),
  createPayment: vi.fn(),
  createProductReturn: vi.fn(),
  getAdminOrders: vi.fn(),
  getMyOrders: vi.fn(),
  refundAdminOrder: vi.fn(),
  updateAdminOrderStatus: vi.fn(),
}))

const address: CustomerAddress = {
  id: 8,
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

const cartItem: CartItem = {
  id: 21,
  product_id: 7,
  product_name: 'Cart product',
  unit_price: '12.50',
  quantity: 2,
  available_stock: 5,
  is_available: true,
  line_total: '25.00',
}

const order: CustomerOrder = {
  id: 21,
  status: 'pending_payment',
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
  fulfillments: [],
  history: [{
    action: 'created',
    from_status: null,
    to_status: 'pending_payment',
    reason: null,
    created_at: '2026-11-04T20:00:00Z',
  }],
  items: [{
    id: 31,
    product_id: 7,
    product_name: 'Cart product',
    unit_price: '12.50',
    quantity: 2,
    line_total: '25.00',
  }],
}

async function expectNoAccessibilityViolations(container: HTMLElement) {
  const results = await axe.run(container, {
    rules: {
      'color-contrast': { enabled: false },
    },
    runOnly: {
      type: 'tag',
      values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
    },
  })
  const violations = results.violations.map((violation) => {
    const targets = violation.nodes.map((node) => node.target.join(', ')).join('; ')
    return `${violation.id} (${violation.impact}): ${violation.help} [${targets}]`
  })
  expect(violations).toEqual([])
}

describe('critical flow accessibility', () => {
  beforeEach(() => {
    vi.mocked(getAdminOrders).mockResolvedValue([])
    vi.mocked(getMyOrders).mockResolvedValue([order])
  })

  it('has no WCAG 2.1 A/AA violations in the product form', async () => {
    const { container } = render(
      <ProductCreatePage
        token="admin-token"
        onCancel={vi.fn()}
        onSaved={vi.fn()}
      />,
    )
    await expectNoAccessibilityViolations(container)
  })

  it('has no WCAG 2.1 A/AA violations in address management', async () => {
    const { container } = render(
      <main>
        <AddressBookPanel
          addresses={[address]}
          isLoading={false}
          loadError=""
          onRetry={vi.fn()}
          onSaved={vi.fn()}
          token="buyer-token"
        />
      </main>,
    )
    await expectNoAccessibilityViolations(container)
  })

  it('has no WCAG 2.1 A/AA violations in cart and checkout', async () => {
    const { container } = render(
      <main>
        <CartPanel
          addresses={[address]}
          cart={{ items: [cartItem], subtotal: '25.00' }}
          deliveryMethod="standard"
          error=""
          isAddressLoading={false}
          isCheckingOut={false}
          isLoading={false}
          isMutating={false}
          isOpen
          onCheckout={vi.fn().mockResolvedValue(undefined)}
          onManageAddresses={vi.fn()}
          onRemove={vi.fn().mockResolvedValue(undefined)}
          onRetry={vi.fn()}
          onSelectAddress={vi.fn()}
          onSelectDeliveryMethod={vi.fn()}
          onToggle={vi.fn()}
          onUpdate={vi.fn().mockResolvedValue(undefined)}
          selectedAddressId={address.id}
        />
      </main>,
    )
    await expectNoAccessibilityViolations(container)
  })

  it('has no WCAG 2.1 A/AA violations in order history', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <main>
        <OrderHistoryPanel latestOrder={null} refreshVersion={0} token="buyer-token" />
      </main>,
    )
    await user.click(screen.getByRole('button', { name: 'Siparişlerim' }))
    await screen.findByRole('heading', { name: 'Sipariş #21' })
    await expectNoAccessibilityViolations(container)
  })

  it('has no WCAG 2.1 A/AA violations in admin order management', async () => {
    const { container } = render(
      <main>
        <AdminOrdersPanel token="admin-token" />
      </main>,
    )
    await screen.findByText('Henüz sipariş bulunmuyor.')
    await expectNoAccessibilityViolations(container)
  })

  it('keeps product form controls in keyboard order', async () => {
    const user = userEvent.setup()
    render(
      <ProductCreatePage
        token="admin-token"
        onCancel={vi.fn()}
        onSaved={vi.fn()}
      />,
    )
    const expectedFocusOrder = [
      screen.getByRole('link', { name: 'Liva ana sayfa' }),
      screen.getByRole('button', { name: 'Ürün listesine dön' }),
      screen.getByLabelText('Ürün adı'),
      screen.getByLabelText('Kategori'),
      screen.getByLabelText('Açıklama'),
      screen.getByLabelText('Fiyat (TL)'),
      screen.getByLabelText('Stok adedi'),
      screen.getByRole('button', { name: 'İptal' }),
      screen.getByRole('button', { name: 'Ürünü kaydet' }),
    ]

    for (const control of expectedFocusOrder) {
      await user.tab()
      expect(document.activeElement).toBe(control)
    }
  })

  it('keeps the address form keyboard reachable', async () => {
    const user = userEvent.setup()
    render(
      <main>
        <AddressBookPanel
          addresses={[]}
          isLoading={false}
          loadError=""
          onRetry={vi.fn()}
          onSaved={vi.fn()}
          token="buyer-token"
        />
      </main>,
    )
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Yenile' }))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByLabelText('Adres başlığı'))
  })

  it('keeps checkout actions keyboard reachable in document order', async () => {
    const user = userEvent.setup()
    render(
      <main>
        <CartPanel
          addresses={[address]}
          cart={{ items: [cartItem], subtotal: '25.00' }}
          deliveryMethod="standard"
          error=""
          isAddressLoading={false}
          isCheckingOut={false}
          isLoading={false}
          isMutating={false}
          isOpen
          onCheckout={vi.fn().mockResolvedValue(undefined)}
          onManageAddresses={vi.fn()}
          onRemove={vi.fn().mockResolvedValue(undefined)}
          onRetry={vi.fn()}
          onSelectAddress={vi.fn()}
          onSelectDeliveryMethod={vi.fn()}
          onToggle={vi.fn()}
          onUpdate={vi.fn().mockResolvedValue(undefined)}
          selectedAddressId={address.id}
        />
      </main>,
    )
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Sepet (2)' }))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('spinbutton', { name: 'Miktar: Cart product' }))
    const addressSelect = screen.getByRole('combobox', { name: 'Teslimat adresi' })
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Miktarı güncelle' }))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Sepetten kaldır' }))
    await user.tab()
    expect(document.activeElement).toBe(addressSelect)
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Adreslerimi yönet' }))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: /Standart/ }))
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Siparişi oluştur' }))
  })

  it('keeps focus on the order history trigger when the panel opens', async () => {
    const user = userEvent.setup()
    render(
      <main>
        <OrderHistoryPanel latestOrder={null} refreshVersion={0} token="buyer-token" />
      </main>,
    )
    const trigger = screen.getByRole('button', { name: 'Siparişlerim' })
    trigger.focus()
    await user.keyboard('{Enter}')

    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(document.activeElement).toBe(trigger)
    await screen.findByRole('heading', { name: 'Sipariş #21' })
    await user.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Yenile' }))
  })
})
