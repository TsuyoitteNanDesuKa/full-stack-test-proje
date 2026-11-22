import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import App from './App'
import { beginPasswordReset, getCurrentSession } from './auth'

vi.mock('./auth', () => ({
  beginLogin: vi.fn(),
  beginPasswordReset: vi.fn(),
  beginRegistration: vi.fn(),
  endSession: vi.fn(),
  getCurrentSession: vi.fn(),
}))

beforeEach(() => {
  vi.mocked(getCurrentSession).mockResolvedValue(null)
})

it('offers a password reset action on the sign-in screen', async () => {
  render(<App />)

  expect(await screen.findByRole('button', { name: 'Parolam\u0131 unuttum' })).toBeInTheDocument()
})

it('starts the password reset flow without collecting a password in the app', async () => {
  render(<App />)

  fireEvent.click(await screen.findByRole('button', { name: 'Parolam\u0131 unuttum' }))

  expect(beginPasswordReset).toHaveBeenCalledTimes(1)
  expect(screen.queryByLabelText(/parola/i)).not.toBeInTheDocument()
})
