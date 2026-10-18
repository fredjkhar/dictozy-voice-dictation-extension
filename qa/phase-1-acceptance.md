# Phase 1 acceptance and release gate

Prepared 2026-10-17. These are instructions and pending human checks, not a claim that
physical microphone, live writing applications, production or Store-installed tests passed.
See [the roadmap and implementation report](../docs/IMPROVEMENT_ROADMAP.md).

## Repeat automated validation locally

From the repository root, with Node dependencies and `backend/.venv` installed:

```bash
npm ci
npx playwright install chromium
npm test
npm run test:browser
PYTHON_DOTENV_DISABLED=1 PYTHONDONTWRITEBYTECODE=1 XAI_API_KEY='' APP_ENV=local backend/.venv/bin/python -m pytest -q -p no:cacheprovider
npm run test:site
backend/.venv/bin/python -m pip check
python3 scripts/package_extension.py --check-only
python3 scripts/validate_store_assets.py
python3 scripts/validate_site.py
```

Backend setup is in [backend/README.md](../backend/README.md). Tests require no provider key.
The browser runner serves the local QA page automatically. Most browser tests inject mock
Chrome/media/provider APIs. `installed-extension.spec.js` separately loads the unpacked MV3
extension in bundled Chromium with a synthetic microphone, native MediaRecorder, real Chrome
storage and a stubbed backend fetch. The production hostname is blocked by a browser DNS rule.
These tests do not use physical speech, live xAI or a Chrome Web Store installation.

## Run locally for human acceptance

Serve the QA fixtures from the repository root:

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

Open `http://127.0.0.1:4173/qa/manual-test-page.html`. Load `extension/` through
Chrome's Developer mode / Load unpacked and reload the page. A direct load retains the existing
**production backend URL**; starting local FastAPI does not redirect the extension. Complete
physical end-to-end checks only against an approved backend environment. Do not add keys to
extension files. Automated tests above are the available fully local, provider-free path.

To run backend-only local checks without a provider key, from the repository root:

```bash
PYTHON_DOTENV_DISABLED=1 XAI_API_KEY='' APP_ENV=local backend/.venv/bin/uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --no-access-log
```

`GET /health` should return `{"status":"ok"}`. Transcription returns a safe unavailable response
without a configured key. This liveness check does not establish provider readiness.

## Human browser checklist — pending

Record Chrome version, OS, extension revision, backend environment, date and outcome for each.
Use only non-sensitive test text/speech.

1. Start and stop with mouse, Enter, Space and assigned extension shortcut. Confirm focus returns
   to the original input and Undo restores its previous value. Repeat on textarea and editable
   ARIA/rich-text fixtures, including a nonempty selection. Caret-only movement while waiting
   should retain the captured insertion position.
2. During recording, focus a password field, another field or blank page space; switch tabs;
   minimize/switch windows; leave the page; remove/hide/cover the microphone control; disable the
   target. Capture must stop, with no upload or recovery of deliberately cancelled work. CSS-only
   visibility changes are additionally checked every 100 ms while recording.
3. Request microphone access, then switch tabs or cancel with the shortcut before allowing it.
   Late permission must release its stream without starting capture. Denial, device disconnect,
   rapid repeated activation and a new session after cancellation must remain recoverable.
4. Start with `Alpha Beta` and select `Beta`. Stop dictation. While the result is pending, prepend
   `Dear ` or alter the rich-text DOM. Completion must leave `Dear Alpha Beta` untouched. Repeat
   after moving to another field. It must never insert into the newly focused field.
5. If safe insertion is refused, verify a generic recovery notice appears without revealing the
   transcript. Copy explicitly, paste into a disposable local field, then Undo the paste. Check
   keyboard Copy, Discard, clipboard denial/retry, 60-second expiry, new recording, disable,
   hidden tab and page exit. Each clearing action removes the notice; cancelled requests never
   become recoverable. A removed/unsupported pending target cancels work under the existing policy.
6. In page JavaScript, call the microphone element's `.click()` and dispatch a synthetic click.
   Neither may prompt for microphone access, record or upload. Genuine pointer/key activation
   must still work. This guards synthetic activation; shared page DOM is not a trusted security UI.
7. Verify all previous language, duration, shortcut, global/site toggle and reset preferences.
   No new permissions should appear. Inspect keyboard order, focus indicator and screen-reader
   announcement of recording, errors and recovery. Check zoom/narrow viewport layout.

## Backend/deployment checklist — pending approval and environment access

- Confirm exactly one worker and one replica, including any hosting start-command override.
- Verify the actual ingress trust chain before exporting `FORWARDED_ALLOW_IPS`; never use `*`
  or guessed outbound address ranges. Exercise forged forwarding headers through that ingress.
- Approve the aggregate allowance (default 3,600 audio seconds / rolling 24 hours). In local or
  staging tests, exhaust it across clients; no further provider calls should occur. Failures
  consume reservations. Restart resets it: a durable global spending cap remains a separate decision.
- Test chunked/oversized/slow uploads and safe failure responses through the real reverse proxy.
- Check structured request IDs, statuses and latency in production-style logs; no speech, field
  content, keys, exception bodies or raw IPs in application request logs. Host logs are separate.
- Confirm temporary spooled uploads are closed after success/error in the deployed filesystem.
  Abrupt host termination cleanup follows platform behavior. Publish the accurate privacy policy
  only with the approved release.
- Validate real microphone formats, speech and provider latency. Package with a new version only
  after release approval: public 0.1.12 is already published and must not be overwritten.

No deployment, paid infrastructure change, Store upload, production secret change or Phase 2 work
is authorized by completing this checklist. Request the applicable approval first.
