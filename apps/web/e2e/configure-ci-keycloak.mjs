import { appendFile } from 'node:fs/promises'

const issuer = process.env.E2E_KEYCLOAK_ISSUER ?? 'http://localhost:8080/realms/shop'
const adminPassword = process.env.E2E_KEYCLOAK_ADMIN_PASSWORD
const githubEnvironment = process.env.GITHUB_ENV

if (!adminPassword || !githubEnvironment) {
  throw new Error('Keycloak CI setup requires its ephemeral admin password and GITHUB_ENV.')
}

const issuerUrl = new URL(issuer)
const realm = issuerUrl.pathname.split('/').filter(Boolean).at(-1)
if (!realm) {
  throw new Error('The Keycloak issuer URL does not include a realm.')
}

const adminApi = new URL(`/admin/realms/${realm}`, issuerUrl.origin).toString()

async function requestJson(url, options, expectedStatus, operation) {
  const response = await fetch(url, options)
  if (response.status !== expectedStatus) {
    throw new Error(`${operation} returned HTTP ${response.status}; expected ${expectedStatus}.`)
  }
  return response.status === 204 ? undefined : response.json()
}

const token = await requestJson(
  new URL('/realms/master/protocol/openid-connect/token', issuerUrl.origin),
  {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: process.env.E2E_KEYCLOAK_ADMIN_USERNAME ?? 'admin',
      password: adminPassword,
    }),
  },
  200,
  'Keycloak CI admin authentication',
)
if (typeof token?.access_token !== 'string') {
  throw new Error('Keycloak CI admin authentication returned no access token.')
}
const headers = {
  authorization: `Bearer ${token.access_token}`,
  'content-type': 'application/json',
}

async function findClient(clientId) {
  const clients = await requestJson(
    `${adminApi}/clients?clientId=${encodeURIComponent(clientId)}`,
    { headers },
    200,
    `Find Keycloak client ${clientId}`,
  )
  const client = clients.find((candidate) => candidate.clientId === clientId)
  if (!client?.id) {
    throw new Error(`Keycloak client ${clientId} is missing from the imported test realm.`)
  }
  return client
}

const apiClient = await findClient('shop-api-admin')
const realmManagement = await findClient('realm-management')
const serviceAccount = await requestJson(
  `${adminApi}/clients/${apiClient.id}/service-account-user`,
  { headers },
  200,
  'Read Keycloak API service account',
)
const manageUsersRole = await requestJson(
  `${adminApi}/clients/${realmManagement.id}/roles/manage-users`,
  { headers },
  200,
  'Read Keycloak manage-users role',
)
await requestJson(
  `${adminApi}/users/${serviceAccount.id}/role-mappings/clients/${realmManagement.id}`,
  { method: 'POST', headers, body: JSON.stringify([manageUsersRole]) },
  204,
  'Grant temporary Keycloak seller-provisioning permission',
)
const assignedRoles = await requestJson(
  `${adminApi}/users/${serviceAccount.id}/role-mappings/clients/${realmManagement.id}`,
  { headers },
  200,
  'Verify temporary Keycloak seller-provisioning permission',
)
if (!assignedRoles.some((role) => role.name === 'manage-users')) {
  throw new Error('The Keycloak service account lacks manage-users permission.')
}

const secret = await requestJson(
  `${adminApi}/clients/${apiClient.id}/client-secret`,
  { headers },
  200,
  'Read temporary Keycloak API client secret',
)
if (typeof secret?.value !== 'string' || secret.value.length === 0) {
  throw new Error('The imported Keycloak API client has no usable test secret.')
}

process.stdout.write(`::add-mask::${secret.value}\n`)
await appendFile(githubEnvironment, `SHOP_KEYCLOAK_ADMIN_CLIENT_SECRET=${secret.value}\n`)
