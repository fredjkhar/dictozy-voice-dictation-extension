# Backend Deployment

This guide prepares the FastAPI backend for deployment. It does not cover a specific hosting provider.

## Required Environment Variables

- `XAI_API_KEY`: real xAI API key. Required for `/api/transcribe`.
- `XAI_API_BASE_URL`: defaults to `https://api.x.ai`.
- `APP_ENV`: set to `production` in deployed environments.
- `BACKEND_CORS_ORIGINS`: comma-separated origins allowed to call the backend.
- `TRANSCRIPTION_ENABLED`: set to `true` for normal operation. Set to `false` as the global emergency cutoff.
- `TRANSCRIBE_MAX_CONCURRENT_REQUESTS`: maximum in-process `/api/transcribe` requests allowed at once. Set to `0` to disable the guard.
- `TRANSCRIBE_RATE_LIMIT_REQUESTS`: maximum `/api/transcribe` requests per in-memory rate-limit window. Set to `0` to disable the guard.
- `TRANSCRIBE_RATE_LIMIT_WINDOW_SECONDS`: rate-limit window length.
- `MAX_TRANSCRIBE_CONTENT_LENGTH_BYTES`: early multipart upload content-length guard. Defaults to 11 MiB to allow multipart overhead while app validation keeps the uploaded audio file capped at 10 MiB.

Never place a real `XAI_API_KEY` in source control, Docker images, frontend code, or Chrome extension files.

Start from the production-safe template:

```bash
cp .env.production.example .env.production
```

Replace `YOUR_EXTENSION_ID` with the ID shown for the loaded extension on `chrome://extensions`. Keep the real production file and API key outside source control.

## Chrome Web Store Extension ID

The Web Store assigns the final extension ID after the first ZIP is uploaded as a draft item. Before submitting that draft for review, update Render with the exact origin:

```text
BACKEND_CORS_ORIGINS=chrome-extension://FINAL_EXTENSION_ID
```

Do not add a trailing slash. During pre-release testing, the final ID and unpacked development ID may be supplied as comma-separated origins. Redeploy after changing the environment variable and verify both `/health` and a real extension transcription. See [../store/release-checklist.md](../store/release-checklist.md) for the complete sequence.

## Docker Build

From the `backend/` folder:

```bash
docker build -t voice-dictation-backend .
```

Docker Desktop or another Docker daemon must be running before this command will work.

## Docker Run

```bash
docker run --rm -p 8000:8000 \
  -e XAI_API_KEY="replace_with_real_key" \
  -e XAI_API_BASE_URL="https://api.x.ai" \
  -e APP_ENV="production" \
  -e BACKEND_CORS_ORIGINS="chrome-extension://YOUR_EXTENSION_ID,https://YOUR_FRONTEND_ORIGIN" \
  -e TRANSCRIPTION_ENABLED="true" \
  -e TRANSCRIBE_MAX_CONCURRENT_REQUESTS="2" \
  -e TRANSCRIBE_RATE_LIMIT_REQUESTS="30" \
  -e TRANSCRIBE_RATE_LIMIT_WINDOW_SECONDS="60" \
  -e MAX_TRANSCRIBE_CONTENT_LENGTH_BYTES="11534336" \
  voice-dictation-backend
```

For local Docker testing with the unpacked extension:

```bash
docker run --rm -p 8000:8000 \
  --env-file .env \
  voice-dictation-backend
```

## Health Check

```bash
curl http://127.0.0.1:8000/health
```

Expected response:

```json
{"status":"ok"}
```

## Extension Configuration

After the backend is deployed:

1. Open the extension popup.
2. Set Backend URL to the deployed HTTPS endpoint ending in `/api/transcribe`.
3. Save settings.
4. Expand Advanced, click Check Backend, and confirm `Backend is reachable.`
5. Reload the test page and run a short dictation test.

The extension must call only your backend. It must never call xAI directly.

## Deployment Smoke Test

With the backend dependencies installed, check the public health endpoint:

```bash
python scripts/smoke_test.py https://YOUR_BACKEND_HOST
```

Then check a real transcription with a short, non-sensitive audio file:

```bash
python scripts/smoke_test.py https://YOUR_BACKEND_HOST --audio sample.webm
```

The script exits with a nonzero status when a check fails. It does not store the uploaded audio. See [../qa/deployment-smoke-test.md](../qa/deployment-smoke-test.md) for the complete browser and backend checklist.

## Launch Guardrails

The backend includes launch guardrails for `/api/transcribe`:

- A global kill switch: set `TRANSCRIPTION_ENABLED=false` and redeploy or restart the service to stop transcription calls immediately. `/health` remains available.
- In-process concurrency limiting: extra simultaneous transcription requests return `429` before calling xAI.
- In-memory rate limiting: repeated requests from the same client key return `429` before calling xAI. The client key may use forwarded request metadata in memory, but it is not written to logs.
- Request IDs: every response includes `X-Request-ID`. Backend request logs include request ID, method, path, status, and latency only.

These guards are intentionally simple for the MVP. They reset when the process restarts and are per-process if the service is scaled horizontally. Use provider-level or edge-level controls before broader public rollout.

## Upload Limits

The app keeps the uploaded audio file limit at 10 MiB and accepts only known audio MIME types. It also rejects `/api/transcribe` requests early when `Content-Length` exceeds `MAX_TRANSCRIBE_CONTENT_LENGTH_BYTES`.

Render's public docs do not expose a simple per-service request-body-size setting for this web service. Keep the app-level guard enabled, and add an upstream proxy or edge rule later if you need a hard platform-level request body cap before traffic reaches FastAPI.

## Render Readiness

Render Free web services spin down after idle periods and can take about a minute to spin back up. Before publishing the approved Chrome Web Store package, move the backend to a paid always-on instance if you want the first dictation request to avoid cold-start delay. See Render's Free instance notes: <https://render.com/docs/free>.

Recommended Render settings before publish:

- Use HTTPS on the public backend URL.
- Set `APP_ENV=production`.
- Set `BACKEND_CORS_ORIGINS=chrome-extension://folpeencabfejhjokmldikaelonphmma`.
- Store `XAI_API_KEY` only in Render environment variables or secrets.
- Set `TRANSCRIPTION_ENABLED=true`.
- Start conservatively with `TRANSCRIBE_MAX_CONCURRENT_REQUESTS=2`, `TRANSCRIBE_RATE_LIMIT_REQUESTS=30`, and `TRANSCRIBE_RATE_LIMIT_WINDOW_SECONDS=60`.
- Confirm the service is on a paid always-on instance if cold starts are unacceptable.

## xAI Spending And Emergency Cutoff

Use the xAI Console Usage Explorer to monitor daily cost and group usage by API key: <https://docs.x.ai/console/usage>. Use xAI Console Billing and API spend management to control prepaid credits, credit balance, auto top-up behavior, and monthly limits: <https://docs.x.ai/console/billing>. The xAI Console shows spend-management warnings when configured limits are being approached; keep a human review cadence during launch instead of assuming the backend has automated billing webhooks.

Emergency cutoff process:

1. Set `TRANSCRIPTION_ENABLED=false` in Render.
2. Redeploy or restart the backend service.
3. Confirm `/health` still returns `{"status":"ok"}`.
4. Confirm `/api/transcribe` returns `503` and does not call xAI.
5. Inspect logs by `request_id`; logs must not include audio, transcripts, API keys, or full upstream response bodies.

## Pre-Publish Backend Checklist

- GitHub Actions CI passes on `main`.
- Render deploy is running the latest backend commit.
- `/health` passes through `python scripts/smoke_test.py https://voice-dictation-extension.onrender.com`.
- A short, non-sensitive real transcription passes through the extension.
- Render logs show request IDs, latency, and statuses only.
- xAI Usage Explorer shows expected low usage after smoke testing.
- `TRANSCRIPTION_ENABLED=false` has been tested once in production or staging, then restored to `true`.
- The already-approved Chrome Web Store extension package remains unchanged.

## Production Notes

- Use HTTPS for deployed backends.
- Keep `BACKEND_CORS_ORIGINS` narrow.
- Keep `XAI_API_KEY` in the hosting provider's secret manager or environment variable system.
- Do not store raw audio by default.
- Monitor `429`, `502`, and `503` response trends by request ID.
- Monitor xAI usage and spending daily during launch.

## Post-Publish Monitoring

After the Chrome Web Store release is live, use [../qa/post-publish-monitoring.md](../qa/post-publish-monitoring.md) for the operational checklist.

Minimum ongoing checks:

- Confirm `/health` is reachable.
- Confirm Render CORS includes `chrome-extension://folpeencabfejhjokmldikaelonphmma`.
- Run one Store-installed extension transcription smoke test during the first daily checks.
- Review Render logs for `request_id`, method, path, status, latency, `429`, `502`, `503`, and CORS failures.
- Confirm logs do not include audio, transcripts, API keys, raw IPs when avoidable, or full upstream response bodies.
- Review xAI Console usage and spend for unexpected spikes.
- Use `TRANSCRIPTION_ENABLED=false` only when intentionally cutting off transcription, then restore `true` after the incident is resolved.
