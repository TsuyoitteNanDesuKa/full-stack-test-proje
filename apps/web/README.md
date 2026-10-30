# Web client

The React/Vite client uses `oidc-client-ts` with Keycloak's public `shop-web` client and Authorization Code + PKCE. The app redirects to Keycloak for login and buyer registration; credentials are entered on Keycloak's hosted screen, not collected or sent to the shop API. The Keycloak login screen exposes registration when the imported realm's self-registration is enabled.

Configure the public browser settings in `.env` (copy `.env.example`):

- `VITE_OIDC_AUTHORITY`: Keycloak realm issuer. Default: `http://localhost:8080/realms/shop`.
- `VITE_OIDC_CLIENT_ID`: public OIDC client. Default: `shop-web`.

The access token is kept in browser session storage by the OIDC client and sent only as a bearer token to FastAPI. The API independently validates it and enforces roles; hiding admin UI controls is not authorization.

## Test layers

- `npm test`: tests the HTTP client, hosted-login/registration redirects, callback/session handling, and storefront flows with controlled responses.
- `npm run test:coverage`: statement, branch, function, and line coverage are enforced at 100% for `src/App.tsx`, `src/api.ts`, and `src/ProductCreatePage.tsx`.
- `npm run test:e2e`: starts the API with an isolated temporary SQLite database and Vite on port 5174. It does not seed local password users.
- Keycloak E2E is skipped by default. Start the repository's Keycloak Compose service, then set `$env:E2E_KEYCLOAK_E2E = "1"` and `$env:E2E_KEYCLOAK_ADMIN_PASSWORD` to the local Keycloak bootstrap password before running `npm run test:e2e`. Tests exercise buyer registration, invalid login and admin product CRUD through the real hosted login; temporary admin and buyer accounts are removed afterward.
- `npm run build`: TypeScript checks and production build.
- `npm run lint`: Oxlint checks.

Install Chromium once with `npx playwright install chromium`. E2E requires Python 3.13+, `uv`, backend dependencies synced with `uv sync`, and Keycloak listening at the configured issuer.
