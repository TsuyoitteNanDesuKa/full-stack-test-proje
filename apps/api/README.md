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

Apply the database migration and provision an existing customer:

```powershell
uv run alembic upgrade head
uv run shop-create-user
```

The provisioning command prompts for an email and password; it is a local operator utility, not a public registration API.

## Run the API

```powershell
uv run uvicorn shop_api.main:create_app --factory --reload
```

- OpenAPI UI: `http://127.0.0.1:8000/docs`
- Login: `POST /api/v1/auth/login`
- Protected home: `GET /api/v1/home`

The login response contains a short-lived bearer token. Send it as `Authorization: Bearer <token>` to the home endpoint.

## Tests and lint

```powershell
uv run pytest
uv run ruff check .
uv run ruff format --check .
```

Each test creates an isolated SQLite database. No local customer data or running database service is needed.
