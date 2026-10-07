from pydantic_settings import BaseSettings, SettingsConfigDict

from pydantic import model_validator


_DEFAULT_JWT = "super-secret-key-change-in-production"


class _SettingsValidatorMixin:
    @model_validator(mode="after")
    def _check_production_safety(self):
        if not self.debug:
            if self.jwt_secret_key == _DEFAULT_JWT:
                raise ValueError(
                    "JWT_SECRET_KEY не изменён от дефолтного значения. "
                    "Установи переменную окружения JWT_SECRET_KEY перед продом."
                )
            if self.cors_origins.strip() == "*":
                raise ValueError(
                    "CORS '*' запрещён в проде. Укажи конкретные origin'ы в CORS_ORIGINS."
                )
        return self


class Settings(_SettingsValidatorMixin, BaseSettings):
    # Приложение
    app_name: str = "Flowers Shop API"
    app_version: str = "0.1.0"
    debug: bool = False
    log_level: str = "INFO"

    # База данных
    database_url: str = "postgresql+asyncpg://flowers_user:password@localhost:5432/flowers"
    
    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # CORS: список origin'ов через запятую или "*" для разработки
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    # Безопасность (JWT)
    jwt_secret_key: str = "super-secret-key-change-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False, # Позволяет писать DATABASE_URL или database_url
        extra="ignore"
    )

# Глобальный экземпляр настроек
settings = Settings()

