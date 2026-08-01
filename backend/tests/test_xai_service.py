import asyncio
from dataclasses import replace

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
