import os
from pathlib import Path
import subprocess
import sys

import pytest

from app.core.config import PRODUCTION_EXTENSION_ORIGIN, Settings, parse_bool_env


@pytest.mark.parametrize("value", [None, "", "   "])
def test_parse_bool_env_uses_default_for_missing_or_blank_values(monkeypatch, value) -> None:
    if value is None:
        monkeypatch.delenv("TEST_BOOLEAN", raising=False)
    else:
        monkeypatch.setenv("TEST_BOOLEAN", value)

    assert parse_bool_env("TEST_BOOLEAN", True) is True
    assert parse_bool_env("TEST_BOOLEAN", False) is False


@pytest.mark.parametrize("value", ["1", "true", "TRUE", " yes ", "on"])
def test_parse_bool_env_accepts_true_values(monkeypatch, value: str) -> None:
    monkeypatch.setenv("TEST_BOOLEAN", value)

    assert parse_bool_env("TEST_BOOLEAN", False) is True


@pytest.mark.parametrize("value", ["0", "false", "FALSE", " no ", "off"])
def test_parse_bool_env_accepts_false_values(monkeypatch, value: str) -> None:
    monkeypatch.setenv("TEST_BOOLEAN", value)

    assert parse_bool_env("TEST_BOOLEAN", True) is False


def test_parse_bool_env_rejects_invalid_values(monkeypatch) -> None:
    monkeypatch.setenv("TEST_BOOLEAN", "definitely-not-a-boolean")

    with pytest.raises(ValueError, match=r"^TEST_BOOLEAN must be one of:"):
        parse_bool_env("TEST_BOOLEAN", True)


def test_production_settings_require_only_the_published_extension_origin() -> None:
    settings = Settings(
        app_env="production",
        backend_cors_origins=PRODUCTION_EXTENSION_ORIGIN,
    )

    assert settings.cors_origins == [PRODUCTION_EXTENSION_ORIGIN]


@pytest.mark.parametrize(
    "origins",
    [
        "",
        "*",
        "http://localhost:3000",
        f"{PRODUCTION_EXTENSION_ORIGIN},http://localhost:3000",
    ],
)
def test_production_settings_reject_unsafe_cors_origins(origins: str) -> None:
    with pytest.raises(ValueError, match="Production BACKEND_CORS_ORIGINS"):
        Settings(app_env="production", backend_cors_origins=origins)


def test_local_settings_keep_explicit_development_cors_origin() -> None:
    settings = Settings(app_env="local", backend_cors_origins="http://localhost:3000")

    assert settings.cors_origins == ["http://localhost:3000"]


def test_invalid_transcription_enabled_prevents_backend_config_import() -> None:
    backend_dir = Path(__file__).resolve().parents[1]
    environment = {
        **os.environ,
        "PYTHONPATH": str(backend_dir),
        "TRANSCRIPTION_ENABLED": "definitely-not-a-boolean",
    }

    result = subprocess.run(
        [sys.executable, "-c", "import app.core.config"],
        cwd=backend_dir,
        env=environment,
        capture_output=True,
        check=False,
        text=True,
    )

    assert result.returncode != 0
    assert "TRANSCRIPTION_ENABLED must be one of:" in result.stderr
    assert "XAI_API_KEY" not in result.stderr
