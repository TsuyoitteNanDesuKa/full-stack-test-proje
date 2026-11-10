# Web client

The React/Vite client uses `oidc-client-ts` with Keycloak's public `shop-web` client and Authorization Code + PKCE. The app redirects to Keycloak for login and buyer registration; credentials are entered on Keycloak's hosted screen, not collected or sent to the shop API. The Keycloak login screen exposes registration when the imported realm's self-registration is enabled. Buyers can manage a persistent personal cart, place orders that reserve current stock and preserve product-price snapshots, and review order history. REQ-011 currently provides a local mock hosted-checkout sandbox only; it does not collect real payments or card details. Buyers can also submit a seller application for manual admin review; approved sellers keep their buyer role and can manage only their own catalog listings.

Configure the public browser settings in `.env` (copy `.env.example`):

- `VITE_OIDC_AUTHORITY`: Keycloak realm issuer. Default: `http://localhost:8080/realms/shop`.
- `VITE_OIDC_CLIENT_ID`: public OIDC client. Default: `shop-web`.

The access token is kept in browser session storage by the OIDC client and sent only as a bearer token to FastAPI. The API independently validates it and enforces roles; hiding admin UI controls is not authorization.

## Test layers

- `npm test`: tests the HTTP client, hosted-login/registration redirects, callback/session handling, cart add/update/remove and unavailable-product states, checkout/idempotent retry/order history/payment initiation, seller application/review UI, seller-owned product controls, and storefront flows with controlled responses.
- `npm run test:coverage`: runs the full Vitest suite and measures `src/App.tsx`, `src/api.ts`, `src/auth.ts`, `src/ProductCreatePage.tsx`, and `src/*Panel.tsx` (including new matching panels). The aggregate thresholds are 93% statements, 88% branches, 95% functions, and 93% lines; each measured file must also reach 81%, 70%, 88%, and 83% respectively. The original `App.tsx`, `api.ts`, and `ProductCreatePage.tsx` group retains its 100% threshold for every metric. The report does not represent every frontend file: entrypoint, test/contract files, generated code, and CSS are outside this scope. Coverage describes executed code, not correctness or E2E coverage.
- `npm run test:smoke`: runs Vitest tests whose title contains `@smoke`; `npm test` and `npm run test:coverage` run the full frontend regression suite on every PR.
- `npm run test:e2e:smoke`: starts isolated SQLite API, Vite on port 5174, and a test-only JWKS endpoint with an ephemeral RSA key. Runs deterministic buyer checkout/payment, login accessibility, and Chromium axe WCAG 2.1 A/AA scans across populated buyer/admin views on every PR without Keycloak. Critical views also assert no horizontal page overflow at 320px width.
- `npm run test:e2e:keycloak`: runs the `@keycloak` browser suite against a real test realm. It runs nightly and by manual workflow dispatch in CI, not on PRs. Local runs require the Compose Keycloak service and `$env:E2E_KEYCLOAK_E2E = "1"` plus `$env:E2E_KEYCLOAK_ADMIN_PASSWORD`; seller approval also needs the API service-account secret/role configuration described in `apps/api/README.md`. CI uses a disposable imported realm and ephemeral test credentials. Test accounts are removed afterward.
- `npm run test:e2e`: runs all Playwright tests matching the current mode; Keycloak suites remain skipped unless explicitly enabled. Playwright suite names use `@smoke`/`@keycloak`; add the appropriate tag to new suites.
- **E2E architecture standard:** prepare scenario data through the real test API where possible; use Playwright fixtures for shared auth/infrastructure; keep thin POMs only for stable UI regions reused by multiple scenarios; organize specs around user journeys. Add a Composer/Journey orchestration layer only when the same multi-step flow is repeated in at least three tests. Keep the behavior under test in the browser, and avoid direct database seeding as the default.
- `npm run build`: TypeScript checks and production build.
- `npm run lint`: Oxlint checks.

Install Chromium once with `npx playwright install chromium`. E2E requires Python 3.13+, `uv`, backend dependencies synced with `uv sync`, and Keycloak listening at the configured issuer.
