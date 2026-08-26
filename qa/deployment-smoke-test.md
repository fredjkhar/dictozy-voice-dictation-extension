# Deployment Smoke Test

Use this checklist after deploying or changing the production FastAPI backend. Use a short, non-sensitive recording for transcription checks.

For the already-published Chrome Web Store extension, also follow [post-publish-monitoring.md](post-publish-monitoring.md).

## Production Configuration

- The public backend URL uses HTTPS with a valid certificate.
- `APP_ENV` is `production`.
- `XAI_API_KEY` is stored only in the hosting provider's secret or environment system.
- `XAI_API_BASE_URL` is `https://api.x.ai` unless xAI documentation requires another official endpoint.
- `BACKEND_CORS_ORIGINS` contains only `chrome-extension://folpeencabfejhjokmldikaelonphmma` and does not use `*`, localhost, or additional origins.
- No real `.env` file, API key, or recorded audio is committed to Git.

The production backend fails startup when `APP_ENV=production` unless the published Dictozy origin is the only configured CORS origin.

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

For local or staging backend checks, use `scripts/smoke_test.py` directly. The production extension cannot be redirected to localhost or a staging origin.

For the unpacked release candidate:

1. Reload the unpacked extension on `chrome://extensions`.
2. Confirm Language formatting defaults to English.
3. Confirm the popup contains no backend URL, Check Backend, or Advanced Backend control.
4. Open or refresh the local QA page or a normal HTTPS site.
5. Focus a supported, non-sensitive field and click the microphone icon.
6. Record a short phrase and stop.
7. Confirm the status advances through recording and transcribing.
8. Confirm the transcript appears in the original field and focus returns to it.
9. Confirm the request target is `https://voice-dictation-extension.onrender.com`, never an `x.ai` host.
10. Repeat the start, stop, and successful insertion flow with the assigned browser shortcut.
11. Save Automatic and one explicit non-English language in turn; confirm each request succeeds and the selection persists.
12. Cancel one pending transcription with the shortcut and confirm no late result is inserted.
13. Disable the current site during recording and during pending transcription; confirm extension-side work stops and no late result is inserted.
14. Re-enable the site, refocus a supported field, and confirm dictation works again.
15. Inspect the transcription request and confirm it contains no origin, URL, hostname, site preference, page content, or field metadata.

For the published production path:

1. Install Dictozy from the Chrome Web Store.
2. Confirm the extension ID is `folpeencabfejhjokmldikaelonphmma`.
3. Confirm version `0.1.9` while the `0.1.10` production-hardening update remains under review.
4. Run the same supported-field recording and insertion checks.
5. Confirm the popup displays the assigned shortcut or `Not assigned`, and that the keyboard icon opens Chrome's shortcut settings.
6. Confirm the assigned shortcut starts and stops one recording and cancels one pending transcription.
7. Confirm English is the default, then complete one request using Automatic and one explicit non-English language.
8. Confirm production network traffic goes only to `https://voice-dictation-extension.onrender.com`, never directly to xAI.
9. Confirm Render logs include request ID, status, and latency for the smoke test without audio or transcript content.
10. Confirm the current-site control persists an explicit disabled preference, remains independent from the global toggle, and is unavailable on restricted Chrome pages.

## Backend Compatibility Check

Version `0.1.10` keeps the successful transcription contract while tightening production configuration:

1. Confirm production `/health` before extension testing.
2. Use the currently published extension and confirm one transcription still succeeds.
3. Load the `0.1.10` package and test English, Automatic, and one explicit non-English language.
4. Confirm extension traffic goes only to the fixed Dictozy production backend.
5. Restart a production-configured backend with an unsafe CORS value and confirm startup fails clearly; restore the exact published extension origin afterward.

## Failure Checks

- A legacy stored `backendUrl` value is ignored and removed during extension update.
- Runtime messages containing an endpoint override are rejected before any network request.
- A stopped or unavailable backend produces a reachable error state instead of leaving the extension on Transcribing.
- A backend timeout returns control to the user with a retry state and short request reference.
- Cancelling a pending transcription prevents any late response from being inserted; it does not guarantee provider-side processing stops after upload.
- Turning Dictozy off during recording or transcription cancels extension-side active work safely.
- A retry records a fresh clip and does not reuse failed audio.
- Repeated shortcut presses do not overlap recording or transcription work.
- The shortcut does nothing while Dictozy is disabled or an unsupported or sensitive field is focused.
- The shortcut and click control do nothing when the current site is disabled.
- Disabling a site during active work stops tracks, cancels pending extension requests, and prevents late insertion.
- Site settings are never included in backend traffic.
- Backend responses do not expose provider credentials or raw upstream error bodies.
- Unsupported language values return a safe `400` and do not expose provider details.

## Local Script Check

The smoke-test script permits HTTP only when explicitly testing localhost:

```bash
python scripts/smoke_test.py http://127.0.0.1:8000 --allow-http
```
