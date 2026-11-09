import { createServer } from 'node:http'

const port = Number(process.env.E2E_OIDC_PORT ?? '8082')
const publicJwk = process.env.E2E_TEST_PUBLIC_JWK

if (!publicJwk) {
  throw new Error('The ephemeral Playwright OIDC public key is not configured.')
}

const server = createServer((request, response) => {
  if (request.url !== '/realms/e2e/protocol/openid-connect/certs') {
    response.writeHead(404).end()
    return
  }

  response.writeHead(200, {
    'cache-control': 'no-store',
    'content-type': 'application/json',
  })
  response.end(JSON.stringify({ keys: [JSON.parse(publicJwk)] }))
})

server.listen(port, '127.0.0.1')

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close())
}
