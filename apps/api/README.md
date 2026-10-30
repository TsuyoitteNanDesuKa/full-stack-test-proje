# Shop API

FastAPI storefront API secured by Keycloak access tokens. The API does not collect or verify user passwords; the React client uses the public `shop-web` OIDC client, and the API verifies access-token signatures and claims against the configured Keycloak JWKS endpoint.

## Requirements

- Python 3.13+
- `uv`
- Local Keycloak from the repository's Docker Compose configuration

## Setup

From the repository root, start Keycloak with a local-only bootstrap administrator password:

```powershell
$env:KEYCLOAK_ADMIN_PASSWORD = Read-Host "Local Keycloak administrator password"
docker compose up -d keycloak
```

The `shop` realm, `shop-web` public OIDC client, buyer/seller/admin roles, and API audience mapper are imported from `infra/keycloak/realm-export.json`. The public realm issuer is `http://localhost:8080/realms/shop`.

From this directory, configure the API and database:

```powershell
uv sync
Copy-Item .env.example .env
uv run alembic upgrade head
```

The example settings point at the local Keycloak realm and `shop-api` audience. For non-local deployments, use HTTPS and configure `SHOP_OIDC_ISSUER`, `SHOP_OIDC_AUDIENCE`, and optionally `SHOP_OIDC_JWKS_URL`.

## Run the API

```powershell
uv run uvicorn shop_api.main:create_app --factory --reload
```

- OpenAPI UI: `http://127.0.0.1:8000/docs`
- Current identity: `GET /api/v1/auth/me` (Keycloak bearer token required)
- Protected home: `GET /api/v1/home`
- Product listing: `GET /api/v1/products?limit=20&offset=0` (authenticated)
- Product create/update/delete: admin realm role required

The former `POST /api/v1/auth/login` endpoint has been removed. The browser redirects to Keycloak for login/registration; it must never send a password to the shop API. The API validates RS256 signatures, `iss`, `aud`, `exp`, `iat`, `sub`, and recognized realm roles. A JWKS connection failure returns `503` rather than accepting an unverifiable token.

Buyer self-registration is enabled in the realm and new accounts receive only the default `buyer` role. Seller and admin assignment are not available through public registration. During local development only, an operator may assign `admin` from the Keycloak admin console; seller application and business verification are a later requirement.

## Tests and lint

API tests use isolated SQLite databases and a test RSA/JWKS double. They cover access-token signature and claim validation, role enforcement, JWKS unavailability, storefront/product behavior, and the imported realm's self-registration/client settings.

```powershell
uv run pytest
uv run pytest --cov=shop_api --cov-report=term-missing
uv run ruff check .
uv run ruff format --check .
```

The Keycloak registration browser test lives in `apps/web/e2e`; see the web README for enabling it.
