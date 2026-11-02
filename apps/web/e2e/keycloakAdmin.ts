import type { APIRequestContext } from '@playwright/test'

interface KeycloakTokenResponse {
  access_token?: string
}

interface KeycloakRole {
  id: string
  name: string
}

interface KeycloakUser {
  id: string
}

interface KeycloakAdminEvent {
  operationType?: string
  resourcePath?: string
  resourceType?: string
  representation?: string | null
  error?: string | null
}

interface KeycloakAdminAccess {
  apiUrl: string
  headers: { authorization: string }
  deleteUserByEmail: (email: string) => Promise<void>
}

interface TestAdmin {
  email: string
  password: string
  cleanup: () => Promise<void>
  deleteUserByEmail: (email: string) => Promise<void>
  revokeAdminRole: () => Promise<void>
  hasAuditedAdminRoleRevocation: () => Promise<boolean>
}

function requireStatus(
  status: number,
  expectedStatus: number,
  operation: string,
): void {
  if (status !== expectedStatus) {
    throw new Error(
      `${operation} failed with status ${status}; expected ${expectedStatus}.`,
    )
  }
}

async function connectToKeycloakAdmin(
  request: APIRequestContext,
): Promise<KeycloakAdminAccess> {
  const issuer = new URL(
    process.env.E2E_KEYCLOAK_ISSUER ?? 'http://localhost:8080/realms/shop',
  )
  const realm = issuer.pathname.split('/').filter(Boolean).at(-1)
  const adminPassword = process.env.E2E_KEYCLOAK_ADMIN_PASSWORD
  if (!realm || !adminPassword) {
    throw new Error(
      'Set E2E_KEYCLOAK_ADMIN_PASSWORD to the local Keycloak bootstrap password to run Keycloak E2E tests.',
    )
  }

  const adminUsername =
    process.env.E2E_KEYCLOAK_ADMIN_USERNAME ??
    process.env.KEYCLOAK_ADMIN_USERNAME ??
    'admin'
  const tokenResponse = await request.post(
    new URL('/realms/master/protocol/openid-connect/token', issuer.origin).toString(),
    {
      form: {
        grant_type: 'password',
        client_id: 'admin-cli',
        username: adminUsername,
        password: adminPassword,
      },
    },
  )
  requireStatus(tokenResponse.status(), 200, 'Keycloak admin authentication')
  const token = (await tokenResponse.json()) as KeycloakTokenResponse
  if (!token.access_token) {
    throw new Error('Keycloak admin authentication returned no access token.')
  }

  const apiUrl = new URL(
    `/admin/realms/${realm}`,
    issuer.origin,
  ).toString()
  const headers = { authorization: `Bearer ${token.access_token}` }

  async function deleteUserByEmail(email: string): Promise<void> {
    const usersResponse = await request.get(`${apiUrl}/users`, {
      headers,
      params: { email, exact: 'true' },
    })
    requireStatus(usersResponse.status(), 200, 'Finding a temporary Keycloak user')
    const users = (await usersResponse.json()) as KeycloakUser[]
    if (users.length === 0) {
      return
    }
    if (users.length !== 1) {
      throw new Error(
        `Expected one temporary Keycloak user for cleanup; found ${users.length}.`,
      )
    }

    const cleanupResponse = await request.delete(
      `${apiUrl}/users/${users[0].id}`,
      { headers },
    )
    requireStatus(cleanupResponse.status(), 204, 'Removing a temporary Keycloak user')
  }

  async function revokeRealmRoleByEmail(email: string, roleName: string): Promise<void> {
    const usersResponse = await request.get(`${apiUrl}/users`, {
      headers,
      params: { email, exact: 'true' },
    })
    requireStatus(usersResponse.status(), 200, 'Finding a Keycloak user for role removal')
    const users = (await usersResponse.json()) as KeycloakUser[]
    if (users.length !== 1) {
      throw new Error(
        `Expected one Keycloak user for role removal; found ${users.length}.`,
      )
    }

    const roleResponse = await request.get(`${apiUrl}/roles/${roleName}`, { headers })
    requireStatus(roleResponse.status(), 200, `Reading the ${roleName} realm role`)
    const role = (await roleResponse.json()) as KeycloakRole
    const removalResponse = await request.delete(
      `${apiUrl}/users/${users[0].id}/role-mappings/realm`,
      { headers, data: [role] },
    )
    requireStatus(removalResponse.status(), 204, `Removing the ${roleName} realm role`)
  }

  async function hasAuditedRoleRevocation(
    email: string,
  ): Promise<boolean> {
    const usersResponse = await request.get(`${apiUrl}/users`, {
      headers,
      params: { email, exact: 'true' },
    })
    requireStatus(usersResponse.status(), 200, 'Finding a Keycloak user for audit verification')
    const users = (await usersResponse.json()) as KeycloakUser[]
    if (users.length !== 1) {
      throw new Error(
        `Expected one Keycloak user for audit verification; found ${users.length}.`,
      )
    }

    const eventsResponse = await request.get(`${apiUrl}/admin-events`, {
      headers,
      params: { max: '100' },
    })
    requireStatus(eventsResponse.status(), 200, 'Reading Keycloak admin events')
    const events = (await eventsResponse.json()) as KeycloakAdminEvent[]
    return events.some(
      (event) =>
        event.operationType === 'DELETE' &&
        event.resourceType === 'REALM_ROLE_MAPPING' &&
        event.resourcePath === `users/${users[0].id}/role-mappings/realm` &&
        !event.error &&
        !event.representation,
    )
  }

  return {
    apiUrl,
    headers,
    deleteUserByEmail,
    revokeRealmRoleByEmail,
    hasAuditedRoleRevocation,
  }
}

export async function createKeycloakAdminClient(
  request: APIRequestContext,
): Promise<Pick<KeycloakAdminAccess, 'deleteUserByEmail'>> {
  return connectToKeycloakAdmin(request)
}

export async function createKeycloakTestAdmin(
  request: APIRequestContext,
): Promise<TestAdmin> {
  const adminAccess = await connectToKeycloakAdmin(request)
  const roleResponse = await request.get(`${adminAccess.apiUrl}/roles/admin`, {
    headers: adminAccess.headers,
  })
  requireStatus(roleResponse.status(), 200, 'Reading the admin realm role')
  const adminRole = (await roleResponse.json()) as KeycloakRole
  const uniqueId = `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`
  const email = `admin-${uniqueId}@example.com`
  const password = `LivaE2E-${uniqueId}!Aa`
  const createResponse = await request.post(`${adminAccess.apiUrl}/users`, {
    headers: adminAccess.headers,
    data: {
      username: email,
      email,
      firstName: 'Test',
      lastName: 'Admin',
      enabled: true,
      emailVerified: true,
      requiredActions: [],
      credentials: [{ type: 'password', value: password, temporary: false }],
    },
  })
  requireStatus(createResponse.status(), 201, 'Creating the temporary admin user')
  const location = createResponse.headers().location
  const userId = location?.split('/').filter(Boolean).at(-1)
  if (!userId) {
    await adminAccess.deleteUserByEmail(email)
    throw new Error('Keycloak created the temporary admin without returning its user ID.')
  }

  try {
    const roleMappingResponse = await request.post(
      `${adminAccess.apiUrl}/users/${userId}/role-mappings/realm`,
      { headers: adminAccess.headers, data: [adminRole] },
    )
    requireStatus(roleMappingResponse.status(), 204, 'Assigning the admin realm role')
  } catch (error) {
    await adminAccess.deleteUserByEmail(email)
    throw error
  }

  return {
    email,
    password,
    cleanup: () => adminAccess.deleteUserByEmail(email),
    deleteUserByEmail: adminAccess.deleteUserByEmail,
    revokeAdminRole: () => adminAccess.revokeRealmRoleByEmail(email, 'admin'),
    hasAuditedAdminRoleRevocation: () => adminAccess.hasAuditedRoleRevocation(email),
  }
}
