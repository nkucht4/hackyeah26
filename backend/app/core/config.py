from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "HackYeah26 API"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    extension_id: str | None = None
    speech_window_seconds: float = Field(default=2.0, gt=0)
    speech_sample_rate: int = Field(default=16_000, gt=0)
    speech_model_path: Path | None = None

    @property
    def allowed_origins(self) -> list[str]:
        origins = [
            origin.strip()
            for origin in self.cors_origins.split(",")
            if origin.strip()
        ]
        if self.extension_id:
            extension_origin = f"chrome-extension://{self.extension_id.strip()}"
            if extension_origin not in origins:
                origins.append(extension_origin)
        return origins


@lru_cache
def get_settings() -> Settings:
    return Settings()