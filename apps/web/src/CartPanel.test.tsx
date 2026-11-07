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
    isOpen: true,
    addresses: [savedAddress],
    isAddressLoading: false,
    selectedAddressId: savedAddress.id,
    deliveryMethod: 'standard',
    onToggle: vi.fn(),
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

describe('cart panel', () => {
  it('shows loading and empty-cart states', () => {
    const loading = renderCart(null, { isLoading: true })
    expect(screen.getByRole('status')).toHaveTextContent('Sepet yükleniyor')
    loading.unmount()

    renderCart({ items: [], subtotal: '0.00' })
    expect(screen.getByText('Sepetin henüz boş.')).toBeInTheDocument()
  })

  it('displays API errors and lets the buyer retry', async () => {
    const user = userEvent.setup()
    const { props } = renderCart(null, {
      error: 'Sepet yüklenemedi.',
      onRetry: vi.fn(),
    })

    expect(screen.getByRole('alert')).toHaveTextContent('Sepet yüklenemedi.')
    await user.click(screen.getByRole('button', { name: 'Tekrar dene' }))
    expect(props.onRetry).toHaveBeenCalledOnce()
  })

  it('submits a quantity change and removes an item', async () => {
    const user = userEvent.setup()
    const { props } = renderCart()
    const quantity = screen.getByRole('spinbutton', { name: 'Miktar: Cart product' })
    await user.clear(quantity)
    await user.type(quantity, '3')
    await user.click(screen.getByRole('button', { name: 'Miktarı güncelle' }))
    expect(props.onUpdate).toHaveBeenCalledWith(21, 3)

    await user.click(screen.getByRole('button', { name: 'Sepetten kaldır' }))
    expect(props.onRemove).toHaveBeenCalledWith(21)
  })

  it('marks a deleted product unavailable and only allows removing it', () => {
    const deletedItem: CartItem = {
      ...availableItem,
      product_id: null,
      unit_price: null,
      available_stock: null,
      is_available: false,
      line_total: null,
    }
    renderCart({ items: [deletedItem], subtotal: '0.00' })

    expect(screen.getByRole('status')).toHaveTextContent('Ürün artık mevcut değil.')
    expect(screen.getByRole('spinbutton', { name: 'Miktar: Cart product' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Miktarı güncelle' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Sepetten kaldır' })).toBeEnabled()
    expect(screen.getByText('₺0,00')).toBeInTheDocument()
  })

  it('disables checkout for unavailable stock and while submitting', () => {
    const unavailableItem = { ...availableItem, is_available: false }
    const unavailable = renderCart({
      items: [unavailableItem],
      subtotal: '0.00',
    })
    expect(screen.getByRole('button', { name: 'Siparişi oluştur' })).toBeDisabled()
    unavailable.unmount()

    renderCart(undefined, { isCheckingOut: true })
    expect(
      screen.getByRole('button', { name: 'Sipariş oluşturuluyor...' }),
    ).toBeDisabled()
  })

  it('starts checkout when the cart is available', async () => {
    const user = userEvent.setup()
    const { props } = renderCart()

    await user.click(screen.getByRole('button', { name: 'Siparişi oluştur' }))

    expect(props.onCheckout).toHaveBeenCalledOnce()
  })

  it('shows delivery pricing and lets the buyer change delivery selection', async () => {
    const user = userEvent.setup()
    const { props } = renderCart()

    expect(screen.getByText('Teslimat')).toBeInTheDocument()
    expect(screen.getByText('₺49,90')).toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Teslimat adresi' }), '8')
    await user.click(screen.getByRole('radio', { name: /Hızlı/ }))
    await user.click(screen.getByRole('button', { name: 'Adreslerimi yönet' }))

    expect(props.onSelectAddress).toHaveBeenCalledWith(8)
    expect(props.onSelectDeliveryMethod).toHaveBeenCalledWith('express')
    expect(props.onManageAddresses).toHaveBeenCalledOnce()
  })

  it.each([
    { subtotal: '999.99', method: 'standard' as const, fee: '₺49,90', total: '₺1.049,89' },
    { subtotal: '1000.00', method: 'standard' as const, fee: 'Ücretsiz', total: '₺1.000,00' },
    { subtotal: '1000.01', method: 'express' as const, fee: '₺89,90', total: '₺1.089,91' },
  ])('shows $method pricing for subtotal $subtotal', ({ subtotal, method, fee, total }) => {
    renderCart({ items: [availableItem], subtotal }, { deliveryMethod: method })

    expect(screen.getByText('Teslimat').parentElement).toHaveTextContent(fee)
    expect(screen.getByText('Sipariş toplamı').parentElement).toHaveTextContent(total)
  })

  it('opens and closes when the cart toggle is activated', () => {
    const { props, rerender } = renderCart(undefined, { isOpen: false })
    const toggle = screen.getByRole('button', { name: 'Sepet (2)' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(props.onToggle).toHaveBeenCalledOnce()

    rerender(<CartPanel {...props} isOpen />)
    expect(screen.getByRole('heading', { name: 'Sepetim' })).toBeInTheDocument()
  })
})
