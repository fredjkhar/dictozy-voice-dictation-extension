from dataclasses import dataclass
import os

from dotenv import load_dotenv


load_dotenv()

DEFAULT_MAX_TRANSCRIBE_CONTENT_LENGTH_BYTES = 11 * 1024 * 1024
PRODUCTION_EXTENSION_ORIGIN = "chrome-extension://folpeencabfejhjokmldikaelonphmma"


def parse_bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default

    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False

    raise ValueError(
        f"{name} must be one of: 1, true, yes, on, 0, false, no, off."
    )


def parse_int_env(name: str, default: int, *, min_value: int = 0) -> int:
    value = os.getenv(name)
    if value is None or value.strip() == "":
        return default

    try:
        parsed = int(value)
    except ValueError:
        return default

    if parsed < min_value:
        return default

    return parsed


@dataclass(frozen=True)
class Settings:
    app_env: str = os.getenv("APP_ENV", "local")
    xai_api_key: str = os.getenv("XAI_API_KEY", "")
    xai_api_base_url: str = os.getenv("XAI_API_BASE_URL", "https://api.x.ai")
    backend_cors_origins: str = os.getenv("BACKEND_CORS_ORIGINS", "http://localhost:3000")
    transcription_enabled: bool = parse_bool_env("TRANSCRIPTION_ENABLED", True)
    transcribe_max_concurrent_requests: int = parse_int_env("TRANSCRIBE_MAX_CONCURRENT_REQUESTS", 2)
    transcribe_rate_limit_requests: int = parse_int_env("TRANSCRIBE_RATE_LIMIT_REQUESTS", 30)
    transcribe_rate_limit_window_seconds: int = parse_int_env("TRANSCRIBE_RATE_LIMIT_WINDOW_SECONDS", 60, min_value=1)
    max_transcribe_content_length_bytes: int = parse_int_env(
        "MAX_TRANSCRIBE_CONTENT_LENGTH_BYTES",
        DEFAULT_MAX_TRANSCRIBE_CONTENT_LENGTH_BYTES,
    )

    def __post_init__(self) -> None:
        if self.app_env.strip().lower() != "production":
            return

        if self.cors_origins != [PRODUCTION_EXTENSION_ORIGIN]:
            raise ValueError(
                "Production BACKEND_CORS_ORIGINS must contain only the published Dictozy extension origin."
            )

    @property
    def cors_origins(self) -> list[str]:
        return [origin.strip() for origin in self.backend_cors_origins.split(",") if origin.strip()]


settings = Settings()
