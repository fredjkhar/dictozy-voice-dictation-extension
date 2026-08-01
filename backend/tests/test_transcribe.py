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
