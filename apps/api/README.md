# Shop API

FastAPI storefront API secured by Keycloak access tokens. The API does not collect or verify user passwords; the React client uses the public `shop-web` OIDC client, and the API verifies access-token signatures and claims against the configured Keycloak JWKS endpoint.

## Requirements

- Python 3.13+
- `uv`
- Docker Compose (local PostgreSQL and Keycloak services)

## Setup

From the repository root, start PostgreSQL and Keycloak. The PostgreSQL service binds to loopback only and uses a persistent Docker volume. Its default credentials are for local development only; override `POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` for other environments.

```powershell
$env:KEYCLOAK_ADMIN_PASSWORD = Read-Host "Local Keycloak administrator password"
docker compose up -d postgres keycloak
docker compose ps
```

The `shop` realm, `shop-web` public OIDC client, buyer/seller/admin roles, and API audience mapper are imported from `infra/keycloak/realm-export.json`. The public realm issuer is `http://localhost:8080/realms/shop`.

The `liva` login theme is mounted from `infra/keycloak/themes/liva` and uses generic duplicate-account errors to avoid revealing whether an email is registered. Realm import only initializes a new realm; it does not overwrite configuration in an existing persistent Keycloak volume. For an existing realm, select `liva` as the Login theme under Admin Console → Realm settings → Themes. Removing the volume also deletes its realm data and users.

From this directory, configure the API and apply migrations to PostgreSQL:

```powershell
uv sync
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
uv run alembic upgrade head
```

The example settings point at the local PostgreSQL service and Keycloak realm (`SHOP_DATABASE_URL=postgresql+psycopg://shop:shop-local-dev-only@127.0.0.1:5432/shop`). If Compose credentials were overridden, update the URL accordingly. Existing `.env` files are not overwritten; if upgrading an existing checkout, change only its `SHOP_DATABASE_URL` entry rather than copying over the whole file. For non-local deployments, use HTTPS and configure `SHOP_OIDC_ISSUER`, `SHOP_OIDC_AUDIENCE`, `SHOP_DATABASE_URL`, and optionally `SHOP_OIDC_JWKS_URL`.

### Seller role provisioning

The `shop-api-admin` confidential service-account client is included for new realm imports, but the client secret and elevated role mappings are deliberately not embedded in the realm export. After any realm import, verify or create the client in the `shop` realm, enable Service accounts, and copy its generated client secret into `SHOP_KEYCLOAK_ADMIN_CLIENT_SECRET` in this directory's ignored `.env` file. Do not put the secret in the realm export, source control, or browser configuration.

For local development, assign the service account only the `realm-management` roles needed by the provisioner: `view-realm`, `view-users`, and `manage-users`. Add those same three roles to the `shop-api-admin` client's explicit scope mappings as well; assigning the service-account user's roles alone does not include them in its access token when `fullScopeAllowed` is disabled. These built-in roles are broad; do not copy this local setup unchanged to production. A deployed environment must use Keycloak fine-grained admin permissions or an equivalent narrowly scoped role-mapping service, then verify the exact permissions against the deployed Keycloak version.

The API persists an approval as `approval_pending` until it can assign and verify the `seller` realm role. After setting the secret, restart the API and run `uv run pytest tests/test_keycloak_admin.py tests/test_seller_applications.py`. For a persistent local realm, realm JSON import is not reapplied automatically; configure the client and service-account mappings explicitly in the Admin Console.

## Run the API

```powershell
uv run uvicorn shop_api.main:create_app --factory --reload
```

- OpenAPI UI: `http://127.0.0.1:8000/docs`
- Current identity: `GET /api/v1/auth/me` (Keycloak bearer token required)
- Protected home: `GET /api/v1/home`
- Product listing: `GET /api/v1/products?limit=20&offset=0` (authenticated)
- Buyer cart: `GET /api/v1/cart`, `POST /api/v1/cart/items`, `PUT /api/v1/cart/items/{item_id}`, and `DELETE /api/v1/cart/items/{item_id}`. Cart ownership comes from the validated Keycloak subject; item mutations check current product stock and return current catalog prices.
- Seller applications: buyer self-service routes under `/api/v1/seller-applications`; review routes require admin
- Product create/update/delete: admin can manage all products; an approved seller can manage only their own products

The former `POST /api/v1/auth/login` endpoint has been removed. The browser redirects to Keycloak for login/registration; it must never send a password to the shop API. The API validates RS256 signatures, `iss`, `aud`, `exp`, `iat`, `sub`, and recognized realm roles. A JWKS connection failure returns `503` rather than accepting an unverifiable token.

Buyer self-registration is enabled in the realm and new accounts receive only the default `buyer` role. Seller and admin assignment are not available through public registration. Seller approval preserves the buyer role and does not constitute formal KYC or sales/payment authorization. During local development only, an operator may assign `admin` from the Keycloak admin console.

### Admin role operations (REQ-008)

The first `admin` is bootstrapped manually by a trusted operator in the Keycloak Admin Console. Subsequent admin grants and revocations also happen only in that console; this application intentionally has no admin-role management API or UI. Do not grant the `admin` role through self-registration or a user-controlled request.

Before removing an admin role or disabling/deleting an admin account, verify in the console that another active admin remains. Keycloak does not enforce this last-admin invariant automatically; retain a separately secured break-glass operator account and treat the active-admin check as a required operational step. If a stricter technical guarantee becomes necessary, role changes must move behind a controlled Keycloak management service rather than an unrestricted console workflow.

The imported realm enables Keycloak admin-event recording without event details (`adminEventsEnabled=true`, `adminEventsDetailsEnabled=false`) so role changes can be audited without recording request payloads. For an existing persistent realm, configure the same options under Realm settings → Events → Admin events. Keep Keycloak's event database access and backups restricted; do not copy credentials or tokens into event notes.

## Tests and lint

The development API and Alembic migrations use PostgreSQL. API tests continue to use isolated SQLite databases and a test RSA/JWKS double for fast, deterministic unit and route coverage. They cover access-token signature and claim validation, role enforcement, JWKS unavailability, buyer cart ownership and stock behavior, deleted products, cart migration rollback, seller application/review and provisioning behavior, storefront/product behavior, and imported realm settings. PostgreSQL-specific locking/concurrency integration tests are a separate QA task and must run against the Compose database.

```powershell
uv run pytest
uv run pytest --cov=shop_api --cov-report=term-missing
uv run ruff check .
uv run ruff format --check .
```

The Keycloak registration browser test lives in `apps/web/e2e`; see the web README for enabling it.
