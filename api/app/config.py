from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://rtp:rtp@localhost:5433/rtp"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    seed_on_startup: bool = True

    @field_validator("database_url")
    @classmethod
    def normalise_database_url(cls, value: str) -> str:
        """Coerce a hosted provider's connection string into a SQLAlchemy 2 URL.

        Render, Heroku, Fly and friends all hand out `postgres://user:pass@host/db`.
        SQLAlchemy 2 removed the `postgres://` alias entirely, so that string raises
        NoSuchModuleError at engine creation — and because the failure happens on
        import, the service dies before it can log anything useful.

        We also have to name the driver: bare `postgresql://` resolves to psycopg2,
        which is not in requirements.txt. Only psycopg (v3) is.
        """
        if value.startswith("postgres://"):
            return "postgresql+psycopg://" + value[len("postgres://") :]
        if value.startswith("postgresql://"):
            return "postgresql+psycopg://" + value[len("postgresql://") :]
        return value

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def allow_all_origins(self) -> bool:
        return "*" in self.cors_origin_list


settings = Settings()
