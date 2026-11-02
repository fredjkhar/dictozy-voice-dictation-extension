import asyncio
import json

from app.core.request_limits import TranscriptionBodyLimitMiddleware


SCOPE = {"type": "http", "method": "POST", "path": "/api/transcribe"}


def test_chunked_body_is_bounded_before_application_parsing() -> None:
    async def scenario():
        parsed = []
        sent = []
        chunks = iter([{"type": "http.request", "body": b"123", "more_body": True},
                       {"type": "http.request", "body": b"456", "more_body": False}])
        async def receive():
            return next(chunks)
        async def send(message):
            sent.append(message)
        async def downstream(*_args):
            parsed.append(True)
        middleware = TranscriptionBodyLimitMiddleware(downstream, max_bytes=5, max_concurrent=1)
        await middleware(SCOPE, receive, send)
        assert not parsed
        assert sent[0]["status"] == 413
        assert json.loads(sent[1]["body"])["detail"] == "Uploaded audio file is too large."
        assert middleware.limiter._in_flight == 0
    asyncio.run(scenario())


def test_slow_upload_times_out_and_releases_admission_slot() -> None:
    async def scenario():
        sent = []
        async def receive():
            await asyncio.Event().wait()
        async def send(message):
            sent.append(message)
        async def downstream(*_args):
            raise AssertionError("Incomplete body must not be parsed")
        middleware = TranscriptionBodyLimitMiddleware(downstream, max_bytes=5, max_concurrent=1, timeout_seconds=0.01)
        await middleware(SCOPE, receive, send)
        assert sent[0]["status"] == 408
        assert middleware.limiter._in_flight == 0
    asyncio.run(scenario())


def test_disconnected_upload_never_reaches_parser() -> None:
    async def scenario():
        async def receive():
            return {"type": "http.disconnect"}
        async def unused(*_args):
            raise AssertionError("No response or parsing after disconnected upload")
        middleware = TranscriptionBodyLimitMiddleware(unused, max_bytes=5, max_concurrent=1)
        await middleware(SCOPE, receive, unused)
        assert middleware.limiter._in_flight == 0
    asyncio.run(scenario())


def test_upload_concurrency_is_bounded_before_body_reading() -> None:
    async def scenario():
        started, release = asyncio.Event(), asyncio.Event()
        sent = []
        async def receive():
            started.set()
            await release.wait()
            return {"type": "http.request", "body": b"ok", "more_body": False}
        async def downstream(scope, receive, send):
            assert (await receive())["body"] == b"ok"
        async def send(message):
            sent.append(message)
        async def must_not_read():
            raise AssertionError("Rejected upload must not read or buffer a body")
        middleware = TranscriptionBodyLimitMiddleware(downstream, max_bytes=5, max_concurrent=1)
        first = asyncio.create_task(middleware(SCOPE, receive, send))
        await started.wait()
        await middleware(SCOPE, must_not_read, send)
        assert sent[0]["status"] == 429
        release.set()
        await first
        assert middleware.limiter._in_flight == 0
    asyncio.run(scenario())


def test_downstream_timeout_is_not_misreported_as_an_upload_timeout() -> None:
    import pytest
    async def scenario():
        async def receive():
            return {"type": "http.request", "body": b"ok", "more_body": False}
        async def downstream(*_args):
            raise TimeoutError("downstream failure")
        async def send(_message):
            raise AssertionError("Must not emit a second response for downstream failure")
        middleware = TranscriptionBodyLimitMiddleware(downstream, max_bytes=5, max_concurrent=1)
        with pytest.raises(TimeoutError):
            await middleware(SCOPE, receive, send)
        assert middleware.limiter._in_flight == 0
    asyncio.run(scenario())
