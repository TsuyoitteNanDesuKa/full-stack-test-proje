import { addCartItem, ApiError } from './api'
import type { CartResponse, OrderItem } from './api'

export type CancelledOrderCartItemStatus =
  | 'added'
  | 'deleted'
  | 'insufficient_stock'
  | 'failed'
  | 'unknown'
  | 'not_attempted'

export interface CancelledOrderCartItemResult {
  item: OrderItem
  status: CancelledOrderCartItemStatus
  message?: string
}

export interface CancelledOrderCartResult {
  items: CancelledOrderCartItemResult[]
  uncertain: boolean
  cancelled: boolean
}

export async function addCancelledOrderItemsToCart(
  token: string,
  items: OrderItem[],
  options: {
    isCurrentToken: () => boolean
    onCartUpdated: (cart: CartResponse) => void
  },
): Promise<CancelledOrderCartResult> {
  const results: CancelledOrderCartItemResult[] = []

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    if (!options.isCurrentToken()) {
      return { items: results, uncertain: false, cancelled: true }
    }

    if (item.product_id === null) {
      results.push({ item, status: 'deleted' })
      continue
    }

    try {
      const cart = await addCartItem(token, {
        product_id: item.product_id,
        quantity: item.quantity,
      })
      if (!options.isCurrentToken()) {
        return { items: results, uncertain: false, cancelled: true }
      }
      options.onCartUpdated(cart)
      results.push({ item, status: 'added' })
    } catch (error) {
      if (!options.isCurrentToken()) {
        return { items: results, uncertain: false, cancelled: true }
      }
      if (error instanceof ApiError && error.status === 404) {
        results.push({ item, status: 'deleted' })
        continue
      }
      if (error instanceof ApiError && error.status === 409) {
        results.push({ item, status: 'insufficient_stock' })
        continue
      }
      if (error instanceof ApiError && error.status < 500) {
        results.push({
          item,
          status: 'failed',
          message: error.message,
        })
        items.slice(index + 1).forEach((unattemptedItem) => {
          results.push({
            item: unattemptedItem,
            status: 'not_attempted',
            message: 'Önceki kalem başarısız olduğu için gönderilmedi.',
          })
        })
        return { items: results, uncertain: false, cancelled: false }
      }
      results.push({
        item,
        status: 'unknown',
        message: 'İsteğin sonucu doğrulanamadı.',
      })
      items.slice(index + 1).forEach((unattemptedItem) => {
        results.push({
          item: unattemptedItem,
          status: 'not_attempted',
          message: 'Sonucu belirsiz olan önceki istek nedeniyle gönderilmedi.',
        })
      })
      return { items: results, uncertain: true, cancelled: false }
    }
  }

  return { items: results, uncertain: false, cancelled: false }
}
