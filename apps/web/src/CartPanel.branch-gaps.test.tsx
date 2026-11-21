import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import CartPanel from './CartPanel'
import type { CartItem, CartResponse, CustomerAddress } from './api'

const availableItem: CartItem = {
  id: 21,
  product_id: 7,
  product_name: 'Cart product',
  unit_price: '12.50',
  quantity: 2,
  available_stock: 5,
  is_available: true,
  line_total: '25.00',
}

const savedAddress: CustomerAddress = {
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

function renderCart(
  cart: CartResponse | null = { items: [availableItem], subtotal: '25.00' },
  overrides: Partial<Parameters<typeof CartPanel>[0]> = {},
) {
  const props: Parameters<typeof CartPanel>[0] = {
    cart,
    isLoading: false,
    isMutating: false,
    isCheckingOut: false,
    error: '',
    addresses: [savedAddress],
    isAddressLoading: false,
    selectedAddressId: savedAddress.id,
    deliveryMethod: 'standard',
    onManageAddresses: vi.fn(),
    onSelectAddress: vi.fn(),
    onSelectDeliveryMethod: vi.fn(),
    onRetry: vi.fn(),
    onUpdate: vi.fn().mockResolvedValue(undefined),
    onRemove: vi.fn().mockResolvedValue(undefined),
    onCheckout: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
  return { ...render(<CartPanel {...props} />), props }
}

describe('cart panel branch gaps', () => {
  it('shows a fallback message when the cart could not be loaded', () => {
    renderCart(null)

    expect(screen.getByText('Sepet bilgisi alınamadı.')).toBeInTheDocument()
  })

  it('shows the removed-product message for a line whose product no longer exists', () => {
    renderCart({
      items: [{ ...availableItem, product_id: null, is_available: false, unit_price: null }],
      subtotal: '0.00',
    })

    expect(screen.getByText('Ürün artık mevcut değil.')).toBeInTheDocument()
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('rejects a quantity above available stock without calling update', async () => {
    const { props } = renderCart()
    const user = userEvent.setup()

    const input = screen.getByLabelText('Miktar: Cart product')
    await user.clear(input)
    await user.type(input, '9')
    fireEvent.submit(input.closest('form') as HTMLFormElement)

    expect(await screen.findByText('Miktar mevcut stok içinde olmalıdır.')).toBeInTheDocument()
    expect(props.onUpdate).not.toHaveBeenCalled()
  })
})
