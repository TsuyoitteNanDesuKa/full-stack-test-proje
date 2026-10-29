# Web client

The React/Vite client uses the same-origin `/api` Vite proxy to call the FastAPI login, protected home, and product listing endpoints. The default local proxy target is `http://127.0.0.1:8000`; automated browser tests override it with an isolated API instance.

## Test layers

- `npm test`: `src/api.test.ts` unit-tests the HTTP client; `src/App.test.tsx` covers the login component and its integration with the API client using controlled responses.
- `npm run test:coverage`: the same suite with statement, branch, function, and line coverage enforced at 100% for `src/App.tsx` and `src/api.ts`.
- After login, the storefront loads the authenticated product catalog and displays name, category, description, TRY price, and stock in a responsive table, including loading, empty, retryable error, and populated states.
- The login response includes the signed-in user's admin role. Administrators can open a dedicated product-creation page; customers do not see its entry point. The create form submits to the admin-protected product API.
- `npm run test:e2e`: Playwright tests against a real Chromium browser and real FastAPI backend. It creates a unique temporary SQLite database and test customer, starts the API and Vite on ports 8001 and 5174, then removes the temporary database during shutdown. Existing local development ports and `apps/api/shop.db` are not used.
- GitHub Actions saves JUnit test results, HTML coverage reports, coverage summary JSON, and Playwright traces from failed runs as workflow artifacts. The workflow Summary shows pass counts and coverage scope for backend, frontend, and E2E stages together.
- `npm run build`: TypeScript checks and production build.
- `npm run lint`: Oxlint checks.

Install the browser once with `npx playwright install chromium` before running the E2E suite. E2E requires Python 3.13+, `uv`, and the backend dependencies synced with `uv sync`.
