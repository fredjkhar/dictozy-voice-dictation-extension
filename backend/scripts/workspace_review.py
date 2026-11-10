"""Loopback-only review server: real upload/validation route, deterministic provider stub.

This module is outside app/ and is not copied into the production Docker image.
It is never selected through an API parameter or a production configuration flag.
"""
import argparse
import asyncio
import os
import socket
import sys


def port_number(value: str) -> int:
    port = int(value)
    if not 1024 <= port <= 65535:
        raise argparse.ArgumentTypeError("Choose a port between 1024 and 65535.")
    return port


def build_review_app(site_port: int):
    if "app.core.config" in sys.modules:
        raise RuntimeError("Start the review server in a fresh process, before importing app configuration.")
    # Do not inherit provider credentials or production configuration, or load a .env file.
    os.environ.update({
        "PYTHON_DOTENV_DISABLED": "true",
        "APP_ENV": "local",
        "XAI_API_KEY": "",
        "XAI_API_BASE_URL": "http://127.0.0.1:9",
        "BACKEND_CORS_ORIGINS": f"http://127.0.0.1:{site_port}",
        "TRANSCRIPTION_ENABLED": "true",
        "TRANSCRIBE_MAX_CONCURRENT_REQUESTS": "2",
        "TRANSCRIBE_RATE_LIMIT_REQUESTS": "30",
        "TRANSCRIBE_RATE_LIMIT_WINDOW_SECONDS": "60",
        "MAX_TRANSCRIBE_CONTENT_LENGTH_BYTES": "11534336",
        "TRANSCRIBE_AUDIO_BUDGET_SECONDS": "3600",
        "TRANSCRIBE_AUDIO_BUDGET_WINDOW_SECONDS": "86400",
        "FORWARDED_ALLOW_IPS": "",
    })
    from app.main import app
    from app.routes import transcribe
    from app.services.xai_service import XAITranscriptionResult

    app.state.review_provider_calls = 0

    async def mock_provider(_audio_bytes, *, filename, content_type, language, keyterms=None):
        app.state.review_provider_calls += 1
        # Only to make cancellation reviewable, never a claim about provider latency.
        await asyncio.sleep(0.6)
        return XAITranscriptionResult(text="Bring the blue notebook.")

    transcribe.transcribe_with_xai = mock_provider

    @app.get("/review/status")
    async def review_status():
        return {"mode": "mock-provider", "provider_calls": app.state.review_provider_calls}

    return app


def deny_outbound_connections() -> None:
    # Defense in depth if review wiring accidentally calls a network client.
    # Accepting inbound loopback connections does not use socket.connect.
    def blocked(*_args, **_kwargs):
        raise OSError("Outbound connections are disabled in local review.")

    socket.socket.connect = blocked
    socket.socket.connect_ex = blocked


def main() -> None:
    parser = argparse.ArgumentParser(description="Local review: mocked transcription; no provider requests.")
    parser.add_argument("--port", type=port_number, default=4199)
    parser.add_argument("--site-port", type=port_number, default=4198)
    args = parser.parse_args()
    app = build_review_app(args.site_port)
    deny_outbound_connections()
    import uvicorn
    print("Local review: transcription responses are mocked; no provider requests.", flush=True)
    uvicorn.run(app, host="127.0.0.1", port=args.port, workers=1, proxy_headers=False, access_log=False)


if __name__ == "__main__":
    main()
