# Web client

The React/Vite client uses `oidc-client-ts` with Keycloak's public `shop-web` client and Authorization Code + PKCE. The app redirects to Keycloak for login and buyer registration; credentials are entered on Keycloak's hosted screen, not collected or sent to the shop API. The Keycloak login screen exposes registration when the imported realm's self-registration is enabled. Buyers can manage a persistent personal cart, place orders that reserve current stock and preserve product-price snapshots, and review order history; payment is not collected in this flow. Buyers can also submit a seller application for manual admin review; approved sellers keep their buyer role and can manage only their own catalog listings.

Configure the public browser settings in `.env` (copy `.env.example`):

- `VITE_OIDC_AUTHORITY`: Keycloak realm issuer. Default: `http://localhost:8080/realms/shop`.
- `VITE_OIDC_CLIENT_ID`: public OIDC client. Default: `shop-web`.

The access token is kept in browser session storage by the OIDC client and sent only as a bearer token to FastAPI. The API independently validates it and enforces roles; hiding admin UI controls is not authorization.

## Test layers

- `npm test`: tests the HTTP client, hosted-login/registration redirects, callback/session handling, cart add/update/remove and unavailable-product states, checkout/idempotent retry/order history, seller application/review UI, seller-owned product controls, and storefront flows with controlled responses.
- `npm run test:coverage`: statement, branch, function, and line coverage are enforced at 100% for `src/App.tsx`, `src/api.ts`, and `src/ProductCreatePage.tsx`.
- `npm run test:e2e`: starts the API with an isolated temporary SQLite database and Vite on port 5174. It does not seed local password users.
- Keycloak E2E is skipped by default. Start the repository's Keycloak Compose service, then set `$env:E2E_KEYCLOAK_E2E = "1"` and `$env:E2E_KEYCLOAK_ADMIN_PASSWORD` to the local Keycloak bootstrap password before running `npm run test:e2e`. The seller approval flow also requires the API service-account secret and role mappings described in `apps/api/README.md`. Tests exercise buyer registration, invalid login, admin product CRUD, seller application approval, admin-role revocation followed by a fresh login, and buyer cart persistence/privacy, checkout, order history, snapshots after product deletion, and deleted-product recovery; temporary accounts are removed afterward. E2E fixtures use the trusted Keycloak Admin API only to provision isolated test data; the product itself has no admin-role mutation API/UI.
- `npm run build`: TypeScript checks and production build.
- `npm run lint`: Oxlint checks.

Install Chromium once with `npx playwright install chromium`. E2E requires Python 3.13+, `uv`, backend dependencies synced with `uv sync`, and Keycloak listening at the configured issuer.
