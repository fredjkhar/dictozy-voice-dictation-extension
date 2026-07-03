from dataclasses import dataclass
import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class XAIServiceError(Exception):
    """Raised when xAI Speech-to-Text cannot return a usable transcript."""


class XAIConfigurationError(XAIServiceError):
    """Raised when required xAI backend configuration is missing."""


class XAIEmptyTranscriptError(XAIServiceError):
    """Raised when xAI returns a successful response without usable text."""


@dataclass(frozen=True)
class XAITranscriptionResult:
    text: str


async def transcribe_audio(
    audio_bytes: bytes,
    *,
    filename: str,
    content_type: str,
) -> XAITranscriptionResult:
    if not settings.xai_api_key:
        raise XAIConfigurationError("XAI_API_KEY is not configured.")

    endpoint = f"{settings.xai_api_base_url.rstrip('/')}/v1/stt"
    headers = {"Authorization": f"Bearer {settings.xai_api_key}"}
    data = {
        "format": "true",
        "language": "en",
    }
    files = {
        "file": (filename or "recording.webm", audio_bytes, content_type or "audio/webm"),
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(endpoint, headers=headers, data=data, files=files)
    except httpx.TimeoutException as exc:
        logger.warning("xAI STT request timed out")
        raise XAIServiceError("xAI transcription request timed out.") from exc
    except httpx.RequestError as exc:
        logger.warning("xAI STT request failed before response: %s", exc.__class__.__name__)
        raise XAIServiceError("xAI transcription request failed.") from exc

    if response.status_code >= 400:
        logger.warning("xAI STT request rejected with status %s", response.status_code)
        raise XAIServiceError("xAI transcription request was rejected.")

    try:
        payload = response.json()
    except ValueError as exc:
        logger.warning(
            "xAI STT response was not JSON. status=%s content_type=%s",
            response.status_code,
            response.headers.get("content-type", ""),
        )
        raise XAIServiceError("xAI transcription response was not valid JSON.") from exc

    text = payload.get("text")
    if not isinstance(text, str):
        logger.warning("xAI STT response did not include text. Keys: %s", sorted(payload.keys()))
        raise XAIServiceError("xAI transcription response did not include text.")

    if not text.strip():
        logger.warning("xAI STT response included empty text. Keys: %s", sorted(payload.keys()))
        raise XAIEmptyTranscriptError("xAI transcription response included empty text.")

    return XAITranscriptionResult(text=text.strip())
