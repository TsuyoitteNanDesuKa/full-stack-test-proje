import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import CartPanel from './CartPanel'
import type { CartItem, CartResponse } from './api'

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

function renderCart(
  cart: CartResponse | null = { items: [availableItem], subtotal: '25.00' },
  overrides: Partial<Parameters<typeof CartPanel>[0]> = {},
) {
  const props: Parameters<typeof CartPanel>[0] = {
    cart,
    isLoading: false,
    isMutating: false,
    error: '',
    isOpen: true,
    onToggle: vi.fn(),
    onRetry: vi.fn(),
    onUpdate: vi.fn().mockResolvedValue(undefined),
    onRemove: vi.fn().mockResolvedValue(undefined),
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
    expect(screen.getByText(/0,00/)).toBeInTheDocument()
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
