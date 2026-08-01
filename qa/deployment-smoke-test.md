# Deployment Smoke Test

Use this checklist after deploying or changing the production FastAPI backend. Use a short, non-sensitive recording for transcription checks.

For the already-published Chrome Web Store extension, also follow [post-publish-monitoring.md](post-publish-monitoring.md).

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

For local or staging backend checks:

1. Reload the unpacked extension on `chrome://extensions`.
2. Open the popup and enter `https://YOUR_BACKEND_HOST/api/transcribe`.
3. Confirm Language formatting defaults to English.
4. Click Save Settings, close the popup, reopen it, and confirm the URL and language persisted.
5. Expand Advanced, click Check Backend, and confirm `Backend is reachable.`
6. Open or refresh the local QA page or a normal HTTPS site.
7. Focus a supported, non-sensitive field and click the microphone icon.
8. Record a short phrase and stop.
9. Confirm the status advances through recording and transcribing.
10. Confirm the transcript appears in the original field and focus returns to it.
11. Confirm the request target in the extension service worker network tools is your backend, never an `x.ai` host.
12. Repeat the start, stop, and successful insertion flow with the assigned browser shortcut.
13. Save Automatic and one explicit non-English language in turn; confirm each request succeeds and the selection persists.
14. Cancel one pending transcription with the shortcut and confirm no late result is inserted.

For the published production path:

1. Install Dictozy from the Chrome Web Store.
2. Confirm the extension ID is `folpeencabfejhjokmldikaelonphmma`.
3. Confirm version `0.1.6` after the language-formatting release is installed.
4. Run the same supported-field recording and insertion checks.
5. Confirm the popup displays the assigned shortcut or `Not assigned`, and that the keyboard icon opens Chrome's shortcut settings.
6. Confirm the assigned shortcut starts and stops one recording and cancels one pending transcription.
7. Confirm English is the default, then complete one request using Automatic and one explicit non-English language.
8. Confirm production network traffic goes only to `https://voice-dictation-extension.onrender.com`, never directly to xAI.
9. Confirm Render logs include request ID, status, and latency for the smoke test without audio or transcript content.

## Backend-First Compatibility Check

Deploy the `0.1.6`-compatible backend before submitting the `0.1.6` extension:

1. Confirm `/health` after the backend deployment.
2. Use the published `0.1.5` extension, which omits the new form field, and confirm one transcription still succeeds with the backend's English default.
3. Load the `0.1.6` package and test English, Automatic, and one explicit non-English language.
4. Confirm unsupported language values return a safe `400` in backend tests and never reach xAI.

## Failure Checks

- Entering remote HTTP is rejected before it is saved.
- Entering an xAI URL is rejected before it is saved.
- A stopped or unavailable backend produces a reachable error state instead of leaving the extension on Transcribing.
- A backend timeout returns control to the user with a retry state and short request reference.
- Cancelling a pending transcription prevents any late response from being inserted; it does not guarantee provider-side processing stops after upload.
- Turning Dictozy off during recording or transcription cancels extension-side active work safely.
- A retry records a fresh clip and does not reuse failed audio.
- Repeated shortcut presses do not overlap recording or transcription work.
- The shortcut does nothing while Dictozy is disabled or an unsupported or sensitive field is focused.
- Backend responses do not expose provider credentials or raw upstream error bodies.
- Unsupported language values return a safe `400` and do not expose provider details.

## Local Script Check

The smoke-test script permits HTTP only when explicitly testing localhost:

```bash
python scripts/smoke_test.py http://127.0.0.1:8000 --allow-http
```
