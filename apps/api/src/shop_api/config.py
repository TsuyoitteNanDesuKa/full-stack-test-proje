from functools import lru_cache
from urllib.parse import urlsplit

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="SHOP_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "postgresql+psycopg://shop:shop-local-dev-only@127.0.0.1:5432/shop"
    oidc_issuer: str = "http://localhost:8080/realms/shop"
    oidc_audience: str = "shop-api"
    oidc_jwks_url: str | None = None
    keycloak_admin_client_id: str = "shop-api-admin"
    keycloak_admin_client_secret: str | None = None

    @field_validator("oidc_issuer")
    @classmethod
    def validate_oidc_issuer(cls, value: str) -> str:
        issuer = value.rstrip("/")
        parsed_issuer = urlsplit(issuer)
        local_http = parsed_issuer.scheme == "http" and parsed_issuer.hostname in {
            "localhost",
            "127.0.0.1",
        }
        if (
            parsed_issuer.scheme != "https"
            and not local_http
            or not parsed_issuer.hostname
            or parsed_issuer.username
            or parsed_issuer.password
            or parsed_issuer.query
            or parsed_issuer.fragment
        ):
            raise ValueError("SHOP_OIDC_ISSUER must use HTTPS except for local development.")
        return issuer

    @field_validator("oidc_audience")
    @classmethod
    def validate_oidc_audience(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("SHOP_OIDC_AUDIENCE must not be empty.")
        return value.strip()

    def jwks_endpoint(self) -> str:
        return self.oidc_jwks_url or f"{self.oidc_issuer}/protocol/openid-connect/certs"


@lru_cache
def get_settings() -> Settings:
    return Settings()
