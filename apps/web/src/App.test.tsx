import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('customer login', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  it('shows the storefront after logging in and fetching the home page', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ access_token: 'signed-token', token_type: 'bearer', expires_in: 1800 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            message: 'Alışverişe hoş geldiniz',
            featured_categories: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('E-posta adresi'), 'customer@example.com')
    await user.type(screen.getByLabelText('Parola'), 'correct-password')
    await user.click(screen.getByRole('button', { name: /giriş yap/i }))

    expect(
      await screen.findByRole('heading', { name: 'Alışverişe hoş geldiniz.' }),
    ).toBeInTheDocument()
    expect(screen.getByText('customer@example.com olarak giriş yaptın. Sana iyi gelecek şeyler burada başlıyor.')).toBeInTheDocument()
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/v1/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          email: 'customer@example.com',
          password: 'correct-password',
        }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/v1/home',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer signed-token' }),
      }),
    )

    await user.click(screen.getByRole('button', { name: /çıkış yap/i }))
    expect(screen.getByRole('heading', { name: 'Merhaba.' })).toBeInTheDocument()
  })

  it('shows an understandable message for incorrect credentials', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Geçersiz e-posta veya parola.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('E-posta adresi'), 'customer@example.com')
    await user.type(screen.getByLabelText('Parola'), 'incorrect-password')
    await user.click(screen.getByRole('button', { name: /giriş yap/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'E-posta adresi veya parola hatalı. Bilgilerini kontrol edip tekrar dene.',
    )
  })

  it.each([
    [422, 'E-posta adresi veya parola biçimi geçersiz.'],
    [503, 'Giriş sırasında bir sorun oluştu. Lütfen tekrar dene.'],
  ])('shows a useful message when the login API returns %i', async (status, message) => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Private server detail.' }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByRole('textbox', { name: 'E-posta adresi' }), 'customer@example.com')
    await user.type(screen.getByLabelText('Parola', { exact: true }), 'incorrect-password')
    await user.click(screen.getByRole('button', { name: /giriş yap/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.getByRole('alert')).not.toHaveTextContent('Private server detail.')
  })

  it('shows a connection message when the API cannot be reached', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'))

    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByRole('textbox', { name: 'E-posta adresi' }), 'customer@example.com')
    await user.type(screen.getByLabelText('Parola', { exact: true }), 'correct-password')
    await user.click(screen.getByRole('button', { name: /giriş yap/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Sunucuya bağlanılamadı.',
    )
  })

  it('blocks empty and malformed form input before sending a request', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: /giriş yap/i }))

    expect(fetch).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'E-posta adresi' })).toBeInvalid()

    await user.type(screen.getByRole('textbox', { name: 'E-posta adresi' }), 'not-an-email')
    await user.type(screen.getByLabelText('Parola', { exact: true }), 'password')
    await user.click(screen.getByRole('button', { name: /giriş yap/i }))

    expect(fetch).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'E-posta adresi' })).toBeInvalid()
  })

  it('keeps the submit button disabled while login and home requests are pending', async () => {
    let resolveLogin: (response: Response) => void = () => {
      throw new Error('Login request was not initialized.')
    }
    let resolveHome: (response: Response) => void = () => {
      throw new Error('Home request was not initialized.')
    }
    vi.mocked(fetch)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveLogin = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveHome = resolve
          }),
      )

    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByRole('textbox', { name: 'E-posta adresi' }), 'customer@example.com')
    await user.type(screen.getByLabelText('Parola', { exact: true }), 'correct-password')
    await user.click(screen.getByRole('button', { name: /giriş yap/i }))

    const submitButton = screen.getByRole('button', { name: /giriş yapılıyor/i })
    expect(submitButton).toBeDisabled()

    resolveLogin(jsonResponse({
      access_token: 'signed-token',
      token_type: 'bearer',
      expires_in: 1800,
    }))
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(submitButton).toBeDisabled()

    resolveHome(jsonResponse({ message: 'Welcome', featured_categories: [] }))
    expect(await screen.findByRole('heading', { name: 'Welcome.' })).toBeInTheDocument()
  })

  it('keeps the login form available if the protected home request fails', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: 'signed-token',
          token_type: 'bearer',
          expires_in: 1800,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ detail: 'Kimlik doğrulaması gerekli.' }, 401),
      )

    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByRole('textbox', { name: 'E-posta adresi' }), 'customer@example.com')
    await user.type(screen.getByLabelText('Parola', { exact: true }), 'correct-password')
    await user.click(screen.getByRole('button', { name: /giriş yap/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Giriş başarılı ancak ana sayfa açılamadı.',
    )
    expect(screen.getByRole('heading', { name: 'Merhaba.' })).toBeInTheDocument()
  })

  it('can reveal and hide the password without submitting the form', async () => {
    const user = userEvent.setup()
    render(<App />)

    const passwordInput = screen.getByLabelText('Parola', { exact: true })
    await user.type(passwordInput, 'private-password')
    await user.click(screen.getByRole('button', { name: 'Parolayı göster' }))

    expect(passwordInput).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Parolayı gizle' })).toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Parolayı gizle' }))
    expect(passwordInput).toHaveAttribute('type', 'password')
  })
})
