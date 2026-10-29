from functools import lru_cache

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="SHOP_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str = "sqlite:///./shop.db"
    secret_key: SecretStr = SecretStr("")
    access_token_expire_minutes: int = 30

    @field_validator("access_token_expire_minutes")
    @classmethod
    def validate_token_expiry(cls, value: int) -> int:
        if not 1 <= value <= 1440:
            raise ValueError("SHOP_ACCESS_TOKEN_EXPIRE_MINUTES must be between 1 and 1440.")
        return value

    def signing_key(self) -> str:
        key = self.secret_key.get_secret_value()
        if len(key) < 32 or key.startswith("replace-with-"):
            raise ValueError(
                "Set SHOP_SECRET_KEY to a unique random value of at least 32 characters."
            )
        return key


@lru_cache
def get_settings() -> Settings:
    return Settings()
