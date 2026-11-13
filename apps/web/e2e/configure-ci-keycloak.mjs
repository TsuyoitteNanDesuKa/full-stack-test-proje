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
const requiredRoleNames = ['view-realm', 'view-users', 'manage-users']
const requiredRoles = await Promise.all(
  requiredRoleNames.map((name) =>
    requestJson(
      `${adminApi}/clients/${realmManagement.id}/roles/${name}`,
      { headers },
      200,
      `Read Keycloak ${name} role`,
    ),
  ),
)
await requestJson(
  `${adminApi}/users/${serviceAccount.id}/role-mappings/clients/${realmManagement.id}`,
  { method: 'POST', headers, body: JSON.stringify(requiredRoles) },
  204,
  'Grant temporary Keycloak seller-provisioning permission',
)
await requestJson(
  `${adminApi}/clients/${apiClient.id}/scope-mappings/clients/${realmManagement.id}`,
  { method: 'POST', headers, body: JSON.stringify(requiredRoles) },
  204,
  'Grant temporary Keycloak seller-provisioning client scopes',
)

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
const serviceToken = await requestJson(
  `${issuer.replace(/\/+$/, '')}/protocol/openid-connect/token`,
  {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: 'shop-api-admin',
      client_secret: secret.value,
    }),
  },
  200,
  'Keycloak seller-provisioner authentication',
)
if (typeof serviceToken?.access_token !== 'string' || !serviceToken.access_token) {
  throw new Error('The Keycloak seller provisioner returned no access token.')
}
const sellerRole = await requestJson(
  `${adminApi}/roles/seller`,
  { headers: { authorization: `Bearer ${serviceToken.access_token}` } },
  200,
  'Verify seller-provisioner access to the seller role',
)
if (typeof sellerRole?.id !== 'string' || sellerRole.name !== 'seller') {
  throw new Error('The Keycloak seller provisioner returned an invalid seller role.')
}

await appendFile(githubEnvironment, `SHOP_KEYCLOAK_ADMIN_CLIENT_SECRET=${secret.value}\n`)
