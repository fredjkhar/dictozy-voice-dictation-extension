"""Browser-origin integration without provider traffic; the existing route and guards stay shared."""
from dataclasses import replace

from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient
import pytest

from app import main
from app.core.config import PRODUCTION_EXTENSION_ORIGIN, PRODUCTION_WEBSITE_ORIGIN
from app.routes import transcribe
from app.services.xai_service import XAITranscriptionResult
from tests.test_transcribe import normalized_audio_stub


@pytest.fixture
def website_client(monkeypatch):
    settings = replace(
        main.settings,
        app_env="production",
        backend_cors_origins=f"{PRODUCTION_EXTENSION_ORIGIN},{PRODUCTION_WEBSITE_ORIGIN}",
    )
    monkeypatch.setattr(main, "settings", settings)
    monkeypatch.setattr(transcribe, "settings", settings)
    cors = next(item for item in main.app.user_middleware if item.cls is CORSMiddleware)
    monkeypatch.setitem(cors.kwargs, "allow_origins", settings.cors_origins)
    monkeypatch.setattr(main.app, "middleware_stack", None)
    transcribe.rate_limiter.reset()
    transcribe.concurrency_limiter.reset()
    transcribe.audio_budget.reset()
    with TestClient(main.app) as client:
        yield client


@pytest.mark.parametrize("origin", [PRODUCTION_EXTENSION_ORIGIN, PRODUCTION_WEBSITE_ORIGIN])
def test_production_clients_allow_actual_website_preflight(website_client, origin):
    response = website_client.options("/api/transcribe", headers={
        "Origin": origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,x-request-id",
    })
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin
    assert "access-control-allow-credentials" not in response.headers


@pytest.mark.parametrize(("origin", "method", "headers"), [
    ("https://unapproved.example", "POST", "content-type"),
    ("null", "POST", "content-type"),
    (PRODUCTION_WEBSITE_ORIGIN, "PUT", "content-type"),
    (PRODUCTION_WEBSITE_ORIGIN, "POST", "authorization"),
])
def test_preflight_rejects_unapproved_origin_method_or_header(website_client, origin, method, headers):
    response = website_client.options("/api/transcribe", headers={
        "Origin": origin,
        "Access-Control-Request-Method": method,
        "Access-Control-Request-Headers": headers,
    })
    assert response.status_code == 400


def test_extension_only_rollout_does_not_allow_website_preflight(monkeypatch, website_client):
    cors = next(item for item in main.app.user_middleware if item.cls is CORSMiddleware)
    monkeypatch.setitem(cors.kwargs, "allow_origins", [PRODUCTION_EXTENSION_ORIGIN])
    monkeypatch.setattr(main.app, "middleware_stack", None)
    response = website_client.options("/api/transcribe", headers={
        "Origin": PRODUCTION_WEBSITE_ORIGIN,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,x-request-id",
    })
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


@pytest.mark.parametrize("guard", ["transcribe_rate_limit_requests", "transcribe_audio_budget_seconds"])
def test_website_and_extension_share_existing_allowances(website_client, monkeypatch, guard):
    calls = []

    async def provider(*_args, **_kwargs):
        calls.append(True)
        return XAITranscriptionResult(text="Sample draft.")

    monkeypatch.setattr(transcribe, "settings", replace(transcribe.settings, **{guard: 1}))
    monkeypatch.setattr(transcribe, "normalize_audio_for_stt", normalized_audio_stub)
    monkeypatch.setattr(transcribe, "transcribe_with_xai", provider)
    responses = [website_client.post(
        "/api/transcribe",
        headers={"Origin": origin, "X-Request-ID": "website-client-guard-check"},
        files={"file": ("recording.webm", b"fake audio bytes", "audio/webm")},
    ) for origin in [PRODUCTION_EXTENSION_ORIGIN, PRODUCTION_WEBSITE_ORIGIN]]
    assert [response.status_code for response in responses] == [200, 429]
    assert len(calls) == 1
    assert responses[0].json() == {"transcript": "Sample draft."}
    assert responses[1].headers["access-control-allow-origin"] == PRODUCTION_WEBSITE_ORIGIN
    assert responses[0].headers["access-control-expose-headers"] == "X-Request-ID"
