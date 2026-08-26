# Backend

This folder contains the FastAPI backend for Dictozy: Voice Dictation.

The backend accepts user-triggered audio from the Chrome extension, calls xAI Speech-to-Text, and returns transcript text to the extension.

The `/api/transcribe` endpoint validates the uploaded audio file, sends it to xAI from the backend only, and returns the transcript. The browser extension must never call xAI directly, and the xAI API key must stay in backend environment variables.

## Stack

- Python
- FastAPI
- httpx
- python-dotenv
- Docker-ready deployment files

## Local Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
```

On Windows:

```bat
.venv\Scripts\activate
```

Install development and test dependencies:

```bash
pip install -r requirements-dev.txt
```

Production builds install only `requirements.txt`; test tooling stays out of the runtime image.

Create a local environment file:

```bash
cp .env.example .env
```

Set `XAI_API_KEY` in `.env` before using `/api/transcribe`.

Optional hardening settings are included in `.env.example`:

- `TRANSCRIPTION_ENABLED`: set to `false` to return a safe `503` from `/api/transcribe` without calling xAI. Invalid non-empty values stop backend startup instead of silently enabling transcription.
- `TRANSCRIBE_MAX_CONCURRENT_REQUESTS`: in-process concurrent transcription guard. Set to `0` to disable.
- `TRANSCRIBE_RATE_LIMIT_REQUESTS`: in-memory request count per rate window. Set to `0` to disable.
- `TRANSCRIBE_RATE_LIMIT_WINDOW_SECONDS`: rate-limit window length.
- `MAX_TRANSCRIBE_CONTENT_LENGTH_BYTES`: early multipart upload content-length guard. The uploaded audio file itself is still capped at 10 MiB by app validation.

For production configuration, use `.env.production.example` as a template and provide secrets through the hosting provider's environment or secret manager.

For local backend testing, keep `BACKEND_CORS_ORIGINS` limited to trusted local origins. Production requires only `chrome-extension://folpeencabfejhjokmldikaelonphmma` and rejects wildcard, localhost, or additional origins at startup.

Run the development server:

```bash
uvicorn app.main:app --reload
```

Health check:

```bash
curl http://127.0.0.1:8000/health
```

Local transcription test with a short, non-sensitive audio file:

```bash
curl -X POST http://127.0.0.1:8000/api/transcribe \
  -F "language=en" \
  -F "file=@sample.webm;type=audio/webm"
```

The optional multipart `language` field controls written formatting:

- If the field is missing, the backend defaults to `en` for compatibility with older extension versions.
- `auto` tells the backend to omit both provider `language` and `format` parameters.
- A supported explicit language sends its code with `format=true` to guide written formatting for numbers, currencies, and units.
- An unsupported value returns a safe `400` response before xAI is called.

Deploy the backward-compatible backend before distributing extension `0.1.6`. Verify one transcription from the published `0.1.5` extension, then test English, Automatic, and one explicit non-English language from the `0.1.6` package.

Run backend tests:

```bash
pytest
```

## Docker

Build from this folder:

```bash
docker build -t voice-dictation-backend .
```

Run locally:

```bash
docker run --rm -p 8000:8000 --env-file .env voice-dictation-backend
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for production setup notes.

Smoke-test a deployed backend:

```bash
python scripts/smoke_test.py https://YOUR_BACKEND_HOST
python scripts/smoke_test.py https://YOUR_BACKEND_HOST --audio sample.webm
```

## Troubleshooting

- `503 Speech-to-text service is not configured.` means `XAI_API_KEY` is missing from `.env` or the backend was not restarted after editing `.env`.
- `503 Speech-to-text service is temporarily unavailable.` means `TRANSCRIPTION_ENABLED=false` is active.
- `429 Too many transcription requests.` means the in-process rate or concurrency guard rejected the request.
- `502 Speech-to-text service failed.` means the backend reached xAI but xAI rejected or failed the request. Check backend logs for `xAI STT` warning lines.
- `403` from xAI usually means the xAI team needs credits, licenses, or Speech-to-Text access.
- `400 Unsupported audio file type.` means the uploaded file MIME type is not in the allowed audio list.
- `400 Unsupported transcription language.` means the submitted language is outside the audited allowlist.
- A startup error naming `TRANSCRIPTION_ENABLED` means the environment value is not a supported true or false spelling.
- Never paste or commit the real `XAI_API_KEY`.
