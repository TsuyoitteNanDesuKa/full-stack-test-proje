export interface TokenResponse {
  access_token: string
  token_type: 'bearer'
  expires_in: number
}

export interface HomeResponse {
  message: string
  featured_categories: string[]
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
