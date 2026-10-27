import asyncio
from dataclasses import replace
import threading

from fastapi.testclient import TestClient
import pytest

from app.core.security import normalize_content_type, safe_audio_filename
from app.main import app
from app.routes import transcribe
from app.services.audio_normalization import AudioNoSpeechError, AudioNormalizationError, AudioSignal, NormalizedAudio
from app.services.xai_service import XAIEmptyTranscriptError, XAIServiceError, XAITranscriptionResult


client = TestClient(app)


def normalized_audio_stub(audio_bytes: bytes) -> NormalizedAudio:
    return NormalizedAudio(
        audio_bytes=audio_bytes,
        filename="recording.wav",
        content_type="audio/wav",
        signal=AudioSignal(duration_seconds=1.0, rms_dbfs=-20.0, peak_dbfs=-10.0),
    )


@pytest.fixture(autouse=True)
def reset_launch_guardrails() -> None:
    transcribe.rate_limiter.reset()
    transcribe.concurrency_limiter.reset()
    transcribe.audio_budget.reset()


def test_health_check() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["x-request-id"]


def test_request_id_header_accepts_safe_caller_value() -> None:
    response = client.get("/health", headers={"X-Request-ID": "test-request-123"})

    assert response.status_code == 200
    assert response.headers["x-request-id"] == "test-request-123"


def test_transcribe_returns_provider_transcript(monkeypatch) -> None:
    def fake_normalize(audio_bytes: bytes) -> NormalizedAudio:
        assert audio_bytes == b"fake audio bytes"
        return NormalizedAudio(
            audio_bytes=b"normalized wav bytes",
            filename="recording.wav",
            content_type="audio/wav",
            signal=AudioSignal(duration_seconds=1.0, rms_dbfs=-20.0, peak_dbfs=-10.0),
        )

    async def fake_transcribe(
        audio_bytes: bytes,
        *,
        filename: str,
        content_type: str,
        language: str | None,
    ) -> XAITranscriptionResult:
        assert audio_bytes == b"normalized wav bytes"
        assert filename == "recording.wav"
        assert content_type == "audio/wav"
        assert language == "en"
        return XAITranscriptionResult(text="Mock transcript.")

    monkeypatch.setattr(transcribe, "normalize_audio_for_stt", fake_normalize)
    monkeypatch.setattr(transcribe, "transcribe_with_xai", fake_transcribe)

    response = client.post(
        "/api/transcribe",
        files={"file": ("recording.webm", b"fake audio bytes", "audio/webm;codecs=opus")},
    )

    assert response.status_code == 200
    assert response.json() == {"transcript": "Mock transcript."}
    assert response.headers["x-request-id"]


@pytest.mark.parametrize(
    ("submitted_language", "expected_language"),
    [
        ("en", "en"),
        (" FR ", "fr"),
    ],
)
def test_transcribe_accepts_explicit_language_formatting(
    monkeypatch,
    submitted_language: str,
    expected_language: str,
) -> None:
    received_language = None

    async def fake_transcribe(
        _audio_bytes: bytes,
        *,
        filename: str,
        content_type: str,
        language: str | None,
    ) -> XAITranscriptionResult:
        nonlocal received_language
        received_language = language
        return XAITranscriptionResult(text="Bonjour.")

    monkeypatch.setattr(transcribe, "normalize_audio_for_stt", normalized_audio_stub)
    monkeypatch.setattr(transcribe, "transcribe_with_xai", fake_transcribe)

    response = client.post(
        "/api/transcribe",
        data={"language": submitted_language},
        files={"file": ("recording.webm", b"fake audio bytes", "audio/webm")},
    )

    assert response.status_code == 200
    assert response.json() == {"transcript": "Bonjour."}
    assert received_language == expected_language


def test_transcribe_automatic_omits_provider_language(monkeypatch) -> None:
    received_language = "not-called"

    async def fake_transcribe(
        _audio_bytes: bytes,
        *,
        filename: str,
        content_type: str,
        language: str | None,
    ) -> XAITranscriptionResult:
        nonlocal received_language
        received_language = language
        return XAITranscriptionResult(text="Automatic transcript.")

    monkeypatch.setattr(transcribe, "normalize_audio_for_stt", normalized_audio_stub)
    monkeypatch.setattr(transcribe, "transcribe_with_xai", fake_transcribe)

    response = client.post(
        "/api/transcribe",
        data={"language": "auto"},
        files={"file": ("recording.webm", b"fake audio bytes", "audio/webm")},
    )

    assert response.status_code == 200
    assert received_language is None


def test_transcribe_rejects_unsupported_language_before_provider(monkeypatch) -> None:
    async def fake_transcribe(
        _audio_bytes: bytes,
        *,
        filename: str,
        content_type: str,
        language: str | None,
    ) -> XAITranscriptionResult:
        raise AssertionError("xAI should not be called for an unsupported language")

    monkeypatch.setattr(transcribe, "normalize_audio_for_stt", normalized_audio_stub)
    monkeypatch.setattr(transcribe, "transcribe_with_xai", fake_transcribe)

    response = client.post(
        "/api/transcribe",
        data={"language": "not-a-language"},
        files={"file": ("recording.webm", b"fake audio bytes", "audio/webm")},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Unsupported transcription language."}


def test_transcribe_disabled_returns_safe_503(monkeypatch) -> None:
    async def fake_transcribe(
        _audio_bytes: bytes,
        *,
        filename: str,
        content_type: str,
        language: str | None,
    ) -> XAITranscriptionResult:
        raise AssertionError("xAI should not be called when transcription is disabled")

    monkeypatch.setattr(transcribe, "settings", replace(transcribe.settings, transcription_enabled=False))
    monkeypatch.setattr(transcribe, "transcribe_with_xai", fake_transcribe)

    response = client.post(
        "/api/transcribe",
        files={"file": ("recording.webm", b"fake audio bytes", "audio/webm")},
    )

    assert response.status_code == 503
    assert response.json() == {"detail": "Speech-to-text service is temporarily unavailable."}


def test_transcribe_rate_limit_returns_safe_429(monkeypatch) -> None:
    async def fake_transcribe(
        _audio_bytes: bytes,
        *,
        filename: str,
        content_type: str,
        language: str | None,
    ) -> XAITranscriptionResult:
        return XAITranscriptionResult(text="Mock transcript.")

    monkeypatch.setattr(transcribe, "normalize_audio_for_stt", normalized_audio_stub)
    monkeypatch.setattr(
        transcribe,
        "settings",
        replace(
            transcribe.settings,
            transcribe_rate_limit_requests=1,
            transcribe_rate_limit_window_seconds=60,
        ),
    )
    monkeypatch.setattr(transcribe, "transcribe_with_xai", fake_transcribe)

    first_response = client.post(
        "/api/transcribe",
        files={"file": ("recording.webm", b"fake audio bytes", "audio/webm")},
    )
    second_response = client.post(
        "/api/transcribe",
        files={"file": ("recording.webm", b"fake audio bytes", "audio/webm")},
    )

    assert first_response.status_code == 200
    assert second_response.status_code == 429
    assert second_response.json() == {"detail": "Too many transcription requests. Please try again later."}


def test_transcribe_concurrency_limit_returns_safe_429(monkeypatch) -> None:
    first_request_started = threading.Event()
    release_first_request = threading.Event()
    first_result = {}

    async def fake_transcribe(
        _audio_bytes: bytes,
        *,
        filename: str,
        content_type: str,
        language: str | None,
    ) -> XAITranscriptionResult:
        first_request_started.set()
        await asyncio.to_thread(release_first_request.wait, 5)
        return XAITranscriptionResult(text="Mock transcript.")

    monkeypatch.setattr(transcribe, "normalize_audio_for_stt", normalized_audio_stub)
    monkeypatch.setattr(
        transcribe,
        "settings",
        replace(
            transcribe.settings,
            transcribe_max_concurrent_requests=1,
            transcribe_rate_limit_requests=0,
        ),
    )
    monkeypatch.setattr(transcribe, "transcribe_with_xai", fake_transcribe)

    def post_first_request() -> None:
        first_result["response"] = client.post(
            "/api/transcribe",
            files={"file": ("recording.webm", b"fake audio bytes", "audio/webm")},
        )

    first_thread = threading.Thread(target=post_first_request)
    first_thread.start()

    try:
        assert first_request_started.wait(timeout=2)

        second_response = client.post(
            "/api/transcribe",
            files={"file": ("recording.webm", b"fake audio bytes", "audio/webm")},
        )
    finally:
        release_first_request.set()
        first_thread.join(timeout=5)

    assert first_result["response"].status_code == 200
    assert second_response.status_code == 429
    assert second_response.json() == {"detail": "Too many transcription requests. Please try again later."}


def test_transcribe_rejects_wrong_file_type() -> None:
    response = client.post(
        "/api/transcribe",
        files={"file": ("note.txt", b"hello", "text/plain")},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Unsupported audio file type."}


def test_transcribe_rejects_empty_audio() -> None:
    response = client.post(
        "/api/transcribe",
        files={"file": ("empty.webm", b"", "audio/webm")},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Uploaded audio file is empty."}


def test_transcribe_rejects_oversized_content_length_before_upload_parsing() -> None:
    response = client.post(
        "/api/transcribe",
        headers={"content-length": str(12 * 1024 * 1024)},
        content=b"",
    )

    assert response.status_code == 413
    assert response.json() == {"detail": "Uploaded audio file is too large."}
    assert response.headers["x-request-id"]


def test_transcribe_returns_safe_audio_processing_error(monkeypatch) -> None:
    def fake_normalize(_audio_bytes: bytes) -> NormalizedAudio:
        raise AudioNormalizationError("ffmpeg stderr should not reach the client")

    async def fake_transcribe(
        _audio_bytes: bytes,
        *,
        filename: str,
        content_type: str,
        language: str | None,
    ) -> XAITranscriptionResult:
        raise AssertionError("xAI should not be called when audio normalization fails")

    monkeypatch.setattr(transcribe, "normalize_audio_for_stt", fake_normalize)
    monkeypatch.setattr(transcribe, "transcribe_with_xai", fake_transcribe)

    response = client.post(
        "/api/transcribe",
        files={"file": ("recording.webm", b"fake audio bytes", "audio/webm")},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "Could not process recorded audio."}
    assert "ffmpeg stderr" not in response.text


def test_transcribe_returns_safe_no_speech_error(monkeypatch) -> None:
    def fake_normalize(_audio_bytes: bytes) -> NormalizedAudio:
        raise AudioNoSpeechError("audio metrics should not reach the client")

    async def fake_transcribe(
        _audio_bytes: bytes,
        *,
        filename: str,
        content_type: str,
        language: str | None,
    ) -> XAITranscriptionResult:
        raise AssertionError("xAI should not be called when no speech is detected")

    monkeypatch.setattr(transcribe, "normalize_audio_for_stt", fake_normalize)
    monkeypatch.setattr(transcribe, "transcribe_with_xai", fake_transcribe)

    response = client.post(
        "/api/transcribe",
        files={"file": ("recording.webm", b"fake audio bytes", "audio/webm")},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "No speech was detected. Please check your microphone and try again."}
    assert "audio metrics" not in response.text


def test_transcribe_returns_safe_empty_transcript_error(monkeypatch) -> None:
    async def fake_transcribe(
        _audio_bytes: bytes,
        *,
        filename: str,
        content_type: str,
        language: str | None,
    ) -> XAITranscriptionResult:
        raise XAIEmptyTranscriptError("provider returned blank text")

    monkeypatch.setattr(transcribe, "normalize_audio_for_stt", normalized_audio_stub)
    monkeypatch.setattr(transcribe, "transcribe_with_xai", fake_transcribe)

    response = client.post(
        "/api/transcribe",
        files={"file": ("recording.webm", b"fake audio bytes", "audio/webm")},
    )

    assert response.status_code == 400
    assert response.json() == {"detail": "No speech was detected. Please try again."}
    assert "provider returned blank text" not in response.text


def test_transcribe_returns_safe_provider_error(monkeypatch) -> None:
    async def fake_transcribe(
        _audio_bytes: bytes,
        *,
        filename: str,
        content_type: str,
        language: str | None,
    ) -> XAITranscriptionResult:
        raise XAIServiceError("upstream details should not reach the client")

    monkeypatch.setattr(transcribe, "normalize_audio_for_stt", normalized_audio_stub)
    monkeypatch.setattr(transcribe, "transcribe_with_xai", fake_transcribe)

    response = client.post(
        "/api/transcribe",
        files={"file": ("recording.webm", b"fake audio bytes", "audio/webm")},
    )

    assert response.status_code == 502
    assert response.json() == {"detail": "Speech-to-text service failed."}
    assert "upstream details" not in response.text


def test_content_type_and_filename_helpers() -> None:
    assert normalize_content_type("audio/webm;codecs=opus") == "audio/webm"
    assert normalize_content_type(" AUDIO/WAV ") == "audio/wav"
    assert safe_audio_filename("../recording.webm") == "recording.webm"
    assert safe_audio_filename("unsafe.exe") == "recording.webm"


def test_forwarding_headers_do_not_change_direct_client_quota(monkeypatch) -> None:
    async def provider(*args, **kwargs):
        return XAITranscriptionResult(text="Safe result")
    monkeypatch.setattr(transcribe, "normalize_audio_for_stt", normalized_audio_stub)
    monkeypatch.setattr(transcribe, "transcribe_with_xai", provider)
    monkeypatch.setattr(transcribe, "settings", replace(transcribe.settings, transcribe_rate_limit_requests=1))
    responses = [client.post("/api/transcribe", headers={"X-Forwarded-For": ip, "X-Real-IP": ip},
                            files={"file": ("clip.webm", b"audio", "audio/webm")})
                 for ip in ["198.51.100.1", "198.51.100.2"]]
    assert [r.status_code for r in responses] == [200, 429]


def test_actual_body_limit_applies_without_honest_content_length() -> None:
    from app.core.config import settings
    chunk = b"x" * (1024 * 1024)
    for headers in [{}, {"Content-Length": "1"}]:
        response = client.post("/api/transcribe", headers=headers,
                               content=(chunk for _ in range(settings.max_transcribe_content_length_bytes // len(chunk) + 1)))
        assert response.status_code == 413
        assert response.headers["x-request-id"]


def test_unexpected_exception_returns_safe_response_and_log(monkeypatch, caplog) -> None:
    import logging
    from app.main import logger
    def fail(_audio):
        raise RuntimeError("private-audio-content-and-secret")
    monkeypatch.setattr(transcribe, "normalize_audio_for_stt", fail)
    logger.addHandler(caplog.handler)
    try:
        response = TestClient(app, raise_server_exceptions=False).post(
            "/api/transcribe", files={"file": ("private-name.webm", b"private audio", "audio/webm")})
    finally:
        logger.removeHandler(caplog.handler)
    assert response.status_code == 500
    assert response.json() == {"detail": "Transcription service failed. Please try again."}
    assert response.headers["x-request-id"]
    assert "private" not in caplog.text
    assert '"latency_ms"' in caplog.text
    assert '"status":500' in caplog.text


def test_upload_spooling_is_temporary_and_closed_even_on_failure(monkeypatch) -> None:
    from starlette.datastructures import UploadFile
    observed = []
    close = UploadFile.close
    async def observe_close(file):
        observed.append((file.file, getattr(file.file, "_rolled", False)))
        await close(file)
    monkeypatch.setattr(UploadFile, "close", observe_close)
    response = client.post("/api/transcribe", files={"file": ("clip.txt", b"x" * (1024 * 1024 + 1), "text/plain")})
    assert response.status_code == 400
    assert observed and observed[0][1]
    assert all(file.closed for file, _ in observed)


def test_aggregate_budget_prevents_provider_calls_and_does_not_refund_failure(monkeypatch) -> None:
    calls = []
    async def provider(*args, **kwargs):
        calls.append(1)
        raise XAIServiceError("private upstream details")
    monkeypatch.setattr(transcribe, "normalize_audio_for_stt", normalized_audio_stub)
    monkeypatch.setattr(transcribe, "transcribe_with_xai", provider)
    monkeypatch.setattr(transcribe, "settings", replace(transcribe.settings, transcribe_audio_budget_seconds=1))
    replies = [client.post("/api/transcribe", files={"file": ("clip.webm", b"audio", "audio/webm")})
               for _ in range(2)]
    assert [r.status_code for r in replies] == [502, 429]
    assert len(calls) == 1


def test_budget_is_shared_across_different_clients(monkeypatch) -> None:
    calls = []
    async def provider(*args, **kwargs):
        calls.append(1)
        return XAITranscriptionResult(text="Safe result")
    monkeypatch.setattr(transcribe, "normalize_audio_for_stt", normalized_audio_stub)
    monkeypatch.setattr(transcribe, "transcribe_with_xai", provider)
    monkeypatch.setattr(transcribe, "settings", replace(transcribe.settings, transcribe_audio_budget_seconds=1))
    replies = [TestClient(app, client=(ip, 123)).post("/api/transcribe",
               files={"file": ("clip.webm", b"audio", "audio/webm")}) for ip in ["198.51.100.1", "198.51.100.2"]]
    assert [r.status_code for r in replies] == [200, 429]
    assert len(calls) == 1


@pytest.mark.parametrize(("peer", "forwarded", "expected"), [
    ("203.0.113.1", "198.51.100.1", "203.0.113.1"),
    ("10.0.0.1", "forged-value, 198.51.100.2", "198.51.100.2"),
    ("::ffff:192.0.2.1", "198.51.100.1", "192.0.2.1"),
])
def test_server_proxy_trust_boundary(peer, forwarded, expected) -> None:
    from starlette.requests import Request
    from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware
    seen = []
    async def capture(scope, receive, send):
        seen.append(transcribe.get_rate_limit_key(Request(scope)))
    scope = {"type": "http", "client": (peer, 123), "headers": [(b"x-forwarded-for", forwarded.encode())]}
    asyncio.run(ProxyHeadersMiddleware(capture, trusted_hosts="10.0.0.1")(scope, None, None))
    assert seen == [expected]


def test_request_log_includes_safe_identifier_and_latency_only(caplog) -> None:
    from app.main import logger
    import json
    logger.addHandler(caplog.handler)
    try:
        response = client.get("/health?private=user-text", headers={"X-Request-ID": "test-safe-id"})
        client.get("/private-transcript-path")
    finally:
        logger.removeHandler(caplog.handler)
    records = [json.loads(record.message) for record in caplog.records if record.name == "app.requests"]
    assert records[0]["request_id"] == response.headers["x-request-id"] == "test-safe-id"
    assert records[0]["latency_ms"] >= 0
    assert records[1]["path"] == "[unmatched]"
    assert "private" not in caplog.text
    assert set(records[0]) == {"event", "request_id", "method", "path", "status", "latency_ms"}
