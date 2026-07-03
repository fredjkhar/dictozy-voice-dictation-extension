import asyncio

from fastapi import APIRouter, File, HTTPException, Request, UploadFile, status

from app.core.config import settings
from app.core.limits import InMemoryRateLimiter, InProcessConcurrencyLimiter, LimitExceeded
from app.core.security import normalize_content_type, safe_audio_filename, validate_audio_upload
from app.schemas.transcription import TranscriptionResponse
from app.services.audio_normalization import AudioNormalizationError, normalize_audio_for_stt
from app.services.xai_service import (
    XAIConfigurationError,
    XAIEmptyTranscriptError,
    XAIServiceError,
    transcribe_audio as transcribe_with_xai,
)

router = APIRouter(tags=["transcription"])
rate_limiter = InMemoryRateLimiter()
concurrency_limiter = InProcessConcurrencyLimiter()


def get_rate_limit_key(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    forwarded_host = forwarded_for.split(",", 1)[0].strip()

    if forwarded_host:
        return forwarded_host

    if request.client and request.client.host:
        return request.client.host

    return "unknown"


@router.post("/transcribe", response_model=TranscriptionResponse)
async def transcribe_audio_route(request: Request, file: UploadFile = File(...)) -> TranscriptionResponse:
    if not settings.transcription_enabled:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Speech-to-text service is temporarily unavailable.",
        )

    if not rate_limiter.allow(
        get_rate_limit_key(request),
        limit=settings.transcribe_rate_limit_requests,
        window_seconds=settings.transcribe_rate_limit_window_seconds,
    ):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many transcription requests. Please try again later.",
        )

    try:
        async with concurrency_limiter.acquire(limit=settings.transcribe_max_concurrent_requests):
            audio_bytes = await validate_audio_upload(file)
            normalized_audio = await asyncio.to_thread(normalize_audio_for_stt, audio_bytes)

            result = await transcribe_with_xai(
                normalized_audio.audio_bytes,
                filename=safe_audio_filename(normalized_audio.filename),
                content_type=normalize_content_type(normalized_audio.content_type) or "audio/wav",
            )
    except LimitExceeded as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many transcription requests. Please try again later.",
        ) from exc
    except AudioNormalizationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not process recorded audio.",
        ) from exc
    except XAIConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Speech-to-text service is not configured.",
        ) from exc
    except XAIEmptyTranscriptError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No speech was detected. Please try again.",
        ) from exc
    except XAIServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Speech-to-text service failed.",
        ) from exc

    return TranscriptionResponse(transcript=result.text)
