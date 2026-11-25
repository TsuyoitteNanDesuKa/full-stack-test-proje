#!/bin/sh
set -eu
uv run --no-sync alembic upgrade head
python -m http.server 5174 --bind 0.0.0.0 --directory /app/web/dist &
exec uv run --no-sync uvicorn shop_api.main:create_app --factory --host 0.0.0.0 --port 8000 --no-access-log
