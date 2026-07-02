# Post-Publish Monitoring

Use this checklist after a Chrome Web Store release is live. It is written for Dictozy `0.1.2` and the published extension ID:

```text
folpeencabfejhjokmldikaelonphmma
```

This process does not add analytics, telemetry, or new services. It relies on manual Chrome Web Store checks, Render health/logs, xAI Console usage review, and real smoke tests from the Store-installed extension.

## Cadence

First week after publish:

- Check once per day.
- Run one Store-installed extension smoke test with a short, non-sensitive phrase.
- Review Render logs for status, latency, and safe logging.
- Review xAI usage and spend.
- Check GitHub issues or support reports.

After the first week:

- Check once per week while usage remains low and stable.
- Run an additional check after backend deploys, Render configuration changes, xAI account changes, or Chrome Web Store listing changes.

## Published Extension Smoke Test

Use the Chrome Web Store-installed extension, not the unpacked development extension.

1. Install Dictozy from the Chrome Web Store.
2. Open `chrome://extensions` and confirm the extension ID is `folpeencabfejhjokmldikaelonphmma`.
3. Confirm the installed version is `0.1.2`.
4. Open an HTTPS page with a normal text input or textarea.
5. Focus a supported field and confirm the visible microphone button appears.
6. Click the microphone button.
7. Confirm recording starts only after the click and Chrome's microphone permission flow is respected.
8. Speak a short, non-sensitive phrase.
9. Stop recording with the stop icon, or wait for the configured recording limit.
10. Confirm the status moves through recording and transcribing.
11. Confirm the transcript is inserted into the focused field.
12. Confirm password, payment, hidden, readonly, disabled, checkbox, radio, and file fields are ignored.
13. Inspect extension network activity and confirm requests go only to `https://voice-dictation-extension.onrender.com`, never to an `x.ai` host.

## Chrome Web Store Listing Check

Verify the public listing after publish:

- Name is `Dictozy: Voice Dictation`.
- Icon, screenshots, and promotional tile match the released extension.
- Description does not claim background recording, direct xAI access, transcript history, accounts, payments, realtime streaming, grammar correction, or unsupported browser support.
- Privacy policy link opens the current `PRIVACY.md`.
- Support link points to GitHub issues.
- Homepage link points to the current repository or published landing page.
- The listing is visible in the intended regions and channels.

## Backend Health And CORS

Check production health:

```bash
cd backend
python scripts/smoke_test.py https://voice-dictation-extension.onrender.com
```

Expected result:

```text
PASS health: https://voice-dictation-extension.onrender.com/health
SKIP transcription: no --audio file supplied
```

In Render, confirm:

- Latest intended backend deploy is live.
- `APP_ENV=production`.
- `TRANSCRIPTION_ENABLED=true` during normal operation.
- `BACKEND_CORS_ORIGINS` includes exactly:

  ```text
  chrome-extension://folpeencabfejhjokmldikaelonphmma
  ```

- No trailing slash is present on the Chrome extension origin.
- Any temporary unpacked-extension origin is removed after local testing is finished.

## Render Log Review

Look for request logs with:

- `request_id`
- method
- path
- status
- latency

Pay special attention to:

- `429`: rate or concurrency limiting is rejecting requests before xAI calls.
- `502`: xAI provider failure or rejection.
- `503`: missing configuration, emergency cutoff, or temporary unavailability.
- CORS failures from the published extension origin.
- Latency spikes, especially first request latency after idle periods.
- Provider failure class or upstream status only, not upstream response body text.

Logs must not include:

- Audio bytes or uploaded file contents.
- Transcript text.
- API keys or secrets.
- Full upstream response bodies.
- Raw IP addresses when avoidable.

If a user reports a failed request and can safely provide a request ID, search Render logs by that `request_id`.

## xAI Usage And Spend Review

In the xAI Console, review:

- Daily usage.
- Spend trend.
- Unexpected usage spikes.
- Usage grouped by API key if available.
- Failed provider calls if visible.
- Spend-management warnings or billing limit status.

If usage is higher than expected:

1. Check whether Render logs show matching successful `/api/transcribe` traffic.
2. Check whether `429`, `502`, or repeated retries are increasing.
3. Confirm the extension is still sending requests only to the backend.
4. Decide whether to lower rate/concurrency limits or use the emergency cutoff.

## Incident Triage

Start with the least disruptive checks:

1. Open `https://voice-dictation-extension.onrender.com/health`.
2. Check Render deploy status.
3. Check Render logs by `request_id`, status, and latency.
4. Check whether errors are mostly `429`, `502`, or `503`.
5. Check xAI usage, spend, credits, and provider availability.
6. Reproduce with the Store-installed extension using a short, non-sensitive phrase.
7. Confirm the extension network target is the backend, never xAI.

## Emergency Cutoff

Use the cutoff only when intentionally stopping transcription, such as unexpected spend, suspected abuse, or a provider incident that should not keep retrying.

1. Set `TRANSCRIPTION_ENABLED=false` in Render.
2. Redeploy or restart the service.
3. Confirm `/health` still returns `{"status":"ok"}`.
4. Confirm `/api/transcribe` returns a safe `503`.
5. Confirm logs show request IDs, status, and latency only.
6. Communicate status in the GitHub issue or support channel.

After the incident:

1. Fix the underlying issue or decide that normal traffic is safe.
2. Set `TRANSCRIPTION_ENABLED=true`.
3. Redeploy or restart.
4. Run the Store-installed extension smoke test.
5. Review xAI usage after the first successful test.

## Rollback And Mitigation

For backend incidents:

- Prefer toggling `TRANSCRIPTION_ENABLED=false` over changing extension code.
- If the latest backend deploy caused the issue, redeploy the last known-good backend commit from Render.
- Keep `/health` available so the popup backend check and smoke tests can distinguish backend availability from transcription availability.

For Chrome Web Store listing issues:

- Correct listing text, screenshots, links, or privacy policy in the Developer Dashboard.
- Do not submit new extension code unless the behavior itself needs to change.

For extension behavior issues:

- Capture reproduction steps, Chrome version, OS, field type, and safe screenshots.
- Confirm whether the issue reproduces with the unpacked extension from `main`.
- Track fixes in GitHub issues before starting a new feature phase.

## Support Triage

Use [support-triage.md](support-triage.md) for issue intake, severity, safe log collection, and response templates.
