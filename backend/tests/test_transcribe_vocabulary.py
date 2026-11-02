import json

from fastapi.testclient import TestClient
import pytest

from app.main import app, logger
from app.routes import transcribe
from app.services.audio_normalization import AudioSignal, NormalizedAudio
from app.services.xai_service import XAITranscriptionResult


@pytest.fixture
def captured_calls(monkeypatch):
    transcribe.rate_limiter.reset()
    transcribe.concurrency_limiter.reset()
    transcribe.audio_budget.reset()
    calls = {"normalized": 0, "provider": []}

    def normalize(audio):
        calls["normalized"] += 1
        return NormalizedAudio(audio, "recording.wav", "audio/wav", AudioSignal(1.0, -20.0, -10.0))

    async def provider(audio, **kwargs):
        calls["provider"].append(kwargs)
        return XAITranscriptionResult("Safe result")

    monkeypatch.setattr(transcribe, "normalize_audio_for_stt", normalize)
    monkeypatch.setattr(transcribe, "transcribe_with_xai", provider)
    return calls


def post_form(fields):
    return TestClient(app).post("/api/transcribe", files=[
        ("file", ("clip.webm", b"audio", "audio/webm")), *fields,
    ])


@pytest.mark.parametrize("flag", [None, "false"])
def test_without_consent_even_malformed_vocabulary_is_ignored(flag, captured_calls) -> None:
    fields = [
        ("vocabulary", (None, "PRIVATE_VOCABULARY_SENTINEL invalid JSON")),
        ("vocabulary", ("terms.json", b"private duplicate non-text value", "application/json")),
    ]
    if flag is not None:
        fields.append(("vocabulary_enabled", (None, flag)))
    response = post_form(fields)
    assert response.status_code == 200
    assert "keyterms" not in captured_calls["provider"][0]
    assert captured_calls["provider"][0]["language"] == "en"


@pytest.mark.parametrize("language, expected", [("en", "en"), ("fr", "fr"), ("auto", None)])
def test_enabled_vocabulary_is_normalized_without_changing_language(language, expected, captured_calls, caplog) -> None:
    marker = "PRIVATE_VOCABULARY_SENTINEL"
    logger.addHandler(caplog.handler)
    try:
        response = post_form([
            ("language", (None, language)),
            ("vocabulary_enabled", (None, "true")),
            ("vocabulary", (None, json.dumps(["  Cafe\u0301  ", "CAFÉ", marker]))),
        ])
    finally:
        logger.removeHandler(caplog.handler)
    assert response.status_code == 200
    assert captured_calls["provider"][0]["keyterms"] == ["Café", marker]
    assert captured_calls["provider"][0]["language"] == expected
    assert marker not in response.text + caplog.text


def test_empty_enabled_vocabulary_retains_old_provider_call_shape(captured_calls) -> None:
    response = post_form([("vocabulary_enabled", (None, "true")), ("vocabulary", (None, "[]"))])
    assert response.status_code == 200
    assert "keyterms" not in captured_calls["provider"][0]


@pytest.mark.parametrize("fields", [
    [("vocabulary_enabled", (None, "TRUE"))],
    [("vocabulary_enabled", (None, "1"))],
    [("vocabulary_enabled", (None, " true "))],
    [("vocabulary_enabled", (None, ""))],
    [("vocabulary_enabled", (None, "true")), ("vocabulary_enabled", (None, "false"))],
    [("vocabulary_enabled", ("consent.txt", b"true", "text/plain"))],
    [("vocabulary_enabled", (None, "true"))],
    [("vocabulary_enabled", (None, "true")), ("vocabulary", (None, "PRIVATE_VOCABULARY_SENTINEL"))],
    [("vocabulary_enabled", (None, "true")), ("vocabulary", (None, '{"PRIVATE_VOCABULARY_SENTINEL": "value"}'))],
    [("vocabulary_enabled", (None, "true")), ("vocabulary", (None, '["PRIVATE_VOCABULARY_SENTINEL", null]'))],
    [("vocabulary_enabled", (None, "true")), ("vocabulary", (None, '["one"]')), ("vocabulary", (None, '["two"]'))],
    [("vocabulary_enabled", (None, "true")), ("vocabulary", ("terms.json", b'["term"]', "application/json"))],
])
def test_invalid_vocabulary_returns_value_free_400_before_audio_or_provider(fields, captured_calls, caplog) -> None:
    logger.addHandler(caplog.handler)
    try:
        response = post_form(fields)
    finally:
        logger.removeHandler(caplog.handler)
    assert response.status_code == 400
    assert response.json() == {"detail": "Invalid personal vocabulary."}
    assert response.headers["x-request-id"]
    assert captured_calls == {"normalized": 0, "provider": []}
    assert "PRIVATE_VOCABULARY_SENTINEL" not in caplog.text
