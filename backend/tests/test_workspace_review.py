"""The local review entry point must never inherit provider access."""
import os
from pathlib import Path
import subprocess
import sys


def test_review_server_uses_real_validation_but_only_a_stubbed_provider():
    script = r'''
import asyncio
import socket
from scripts.workspace_review import build_review_app, deny_outbound_connections
app = build_review_app(4198)
deny_outbound_connections()
from app.core.config import settings
assert settings.app_env == "local"
assert settings.xai_api_key == ""
assert settings.xai_api_base_url == "http://127.0.0.1:9"
assert settings.cors_origins == ["http://127.0.0.1:4198"]
with socket.socket() as connection:
    try:
        connection.connect(("127.0.0.1", 9))
    except OSError as error:
        assert "Outbound connections are disabled" in str(error)
    else:
        raise AssertionError("Outbound connection was not blocked")
import httpx
from tests.test_audio_normalization import tone_wav
async def verify():
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://review") as client:
        response = await client.post("/api/transcribe", files={"file": ("sample.wav", tone_wav(0.5), "audio/wav")})
        assert response.status_code == 200, response.text
        assert response.json() == {"transcript": "Bring the blue notebook."}
        assert (await client.get("/review/status")).json() == {"mode": "mock-provider", "provider_calls": 1}
        invalid = await client.post("/api/transcribe", files={"file": ("sample.wav", b"not audio", "audio/wav")})
        assert invalid.status_code == 400
        assert (await client.get("/review/status")).json()["provider_calls"] == 1
asyncio.run(verify())
'''
    result = subprocess.run(
        [sys.executable, "-c", script],
        cwd=Path(__file__).resolve().parents[1],
        env={**os.environ, "XAI_API_KEY": "PRIVATE_INHERITED_KEY_MUST_NOT_BE_USED", "APP_ENV": "production"},
        text=True, capture_output=True, timeout=30, check=False,
    )
    assert result.returncode == 0, result.stderr
    assert "PRIVATE_INHERITED_KEY_MUST_NOT_BE_USED" not in result.stdout + result.stderr
