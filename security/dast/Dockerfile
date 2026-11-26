FROM node:24-slim AS web
WORKDIR /repo/apps/web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci
COPY apps/web/index.html apps/web/tsconfig*.json apps/web/vite.config.ts ./
COPY apps/web/src ./src
COPY apps/web/public ./public
COPY docs/openapi.json /repo/docs/openapi.json
RUN npm run build

FROM ghcr.io/astral-sh/uv:0.13.6 AS uv
FROM python:3.13-slim
COPY --from=uv /uv /usr/local/bin/uv
WORKDIR /app/api
COPY apps/api/pyproject.toml apps/api/uv.lock apps/api/alembic.ini ./
COPY apps/api/src ./src
COPY apps/api/migrations ./migrations
RUN uv sync --locked --no-dev
COPY --from=web /repo/apps/web/dist /app/web/dist
COPY security/dast/start.sh /app/start.sh
COPY security/dast/oidc.py /app/dast_oidc.py
RUN sed -i 's/\r$//' /app/start.sh
ENV SHOP_DATABASE_URL=sqlite:////tmp/dast.sqlite
ENV SHOP_OIDC_ISSUER=http://127.0.0.1:8082/realms/e2e
ENV SHOP_OIDC_JWKS_URL=http://dast-target:8082/realms/e2e/protocol/openid-connect/certs
ENV SHOP_OIDC_AUDIENCE=shop-api
CMD ["sh", "/app/start.sh"]
