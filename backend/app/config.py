from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://artixio:artixio@localhost:5432/regintel"
    cors_origins: str = "http://localhost:5173"

    @property
    def sqlalchemy_url(self) -> str:
        # Managed hosts (Render, Heroku, Fly) hand out postgres:// or postgresql://,
        # both of which SQLAlchemy resolves to psycopg2. Only psycopg 3 is installed,
        # so pin the driver explicitly rather than fail at import time.
        url = self.database_url
        for prefix in ("postgresql://", "postgres://"):
            if url.startswith(prefix):
                return "postgresql+psycopg://" + url[len(prefix) :]
        return url

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
