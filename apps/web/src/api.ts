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
  can_manage?: boolean
}

export interface ProductListResponse {
  products: Product[]
  total: number
  limit: number
  offset: number
}

export interface ProductSearchParams {
  search?: string
  category?: string
  min_price?: string
  max_price?: string
  sort?: 'id' | 'name' | 'price_asc' | 'price_desc'
}

export interface ProductCreateRequest {
  name: string
  category: string
  description: string
  price: string
  stock: number
}

export interface CartItem {
  id: number
  product_id: number | null
  product_name: string
  unit_price: string | null
  quantity: number
  available_stock: number | null
  is_available: boolean
  line_total: string | null
}

export interface CartResponse {
  items: CartItem[]
  subtotal: string
}

export interface CartAddItemRequest {
  product_id: number
  quantity: number
}

export interface CartUpdateItemRequest {
  quantity: number
}

export type DeliveryMethod = 'standard' | 'express'

export interface CustomerAddress {
  id: number
  label: string
  recipient_name: string
  phone: string
  city: string
  district: string
  address_line: string
  postal_code: string | null
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface AddressRequest {
  label: string
  recipient_name: string
  phone: string
  city: string
  district: string
  address_line: string
  postal_code: string | null
  is_default: boolean
}

export interface OrderCreateRequest {
  address_id: number
  delivery_method: DeliveryMethod
}

export const deliveryPricing = {
  standardFee: 49.9,
  expressFee: 89.9,
  freeStandardThreshold: 1000,
} as const

export type OrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'processing'
  | 'shipped'
  | 'delivered'
  | 'cancelled'

export type OrderFulfillmentStatus = 'processing' | 'shipped' | 'delivered'

export interface OrderStatusEvent {
  action: string
  from_status: OrderStatus | null
  to_status: OrderStatus
  reason: string | null
  created_at: string
}

export interface AdminOrderStatusEvent extends OrderStatusEvent {
  actor_subject: string | null
}

export interface OrderItem {
  id: number
  product_id: number | null
  product_name: string
  unit_price: string
  quantity: number
  line_total: string
}

export interface OrderFulfillmentEvent {
  action: string
  from_status: OrderStatus | null
  to_status: OrderStatus
  created_at: string
  actor_subject?: string | null
}

export interface OrderFulfillment {
  id: number
  store_name: string
  status: OrderStatus
  items: OrderItem[]
  history: OrderFulfillmentEvent[]
}

export interface SellerOrder extends OrderFulfillment {
  order_id: number
  created_at: string
  updated_at: string
  shipping_address: Omit<CustomerAddress, 'id' | 'is_default' | 'created_at' | 'updated_at'> | null
}

export interface ProductReturn {
  id: number
  order_item_id: number
  product_name: string
  quantity: number
  reason: string
  status: string
  refund_amount: string
  created_at: string
}

export interface ProductReturnRequest {
  order_item_id: number
  quantity: number
  reason: string
}

export interface CustomerOrder {
  id: number
  status: OrderStatus
  item_subtotal: string
  total_amount: string
  shipping_address: Omit<CustomerAddress, 'id' | 'is_default' | 'created_at' | 'updated_at'> | null
  delivery_method: DeliveryMethod | null
  delivery_fee: string
  created_at: string
  items: OrderItem[]
  fulfillments: OrderFulfillment[]
  returns?: ProductReturn[]
  history: OrderStatusEvent[]
}

export interface AdminOrder extends Omit<CustomerOrder, 'history'> {
  owner_subject: string
  payment_status: PaymentStatus | null
  history: AdminOrderStatusEvent[]
  fulfillments: Array<OrderFulfillment & {
    history: Array<OrderFulfillmentEvent & { actor_subject: string | null }>
  }>
}

export type PaymentStatus =
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'expired'
  | 'partially_refunded'
  | 'refunded'

export interface CustomerPayment {
  id: number
  order_id: number
  provider_reference: string
  status: PaymentStatus
  amount: string
  currency: string
  expires_at: string
  checkout_url: string | null
  created_at: string
  updated_at: string
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
  filters: ProductSearchParams = {},
): Promise<ProductListResponse> {
  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      query.set(key, value)
    }
  }
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

export function getMyCart(token: string): Promise<CartResponse> {
  return request<CartResponse>('/api/v1/cart', {
    headers: { Authorization: `Bearer ${token}` },
  })
}

export function addCartItem(
  token: string,
  item: CartAddItemRequest,
): Promise<CartResponse> {
  return request<CartResponse>('/api/v1/cart/items', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(item),
  })
}

export function updateCartItem(
  token: string,
  itemId: number,
  item: CartUpdateItemRequest,
): Promise<CartResponse> {
  return request<CartResponse>(`/api/v1/cart/items/${itemId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(item),
  })
}

export function deleteCartItem(token: string, itemId: number): Promise<void> {
  return request<void>(`/api/v1/cart/items/${itemId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export function createOrder(
  token: string,
  idempotencyKey: string,
  checkout: OrderCreateRequest,
): Promise<CustomerOrder> {
  return request<CustomerOrder>('/api/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(checkout),
  })
}

export function getMyAddresses(token: string): Promise<CustomerAddress[]> {
  return request<CustomerAddress[]>('/api/v1/addresses', {
    headers: { Authorization: `Bearer ${token}` },
  })
}

export function createAddress(
  token: string,
  address: AddressRequest,
): Promise<CustomerAddress> {
  return request<CustomerAddress>('/api/v1/addresses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(address),
  })
}

export function updateAddress(
  token: string,
  addressId: number,
  address: AddressRequest,
): Promise<CustomerAddress> {
  return request<CustomerAddress>(`/api/v1/addresses/${addressId}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(address),
  })
}

export function deleteAddress(token: string, addressId: number): Promise<void> {
  return request<void>(`/api/v1/addresses/${addressId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}

export function createProductReturn(
  token: string,
  orderId: number,
  requestBody: ProductReturnRequest,
  idempotencyKey: string,
): Promise<ProductReturn> {
  return request<ProductReturn>(`/api/v1/orders/${orderId}/returns`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(requestBody),
  })
}

export function getMyOrders(token: string): Promise<CustomerOrder[]> {
  return request<CustomerOrder[]>('/api/v1/orders', {
    headers: { Authorization: `Bearer ${token}` },
  })
}

export function createPayment(
  token: string,
  orderId: number,
  idempotencyKey: string,
): Promise<CustomerPayment> {
  return request<CustomerPayment>(`/api/v1/orders/${orderId}/payments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': idempotencyKey,
    },
  })
}

export function getMyOrder(token: string, orderId: number): Promise<CustomerOrder> {
  return request<CustomerOrder>(`/api/v1/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
}

export function getAdminOrders(token: string): Promise<AdminOrder[]> {
  return request<AdminOrder[]>('/api/v1/admin/orders', {
    headers: { Authorization: `Bearer ${token}` },
  })
}

export function getSellerOrders(
  token: string,
  limit = 50,
  offset = 0,
): Promise<SellerOrder[]> {
  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) })
  return request<SellerOrder[]>(`/api/v1/seller/orders?${query}`, {
    headers: { Authorization: ['Bearer', token].join(' ') },
  })
}

export function updateSellerOrderStatus(
  token: string,
  fulfillmentId: number,
  orderStatus: OrderFulfillmentStatus,
): Promise<SellerOrder> {
  return request<SellerOrder>(`/api/v1/seller/orders/${fulfillmentId}/status`, {
    method: 'PATCH',
    headers: {
      Authorization: ['Bearer', token].join(' '),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: orderStatus }),
  })
}

export function updateAdminOrderStatus(
  token: string,
  orderId: number,
  orderStatus: OrderFulfillmentStatus,
): Promise<AdminOrder> {
  return request<AdminOrder>(`/api/v1/admin/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: orderStatus }),
  })
}

export function refundAdminOrder(
  token: string,
  orderId: number,
  reason: string,
): Promise<AdminOrder> {
  return request<AdminOrder>(`/api/v1/admin/orders/${orderId}/refund`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reason }),
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
