# Deployment Smoke Test

Use this checklist after deploying or changing the production FastAPI backend. Use a short, non-sensitive recording for transcription checks.

## Production Configuration

- The public backend URL uses HTTPS with a valid certificate.
- `APP_ENV` is `production`.
- `XAI_API_KEY` is stored only in the hosting provider's secret or environment system.
- `XAI_API_BASE_URL` is `https://api.x.ai` unless xAI documentation requires another official endpoint.
- `BACKEND_CORS_ORIGINS` contains the expected `chrome-extension://EXTENSION_ID` origin and does not use `*`.
- No real `.env` file, API key, or recorded audio is committed to Git.

Find the unpacked extension ID on `chrome://extensions`. If the ID changes, update the backend CORS configuration and restart or redeploy the backend.

## Backend Checks

From `backend/` with dependencies installed:

```bash
python scripts/smoke_test.py https://YOUR_BACKEND_HOST
```

Expected result:

```text
PASS health: https://YOUR_BACKEND_HOST/health
SKIP transcription: no --audio file supplied
```

Run the full provider path with a short audio sample:

```bash
python scripts/smoke_test.py https://YOUR_BACKEND_HOST --audio sample.webm
```

Confirm that health and transcription both pass. If transcription fails while health passes, inspect backend logs for safe xAI status details and verify xAI credits and access.

## Extension Checks

1. Reload the unpacked extension on `chrome://extensions`.
2. Open the popup and enter `https://YOUR_BACKEND_HOST/api/transcribe`.
3. Click Save Settings, close the popup, reopen it, and confirm the URL persisted.
4. Expand Advanced, click Check Backend, and confirm `Backend is reachable.`
5. Open or refresh the local QA page or a normal HTTPS site.
6. Focus a supported, non-sensitive field and click the microphone icon.
7. Record a short phrase and stop.
8. Confirm the status advances through recording and transcribing.
9. Confirm the transcript appears in the original field and focus returns to it.
10. Confirm the request target in the extension service worker network tools is your backend, never an `x.ai` host.

## Failure Checks

- Entering remote HTTP is rejected before it is saved.
- Entering an xAI URL is rejected before it is saved.
- A stopped or unavailable backend produces a reachable error state instead of leaving the extension on Transcribing.
- A backend timeout returns control to the user.
- Backend responses do not expose provider credentials or raw upstream error bodies.

## Local Script Check

The smoke-test script permits HTTP only when explicitly testing localhost:

```bash
python scripts/smoke_test.py http://127.0.0.1:8000 --allow-http
```
