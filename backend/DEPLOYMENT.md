# Backend Deployment

This guide prepares the FastAPI backend for deployment. It does not cover a specific hosting provider.

## Required Environment Variables

- `XAI_API_KEY`: real xAI API key. Required for `/api/transcribe`.
- `XAI_API_BASE_URL`: defaults to `https://api.x.ai`.
- `APP_ENV`: set to `production` in deployed environments.
- `BACKEND_CORS_ORIGINS`: comma-separated origins allowed to call the backend.
- `TRANSCRIPTION_ENABLED`: set to `true` for normal operation. Set to `false` as the global emergency cutoff. Invalid non-empty values stop startup with a configuration error.
- `TRANSCRIBE_MAX_CONCURRENT_REQUESTS`: maximum in-process `/api/transcribe` requests allowed at once. Must remain positive in production.
- `TRANSCRIBE_RATE_LIMIT_REQUESTS`: maximum `/api/transcribe` requests per in-memory rate-limit window. Must remain positive in production.
- `TRANSCRIBE_RATE_LIMIT_WINDOW_SECONDS`: rate-limit window length.
- `MAX_TRANSCRIBE_CONTENT_LENGTH_BYTES`: multipart body-size guard (declared and actual bytes, including chunked uploads). Defaults to 11 MiB to allow multipart overhead while app validation keeps the uploaded audio file capped at 10 MiB.

Never place a real `XAI_API_KEY` in source control, Docker images, frontend code, or Chrome extension files.

Start from the production-safe template:

```bash
cp .env.production.example .env.production
```

The template already contains the published Dictozy extension origin. Keep the real production file and API key outside source control.

## Chrome Web Store Extension ID

The published extension ID is fixed. Production startup requires this exact origin:

```text
BACKEND_CORS_ORIGINS=chrome-extension://folpeencabfejhjokmldikaelonphmma
```

Do not add a trailing slash or additional origins. When `APP_ENV=production`, the backend fails startup unless this is the only CORS origin. Redeploy after changing the environment variable and verify both `/health` and a real extension transcription. See [../store/release-checklist.md](../store/release-checklist.md) for the complete sequence.

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
  -e BACKEND_CORS_ORIGINS="chrome-extension://folpeencabfejhjokmldikaelonphmma" \
  -e TRANSCRIPTION_ENABLED="true" \
  -e TRANSCRIBE_MAX_CONCURRENT_REQUESTS="2" \
  -e TRANSCRIBE_RATE_LIMIT_REQUESTS="30" \
  -e TRANSCRIBE_RATE_LIMIT_WINDOW_SECONDS="60" \
  -e MAX_TRANSCRIBE_CONTENT_LENGTH_BYTES="11534336" \
  voice-dictation-backend
```

For local Docker and direct smoke-script testing:

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

## Extension Verification

After the backend is deployed:

1. Confirm the deployed service uses the production origin packaged in `extension/config.js`.
2. Open `/health` directly and confirm `{"status":"ok"}`.
3. Open the extension popup and choose the language-formatting preference to test. English is the default.
4. Reload the test page and run a short dictation test.
5. Confirm the service-worker request target is the production backend and never an xAI host.

The Store extension is not configurable to use another backend. It must never call xAI directly.

## Language Compatibility And Rollout

`/api/transcribe` accepts an optional multipart `language` form field. Supported values are `auto`, `ar`, `cs`, `da`, `nl`, `en`, `fil`, `fr`, `de`, `hi`, `id`, `it`, `ja`, `ko`, `mk`, `ms`, `fa`, `pl`, `pt`, `ro`, `ru`, `es`, `sv`, `th`, `tr`, and `vi`.

- A missing field defaults to `en`, preserving the behavior of `0.1.5` and older clients.
- `auto` tells the backend to omit both `language` and `format` from the xAI request.
- An explicit supported code is sent to xAI with `format=true` to guide written formatting for numbers, currencies, and units. It does not guarantee better speech recognition.
- Unsupported values return a safe `400` response before xAI is called.

Deploy the compatible backend before distributing the `0.1.6` extension. After deployment, verify `/health`, run one transcription from the published `0.1.5` extension, and then test the `0.1.6` package with English, Automatic, and one explicit non-English language. This order preserves service for clients that do not send the new field.

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
- In-memory rate limiting: repeated requests from the same client key return `429` before calling xAI. Expired client buckets are pruned periodically. The client key uses only the server-resolved client address, never raw forwarding headers; it is not written to application logs.
- Request IDs: every response includes `X-Request-ID`. Backend request logs include request ID, method, path, status, and latency only.

These guards reset when the process restarts. Keep exactly one worker and one replica for the aggregate allowance to apply to the running service. Do not treat this as a durable billing cap; see the Phase 1 deployment gate below.

## Upload Limits

The app keeps the uploaded audio file limit at 10 MiB and accepts only known audio MIME types. It rejects `/api/transcribe` requests when either declared or actual body bytes exceed `MAX_TRANSCRIBE_CONTENT_LENGTH_BYTES`. A bounded in-memory receive stage checks actual bytes before multipart parsing, limits concurrent uploads, and times out incomplete uploads after 15 seconds.

Render's public docs do not expose a simple per-service request-body-size setting for this web service. Keep the app-level guard enabled, and add an upstream proxy or edge rule later if you need a hard platform-level request body cap before traffic reaches FastAPI.

## Audio Normalization

Before calling xAI Speech-to-Text, the backend converts accepted browser audio to mono 16 kHz WAV in memory. It checks privacy-safe signal metrics first, rejects silent or near-silent uploads before they reach xAI, then applies speech-focused filtering and dynamic normalization to usable audio. This keeps the extension package unchanged while giving the provider a stable, speech-friendly input format. The conversion uses the pinned `imageio-ffmpeg` Python package and pipes bytes in memory. Multipart parsing may spool uploads over 1 MiB into automatically cleaned temporary files before normalization. This is temporary processing, not an audio archive.

If normalization fails, `/api/transcribe` returns a safe `400` response without logging audio bytes, transcripts, ffmpeg stderr, API keys, or provider response bodies. If no speech signal is detected, `/api/transcribe` returns a safe `400` asking the user to check the microphone and try again.

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


## Phase 1 deployment gate (unpublished changes)

Do not deploy or modify production settings without approval. The code has been tested locally;
Render ingress trust, replica count, real provider behavior and production logs remain deployment checks.

- `TRANSCRIBE_AUDIO_BUDGET_SECONDS=3600` reserves at most one hour of decoded audio across all
  clients in each rolling `TRANSCRIBE_AUDIO_BUDGET_WINDOW_SECONDS=86400` window. Reservations
  round each attempt up to a whole second and are atomic. Provider failures/cancellations are
  not refunded. Exhaustion returns safe `429` before xAI is called. This is a **per-running-worker
  usage cap**, not a dollar-denominated or restart-proof spending limit.
- Docker explicitly runs `--workers 1`. Keep one replica. Scaling/restarting/redeploying resets or
  multiplies in-memory quotas. A durable cross-restart/global cap needs an approved shared store
  (for example managed Redis) or a verified provider/edge hard limit. No such infrastructure or
  production billing setting has been introduced or changed.
- Uvicorn resolves forwarding headers only from trusted immediate proxy peers. Export
  `FORWARDED_ALLOW_IPS` in the server's environment with verified ingress IPs/networks; do not
  rely on application `.env` loading to configure the server. The default trusts loopback only.
  Production startup rejects `*`, whole-internet networks and malformed entries. Do not override
  this with an unsafe Uvicorn command-line setting. See [Uvicorn settings](https://uvicorn.dev/settings/).
- Do not guess Render ingress ranges or use its **outbound** IP list as an ingress trust list.
  Verify the actual proxy chain with the host before configuring it. Until then requests share
  the untrusted proxy's transport address for quotas; this fails safely but may group legitimate users.
  Test both a normal request and one with a forged leftmost forwarding header after approval.
- CORS is not authentication. Clients outside the extension can call this public API; concurrency,
  per-client rate and aggregate duration limits reduce abuse but do not eliminate distributed denial
  of service. Keep the existing emergency cutoff and provider usage review.
- The body guard buffers at most the configured request size per admitted upload before multipart
  parsing. Upload admission is held through request completion, so the default two concurrent
  requests bound this extra buffer. ASGI disconnects, oversize bodies and 15-second receive timeouts
  release the slot; hosting-level request limits are still useful.
- The parser can spool audio above 1 MiB to temporary files, which FastAPI closes at completion,
  including handled errors. No persistent recording/transcript history is added. Publish the
  revised privacy disclosure with the approved release. Abrupt host failure follows platform
  temporary-storage cleanup; no filesystem persistence guarantee is claimed.
- Audio duration comes from actual decoded mono 16 kHz samples. Clips below 0.25 seconds or above
  60 seconds are rejected; long inputs are not silently truncated. FFmpeg has a 20-second timeout
  per pass, bounded output duration and probing, one decoder/filter thread, and pipe-only input
  protocols. Final WAV headers reflect the actual samples.
- `app.requests` emits structured INFO request IDs/status/latency regardless of Uvicorn's root
  logger level. Unmatched paths are redacted and unexpected exceptions return safe JSON without
  logging exception strings/tracebacks. Docker disables Uvicorn access logs, which otherwise include
  client addresses. Configure host-level access logs separately. Never log raw audio or transcripts.
- `/health` remains a liveness endpoint, not proof that xAI or billing is available. Use approved
  non-sensitive smoke tests to validate the whole path; cancellation does not guarantee provider
  processing or billing stops.
