export interface CurrentUserResponse {
  subject: string
  email: string | null
  roles: string[]
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
  updated_at: string | null
  can_manage: boolean
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

export type SellerApplicantType = 'individual' | 'sole_proprietor' | 'company'
export type SellerApplicationStatus =
  | 'draft'
  | 'submitted'
  | 'under_review'
  | 'changes_requested'
  | 'approval_pending'
  | 'approved'
  | 'rejected'
  | 'withdrawn'

export interface SellerApplicationRequest {
  applicant_type: SellerApplicantType
  legal_name: string
  representative_name: string | null
  store_name: string
  contact_phone: string
  city: string
  district: string
  primary_category: string
  business_description: string
}

export interface SellerApplication extends SellerApplicationRequest {
  id: number
  status: SellerApplicationStatus
  applicant_note: string | null
  created_at: string
  updated_at: string
}

export interface AdminSellerApplication extends SellerApplication {
  owner_subject: string
  admin_note: string | null
  reviewer_subject: string | null
  reviewed_at: string | null
}

export type SellerApplicationReviewAction =
  | 'begin_review'
  | 'request_changes'
  | 'reject'
  | 'approve'

export interface SellerApplicationReviewRequest {
  action: SellerApplicationReviewAction
  applicant_note?: string
  admin_note?: string
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

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export function getCurrentUser(token: string): Promise<CurrentUserResponse> {
  return request<CurrentUserResponse>('/api/v1/auth/me', {
    headers: { Authorization: `Bearer ${token}` },
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

export function updateProduct(
  token: string,
  productId: number,
  product: ProductCreateRequest,
): Promise<Product> {
  return request<Product>(`/api/v1/products/${productId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(product),
  })
}

export function deleteProduct(token: string, productId: number): Promise<void> {
  return request<void>(`/api/v1/products/${productId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export function getMySellerApplication(
  token: string,
): Promise<SellerApplication | null> {
  return request<SellerApplication | null>('/api/v1/seller-applications/me', {
    headers: { Authorization: `Bearer ${token}` },
  })
}

export function createSellerApplication(
  token: string,
  application: SellerApplicationRequest,
): Promise<SellerApplication> {
  return request<SellerApplication>('/api/v1/seller-applications', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(application),
  })
}

export function updateMySellerApplication(
  token: string,
  application: SellerApplicationRequest,
): Promise<SellerApplication> {
  return request<SellerApplication>('/api/v1/seller-applications/me', {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(application),
  })
}

export function submitMySellerApplication(
  token: string,
): Promise<SellerApplication> {
  return request<SellerApplication>('/api/v1/seller-applications/me/submit', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export function withdrawMySellerApplication(
  token: string,
): Promise<SellerApplication> {
  return request<SellerApplication>('/api/v1/seller-applications/me/withdraw', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export function getSellerApplications(
  token: string,
): Promise<AdminSellerApplication[]> {
  return request<AdminSellerApplication[]>('/api/v1/seller-applications', {
    headers: { Authorization: `Bearer ${token}` },
  })
}

export function reviewSellerApplication(
  token: string,
  applicationId: number,
  review: SellerApplicationReviewRequest,
): Promise<AdminSellerApplication> {
  return request<AdminSellerApplication>(
    `/api/v1/seller-applications/${applicationId}/review`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify(review),
    },
  )
}
