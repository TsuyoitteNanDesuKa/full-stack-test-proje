import { beforeEach, describe, expect, it, vi } from 'vitest'

const oidcMocks = vi.hoisted(() => ({
  settings: undefined as Record<string, unknown> | undefined,
  storageSettings: undefined as Record<string, unknown> | undefined,
  getUser: vi.fn(),
  signinRedirect: vi.fn(),
  signinRedirectCallback: vi.fn(),
  signoutRedirect: vi.fn(),
}))

vi.mock('oidc-client-ts', () => ({
  UserManager: class {
    constructor(settings: Record<string, unknown>) {
      oidcMocks.settings = settings
    }

    getUser = oidcMocks.getUser
    signinRedirect = oidcMocks.signinRedirect
    signinRedirectCallback = oidcMocks.signinRedirectCallback
    signoutRedirect = oidcMocks.signoutRedirect
  },
  WebStorageStateStore: class {
    constructor(settings: Record<string, unknown>) {
      oidcMocks.storageSettings = settings
    }
  },
}))

import {
  beginLogin,
  beginRegistration,
  endSession,
  getCurrentSession,
} from './auth'

describe('Keycloak OIDC client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState({}, '', '/')
    oidcMocks.getUser.mockResolvedValue({
      access_token: 'keycloak-access-token',
      expired: false,
      profile: { email: 'buyer@example.com' },
    })
    oidcMocks.signinRedirect.mockResolvedValue(undefined)
    oidcMocks.signinRedirectCallback.mockResolvedValue(undefined)
    oidcMocks.signoutRedirect.mockResolvedValue(undefined)
  })

  it('uses the public web client with authorization code and session-only storage', () => {
    expect(oidcMocks.settings).toMatchObject({
      authority: 'http://localhost:8080/realms/shop',
      client_id: 'shop-web',
      response_type: 'code',
      disablePKCE: false,
      scope: 'openid profile email',
      automaticSilentRenew: false,
    })
    expect(oidcMocks.storageSettings?.store).toBe(window.sessionStorage)
  })

  it('returns an active Keycloak access token and profile email', async () => {
    await expect(getCurrentSession()).resolves.toEqual({
      accessToken: 'keycloak-access-token',
      email: 'buyer@example.com',
    })
  })

  it.each([
    [null, 'missing user'],
    [{ access_token: 'expired-token', expired: true, profile: {} }, 'expired token'],
    [{ access_token: '', expired: false, profile: {} }, 'missing access token'],
  ])('does not restore a session with %s', async (user, _scenario) => {
    oidcMocks.getUser.mockResolvedValue(user)

    await expect(getCurrentSession()).resolves.toBeNull()
  })

  it('completes the OIDC callback and removes authorization parameters from the URL', async () => {
    window.history.replaceState({}, '', '/?code=one-time-code&state=state-value')

    await getCurrentSession()

    expect(oidcMocks.signinRedirectCallback).toHaveBeenCalledOnce()
    expect(window.location.search).toBe('')
    expect(oidcMocks.getUser).toHaveBeenCalledOnce()
  })

  it('clears a failed OIDC callback from the URL before surfacing the failure', async () => {
    window.history.replaceState({}, '', '/?code=bad-code&state=state-value')
    oidcMocks.signinRedirectCallback.mockRejectedValueOnce(new Error('invalid state'))

    await expect(getCurrentSession()).rejects.toThrow('invalid state')
    expect(window.location.search).toBe('')
  })

  it('clears an OIDC cancellation response and returns to the signed-out state', async () => {
    window.history.replaceState({}, '', '/?error=access_denied&state=state-value')

    await expect(getCurrentSession()).resolves.toBeNull()
    expect(window.location.search).toBe('')
    expect(oidcMocks.getUser).not.toHaveBeenCalled()
  })

  it('redirects login through the OIDC authorization flow', async () => {
    await beginLogin()

    expect(oidcMocks.signinRedirect).toHaveBeenCalledWith()
  })

  it('starts the hosted Keycloak screen where self-registration is available', async () => {
    await beginRegistration()

    expect(oidcMocks.signinRedirect).toHaveBeenCalledWith()
  })

  it('ends the identity provider session using OIDC logout', async () => {
    await endSession()

    expect(oidcMocks.signoutRedirect).toHaveBeenCalledWith()
  })
})
