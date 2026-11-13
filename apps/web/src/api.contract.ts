import type * as Client from './api'
import type * as Schema from './openapi-generated'

type Assert<T extends true> = T
type Assignable<From, To> = [From] extends [To] ? true : false

// Responses flow from the server to the client; requests flow in the opposite direction.
export type ResponseContracts = [
  Assert<Assignable<Schema.CurrentUserResponse, Client.CurrentUserResponse>>,
  Assert<Assignable<Schema.HomeResponse, Client.HomeResponse>>,
  Assert<Assignable<Schema.ProductResponse, Client.Product>>,
  Assert<Assignable<Schema.ProductListResponse, Client.ProductListResponse>>,
  Assert<Assignable<Schema.CartResponse, Client.CartResponse>>,
  Assert<Assignable<Schema.AddressResponse, Client.CustomerAddress>>,
  Assert<Assignable<Schema.OrderResponse, Client.CustomerOrder>>,
  Assert<Assignable<Schema.AdminOrderResponse, Client.AdminOrder>>,
  Assert<Assignable<Schema.SellerOrderResponse, Client.SellerOrder>>,
  Assert<Assignable<Schema.ProductReturnResponse, Client.ProductReturn>>,
  Assert<Assignable<Schema.PaymentResponse, Client.CustomerPayment>>,
  Assert<Assignable<Schema.SellerApplicationResponse, Client.SellerApplication>>,
  Assert<Assignable<Schema.AdminSellerApplicationResponse, Client.AdminSellerApplication>>,
]

export type RequestContracts = [
  Assert<Assignable<Client.ProductCreateRequest, Schema.ProductCreateRequest>>,
  Assert<Assignable<Client.CartAddItemRequest, Schema.CartAddItemRequest>>,
  Assert<Assignable<Client.CartUpdateItemRequest, Schema.CartUpdateItemRequest>>,
  Assert<Assignable<Client.AddressRequest, Schema.AddressRequest>>,
  Assert<Assignable<Client.OrderCreateRequest, Schema.OrderCreateRequest>>,
  Assert<Assignable<Client.OrderCancellationRequest, Schema.OrderCancellationRequest>>,
  Assert<Assignable<Client.ProductReturnRequest, Schema.ProductReturnRequest>>,
  Assert<Assignable<Client.SellerApplicationRequest, Schema.SellerApplicationRequest>>,
  Assert<Assignable<Client.SellerApplicationReviewRequest, Schema.SellerApplicationReviewRequest>>,
  Assert<Assignable<{ status: Client.OrderFulfillmentStatus }, Schema.AdminOrderStatusRequest>>,
  Assert<Assignable<{ status: Client.OrderFulfillmentStatus }, Schema.SellerOrderStatusRequest>>,
  Assert<Assignable<{ reason: string }, Schema.AdminOrderRefundRequest>>,
]

// These negative controls must continue to fail assignability.
// @ts-expect-error An incompatible response field must not satisfy the client.
export type InvalidResponse = Assert<Assignable<Schema.OrderResponse, { id: string }>>
// @ts-expect-error A request missing the required address must not satisfy the schema.
export type InvalidRequest = Assert<Assignable<{ delivery_method: 'standard' }, Schema.OrderCreateRequest>>
