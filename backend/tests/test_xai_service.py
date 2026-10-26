import asyncio
from dataclasses import replace
from email import policy
from email.parser import BytesParser

import httpx
import pytest

from app.services import xai_service


class FakeResponse:
    status_code = 200
    headers = {"content-type": "application/json"}

    @staticmethod
    def json() -> dict[str, object]:
        return {
            "duration": 1.25,
            "language": "English",
            "text": "Formatted transcript.",
        }


def install_fake_client(monkeypatch, captured_request: dict[str, object]) -> None:
    class FakeAsyncClient:
        def __init__(self, *, timeout: float) -> None:
            captured_request["timeout"] = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, _exc_type, _exc, _traceback) -> None:
            return None

        async def post(self, endpoint, *, headers, data, files):
            captured_request.update(
                {
                    "data": data,
                    "endpoint": endpoint,
                    "files": files,
                    "headers": headers,
                }
            )
            return FakeResponse()

    monkeypatch.setattr(xai_service.httpx, "AsyncClient", FakeAsyncClient)
    monkeypatch.setattr(
        xai_service,
        "settings",
        replace(xai_service.settings, xai_api_key="backend-only-test-key"),
    )


def transcribe_with_language(language: str | None, monkeypatch) -> dict[str, object]:
    captured_request: dict[str, object] = {}
    install_fake_client(monkeypatch, captured_request)

    result = asyncio.run(
        xai_service.transcribe_audio(
            b"normalized audio",
            filename="recording.wav",
            content_type="audio/wav",
            language=language,
        )
    )

    assert result.text == "Formatted transcript."
    assert captured_request["files"] == {
        "file": ("recording.wav", b"normalized audio", "audio/wav"),
    }
    return captured_request


def test_explicit_language_enables_provider_formatting(monkeypatch) -> None:
    captured_request = transcribe_with_language("fr", monkeypatch)

    assert captured_request["data"] == {
        "format": "true",
        "language": "fr",
    }


def test_automatic_language_omits_provider_formatting_fields(monkeypatch) -> None:
    captured_request = transcribe_with_language(None, monkeypatch)

    assert captured_request["data"] == {}


@pytest.mark.parametrize("text_value", [None, ""])
def test_unusable_provider_responses_do_not_log_payload_keys(monkeypatch, caplog, text_value) -> None:
    class UnusableResponse(FakeResponse):
        @staticmethod
        def json() -> dict[str, object]:
            return {
                "private-provider-marker": "must-not-be-logged",
                "text": text_value,
            }

    class FakeAsyncClient:
        def __init__(self, *, timeout: float) -> None:
            assert timeout == 30.0

        async def __aenter__(self):
            return self

        async def __aexit__(self, _exc_type, _exc, _traceback) -> None:
            return None

        async def post(self, _endpoint, *, headers, data, files):
            return UnusableResponse()

    monkeypatch.setattr(xai_service.httpx, "AsyncClient", FakeAsyncClient)
    monkeypatch.setattr(
        xai_service,
        "settings",
        replace(xai_service.settings, xai_api_key="backend-only-test-key"),
    )

    expected_error = xai_service.XAIServiceError if text_value is None else xai_service.XAIEmptyTranscriptError
    with caplog.at_level("WARNING"), pytest.raises(expected_error):
        asyncio.run(
            xai_service.transcribe_audio(
                b"normalized audio",
                filename="recording.wav",
                content_type="audio/wav",
                language="en",
            )
        )

    assert "private-provider-marker" not in caplog.text
    assert "must-not-be-logged" not in caplog.text
    assert "status=200" in caplog.text


@pytest.mark.parametrize("language", ["en", "fr", None])
@pytest.mark.parametrize("terms", [None, [], ["  Cafe\u0301 ", "CAFÉ", "Private term"]])
def test_provider_multipart_wire_preserves_language_and_emits_repeated_keyterms_before_audio(monkeypatch, language, terms) -> None:
    seen = []

    async def handle(request):
        body = await request.aread()
        message = BytesParser(policy=policy.default).parsebytes(
            b"Content-Type: " + request.headers["content-type"].encode() + b"\r\nMIME-Version: 1.0\r\n\r\n" + body,
        )
        parts = [(part.get_param("name", header="content-disposition"), part.get_payload(decode=True))
                 for part in message.iter_parts()]
        seen.extend(parts)
        assert request.url == "https://api.x.ai/v1/stt"
        assert request.headers["authorization"] == "Bearer backend-only-test-key"
        return httpx.Response(200, json={"text": "Safe result"})

    original_client = httpx.AsyncClient
    monkeypatch.setattr(xai_service.httpx, "AsyncClient", lambda **kwargs: original_client(
        **kwargs, transport=httpx.MockTransport(handle),
    ))
    monkeypatch.setattr(xai_service, "settings", replace(xai_service.settings,
        xai_api_key="backend-only-test-key", xai_api_base_url="https://api.x.ai"))
    result = asyncio.run(xai_service.transcribe_audio(
        b"audio payload", filename="recording.wav", content_type="audio/wav", language=language, keyterms=terms,
    ))
    expected = [] if language is None else [("language", language.encode()), ("format", b"true")]
    if terms:
        expected.extend([("keyterm", "Café".encode()), ("keyterm", b"Private term")])
    expected.append(("file", b"audio payload"))
    assert seen == expected
    assert result.text == "Safe result"


@pytest.mark.parametrize("terms", [["private\nterm"], ["private"] * 101, "private", [None]])
def test_invalid_provider_vocabulary_never_opens_client_or_logs_terms(monkeypatch, caplog, terms) -> None:
    def must_not_connect(**kwargs):
        raise AssertionError("Invalid vocabulary must fail before opening an HTTP client")
    monkeypatch.setattr(xai_service.httpx, "AsyncClient", must_not_connect)
    monkeypatch.setattr(xai_service, "settings", replace(xai_service.settings, xai_api_key="backend-only-test-key"))
    with pytest.raises(xai_service.XAIServiceError, match="^Invalid transcription vocabulary.$"):
        asyncio.run(xai_service.transcribe_audio(
            b"audio", filename="recording.wav", content_type="audio/wav", language="en", keyterms=terms,
        ))
    assert "private" not in caplog.text
