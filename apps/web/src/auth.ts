import type { UserManager } from 'oidc-client-ts'

export interface AuthSession {
  accessToken: string
  email: string | null
}

const authority = import.meta.env.VITE_OIDC_AUTHORITY ?? 'http://localhost:8080/realms/shop'
const clientId = import.meta.env.VITE_OIDC_CLIENT_ID ?? 'shop-web'
const redirectUri = window.location.origin
// Match oidc-client-ts's default WebStorageStateStore key before loading its bundle.
const userStorageKey = `oidc.user:${authority}:${clientId}`

let userManagerPromise: Promise<UserManager> | null = null

function getUserManager(): Promise<UserManager> {
  if (!userManagerPromise) {
    userManagerPromise = import('oidc-client-ts').then(({ UserManager, WebStorageStateStore }) =>
      new UserManager({
        authority,
        client_id: clientId,
        redirect_uri: redirectUri,
        post_logout_redirect_uri: redirectUri,
        response_type: 'code',
        disablePKCE: false,
        scope: 'openid profile email',
        userStore: new WebStorageStateStore({ store: window.sessionStorage }),
        automaticSilentRenew: false,
      }),
    )
  }
  return userManagerPromise
}

const initialQuery = new URLSearchParams(window.location.search)
if (
  (initialQuery.has('code') && initialQuery.has('state')) ||
  (!initialQuery.has('error') && window.sessionStorage.getItem(userStorageKey))
) {
  void getUserManager()
}

let callbackPromise: Promise<void> | null = null

function completeOidcCallback(userManager: UserManager): Promise<void> {
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

  const hasCallback = query.has('code') && query.has('state')
  if (!hasCallback && !window.sessionStorage.getItem(userStorageKey)) {
    return null
  }

  const userManager = await getUserManager()
  if (hasCallback) {
    await completeOidcCallback(userManager)
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

export async function beginLogin(): Promise<void> {
  const userManager = await getUserManager()
  return userManager.signinRedirect()
}

export async function beginRegistration(): Promise<void> {
  const userManager = await getUserManager()
  return userManager.signinRedirect()
}

export async function endSession(): Promise<void> {
  const userManager = await getUserManager()
  return userManager.signoutRedirect()
}
