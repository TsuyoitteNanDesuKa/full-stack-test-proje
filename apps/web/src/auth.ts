import { UserManager, WebStorageStateStore } from 'oidc-client-ts'

export interface AuthSession {
  accessToken: string
  email: string | null
}

const authority = import.meta.env.VITE_OIDC_AUTHORITY ?? 'http://localhost:8080/realms/shop'
const clientId = import.meta.env.VITE_OIDC_CLIENT_ID ?? 'shop-web'
const redirectUri = window.location.origin

const userManager = new UserManager({
  authority,
  client_id: clientId,
  redirect_uri: redirectUri,
  post_logout_redirect_uri: redirectUri,
  response_type: 'code',
  disablePKCE: false,
  scope: 'openid profile email',
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  automaticSilentRenew: false,
})

let callbackPromise: Promise<void> | null = null

function completeOidcCallback(): Promise<void> {
  if (callbackPromise) {
    return callbackPromise
  }

  const callback = userManager.signinRedirectCallback().then(() => undefined).finally(() => {
    window.history.replaceState({}, document.title, window.location.pathname)
    callbackPromise = null
  })
  callbackPromise = callback
  return callback
}

export async function getCurrentSession(): Promise<AuthSession | null> {
  const query = new URLSearchParams(window.location.search)
  if (query.has('error')) {
    window.history.replaceState({}, document.title, window.location.pathname)
    return null
  }

  if (query.has('code') && query.has('state')) {
    await completeOidcCallback()
  }

  const user = await userManager.getUser()
  if (!user || user.expired || !user.access_token) {
    return null
  }

  return {
    accessToken: user.access_token,
    email: typeof user.profile.email === 'string' ? user.profile.email : null,
  }
}

export function beginLogin(): Promise<void> {
  return userManager.signinRedirect()
}

export function beginRegistration(): Promise<void> {
  return userManager.signinRedirect()
}

export function endSession(): Promise<void> {
  return userManager.signoutRedirect()
}
