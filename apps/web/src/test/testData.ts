import type { Product, ProductCreateRequest } from '../api'

function testLabel(prefix: string): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:T.Z]/g, '')
    .slice(0, 14)
  const suffix = Math.random().toString(36).slice(2, 7).padEnd(5, '0')
  return `${prefix}-${timestamp}-${suffix}`
}

export function createTestProduct(
  overrides: Partial<Product> = {},
): Product {
  const priceCents = Math.floor(Math.random() * 99_999_900) + 100
  return {
    id: Math.floor(Math.random() * 100_000) + 1,
    name: testLabel('Product'),
    category: testLabel('Category'),
    description: `Test description ${testLabel('Catalog')}`,
    price: `${Math.floor(priceCents / 100)}.${String(priceCents % 100).padStart(2, '0')}`,
    stock: Math.floor(Math.random() * 1_000_000),
    updated_at: null,
    can_manage: false,
    ...overrides,
  }
}

export function productRequest(product: Product): ProductCreateRequest {
  return {
    name: product.name,
    category: product.category,
    description: product.description,
    price: product.price,
    stock: product.stock,
  }
}
