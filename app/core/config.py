from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Приложение
    app_name: str = "Flowers Shop API"
    app_version: str = "0.1.0"
    debug: bool = False
    log_level: str = "INFO"

    # База данных
    database_url: str = "postgresql+asyncpg://flowers_user:password@localhost:5432/flowers"
    
    # Redis
    redis_url: str = "redis://localhost:6379/0"

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

