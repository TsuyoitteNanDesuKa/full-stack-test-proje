export interface TokenResponse {
  access_token: string
  token_type: 'bearer'
  expires_in: number
  is_admin: boolean
}

export interface HomeResponse {
  message: string
  featured_categories: string[]
}

export interface Product {
  id: number
  name: string
  category: string
  description: string
  price: string
  stock: number
}

export interface ProductListResponse {
  products: Product[]
  total: number
  limit: number
  offset: number
}

export interface ProductCreateRequest {
  name: string
  category: string
  description: string
  price: string
  stock: number
}

interface ApiErrorBody {
  detail?: string
}

export class ApiError extends Error {
  readonly status: number

  constructor(
    message: string,
    status: number,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => ({}))) as ApiErrorBody
    throw new ApiError(errorBody.detail ?? 'İstek tamamlanamadı.', response.status)
  }

  return (await response.json()) as T
}

export function login(email: string, password: string): Promise<TokenResponse> {
  return request<TokenResponse>('/api/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export function getHome(token: string): Promise<HomeResponse> {
  return request<HomeResponse>('/api/v1/home', {
    headers: { Authorization: `Bearer ${token}` },
  })
}

export function getProducts(
  token: string,
  limit = 20,
  offset = 0,
): Promise<ProductListResponse> {
  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  return request<ProductListResponse>(`/api/v1/products?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

export function createProduct(
  token: string,
  product: ProductCreateRequest,
): Promise<Product> {
  return request<Product>('/api/v1/products', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(product),
  })
}
