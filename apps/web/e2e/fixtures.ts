import { createHash } from 'node:crypto'
import { expect, test as base } from '@playwright/test'
import type { APIRequestContext, APIResponse, Page, TestInfo } from '@playwright/test'
import { authenticateAs, createTestAccessToken } from './deterministicAuth'

const apiBaseUrl = 'http://127.0.0.1:8001/api/v1'

export interface ProductSeed {
  name: string
  category: string
  description: string
  price: string
  stock: number
}

export interface AddressSeed {
  label: string
  recipient_name: string
  phone: string
  city: string
  district: string
  address_line: string
  postal_code: string
  is_default: boolean
}

async function requireStatus(
  response: APIResponse,
  expectedStatus: number,
  operation: string,
): Promise<void> {
  if (response.status() !== expectedStatus) {
    throw new Error(
      `${operation} failed with status ${response.status()}: ${await response.text()}`,
    )
  }
}

class ScenarioApi {
  constructor(
    private readonly request: APIRequestContext,
    private readonly scenarioId: string,
  ) {}

  token(role: 'admin' | 'buyer'): string {
    return createTestAccessToken(role, this.scenarioId)
  }

  headers(role: 'admin' | 'buyer'): { authorization: string } {
    return { authorization: `Bearer ${this.token(role)}` }
  }

  async createProduct(
    product: ProductSeed,
  ): Promise<{ id: number; name: string }> {
    const response = await this.request.post(`${apiBaseUrl}/products`, {
      data: product,
      headers: this.headers('admin'),
    })
    await requireStatus(response, 201, 'Creating a seeded product')
    return (await response.json()) as { id: number; name: string }
  }

  async createAddress(
    address: AddressSeed,
  ): Promise<{ id: number }> {
    const response = await this.request.post(`${apiBaseUrl}/addresses`, {
      data: address,
      headers: this.headers('buyer'),
    })
    await requireStatus(response, 201, 'Creating a seeded address')
    return (await response.json()) as { id: number }
  }

  async addCartItem(productId: number): Promise<void> {
    const response = await this.request.post(`${apiBaseUrl}/cart/items`, {
      data: { product_id: productId, quantity: 1 },
      headers: this.headers('buyer'),
    })
    await requireStatus(response, 200, 'Adding a seeded cart item')
  }

  async createOrder(addressId: number): Promise<{ id: number }> {
    const response = await this.request.post(`${apiBaseUrl}/orders`, {
      data: { address_id: addressId, delivery_method: 'standard' },
      headers: {
        ...this.headers('buyer'),
        'Idempotency-Key': this.scenarioId,
      },
    })
    await requireStatus(response, 201, 'Creating a seeded order')
    return (await response.json()) as { id: number }
  }
}

export interface E2EScenario {
  id: string
  api: ScenarioApi
  authenticate: (page: Page, role: 'admin' | 'buyer') => Promise<void>
}

interface ScenarioFixtures {
  scenario: E2EScenario
}

function createScenarioId(testInfo: TestInfo): string {
  const testHash = createHash('sha256')
    .update(testInfo.testId)
    .digest('hex')
    .slice(0, 16)
  return `e2e-${testHash}-${testInfo.repeatEachIndex}-${testInfo.workerIndex}-${testInfo.retry}`
}

export const test = base.extend<ScenarioFixtures>({
  scenario: async ({ request }, provide, testInfo) => {
    const id = createScenarioId(testInfo)
    const scenario: E2EScenario = {
      id,
      api: new ScenarioApi(request, id),
      authenticate: (page, role) => authenticateAs(page, role, id),
    }
    await provide(scenario)
  },
})

export { expect }
