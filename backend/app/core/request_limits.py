"""Bound transcription bodies before multipart parsing, including chunked uploads."""
import asyncio

from starlette.responses import JSONResponse

from app.core.limits import InProcessConcurrencyLimiter, LimitExceeded


class BodyTooLarge(Exception):
    pass


class UploadTimedOut(Exception):
    pass


class TranscriptionBodyLimitMiddleware:
    def __init__(self, app, *, max_bytes: int, max_concurrent: int, timeout_seconds: float = 15) -> None:
        self.app = app
        self.max_bytes = max_bytes
        self.max_concurrent = max_concurrent
        self.timeout_seconds = timeout_seconds
        self.limiter = InProcessConcurrencyLimiter()

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http" or scope["method"] != "POST" or scope["path"] != "/api/transcribe":
            await self.app(scope, receive, send)
            return

        try:
            async with self.limiter.acquire(limit=self.max_concurrent):
                body = bytearray()
                try:
                    async with asyncio.timeout(self.timeout_seconds):
                        while True:
                            message = await receive()
                            if message["type"] == "http.disconnect":
                                return
                            chunk = message.get("body", b"")
                            if len(body) + len(chunk) > self.max_bytes:
                                raise BodyTooLarge
                            body.extend(chunk)
                            if not message.get("more_body", False):
                                break
                except TimeoutError as exc:
                    raise UploadTimedOut from exc

                replayed = False

                async def bounded_receive():
                    nonlocal replayed
                    if replayed:
                        return await receive()
                    replayed = True
                    payload = bytes(body)
                    body.clear()
                    return {"type": "http.request", "body": payload, "more_body": False}

                await self.app(scope, bounded_receive, send)
                return
        except BodyTooLarge:
            status_code, detail = 413, "Uploaded audio file is too large."
        except UploadTimedOut:
            status_code, detail = 408, "Audio upload timed out."
        except LimitExceeded:
            status_code, detail = 429, "Too many transcription requests. Please try again later."
        await JSONResponse(status_code=status_code, content={"detail": detail})(scope, receive, send)
