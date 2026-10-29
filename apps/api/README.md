# Shop API

FastAPI backend for the first online-store requirement: an existing customer can log in and access the protected home endpoint.

## Requirements

- Python 3.13+
- `uv`

SQLite is the local default, so Docker is not required for this increment. Set `SHOP_DATABASE_URL` in `.env` to select another SQLAlchemy database URL.

## Setup

From this directory:

```powershell
uv sync
Copy-Item .env.example .env
```

Replace `SHOP_SECRET_KEY` in `.env` with a unique random value of at least 32 characters. Keep `.env` private; it is ignored by Git.

Apply the database migration, provision an existing customer, and grant administrator access to an operator account when it needs to add catalog products:

```powershell
uv run alembic upgrade head
uv run shop-create-user
uv run shop-set-admin admin@example.com
```

The user-provisioning command prompts for an email and password; both commands are local operator utilities, not public registration APIs. Product creation is restricted to administrators.

## Run the API

```powershell
uv run uvicorn shop_api.main:create_app --factory --reload
```

- OpenAPI UI: `http://127.0.0.1:8000/docs`
- Login: `POST /api/v1/auth/login`
- Protected home: `GET /api/v1/home`
- Product listing: `GET /api/v1/products?limit=20&offset=0` (authenticated)
- Product creation: `POST /api/v1/products` (administrator only)

The login response contains a short-lived bearer token. Send it as `Authorization: Bearer <token>` to the home endpoint.

## Tests and lint

The tests are isolated from the local development database:

- `tests/test_security.py` and `tests/test_config.py` exercise password, token, and settings rules.
- `tests/test_auth.py` and `tests/test_home.py` exercise the login and protected-home HTTP APIs against temporary SQLite databases.
- `tests/test_database.py` and `tests/test_main.py` cover database selection and application lifecycle.

```powershell
uv run pytest
uv run pytest --cov=shop_api --cov-report=term-missing
uv run ruff check .
uv run ruff format --check .
```

Branch coverage is enabled, with a 95% minimum across the measured `shop_api` package; local operator-only `create_user.py` and `set_admin.py` helpers are excluded. Each API test creates an isolated SQLite database. No local customer data or running database service is needed.

GitHub Actions runs the same tests and quality checks for pushes and pull requests. Its unified run summary reports backend test counts and statement/branch coverage; detailed HTML coverage and JUnit results are retained as workflow artifacts.
