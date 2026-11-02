# Phase 1 implementation report

Date: 2026-10-17. Branch: `codex/phase-1-correctness-trust`. Starting revision: `a939c61`.
Status: **Implemented and tested locally; awaiting user review.** Phase 2 has not begun.

## Outcome and approach

The baseline review confirmed the reported lifecycle, stale-selection, synthetic activation,
keyboard, forwarding-header, WAV duration, temporary-upload disclosure and logging problems.
Focused regressions reproduced the failures before corrections where feasible. The published
Store baseline is 0.1.12, verified from public metadata; branch fixes remain unpublished.

### Recording and user-written content

- Hidden pages, unsafe focus/targets and missing/invisible/covered controls cancel recording.
  Tracks stop immediately instead of waiting for a recorder event. Focus/visibility/DOM events
  handle transitions; a 100 ms check catches CSS/layout changes while recording.
- Session-bound recorder callbacks prevent cancelled or delayed events from affecting a new
  recording. Permission results arriving after cancellation, hiding or loss of window focus
  release the stream without capture. Device-ended/error listeners are removed during cleanup.
- Normal stop snapshots microphone signal before releasing tracks and clears the duration timer.
  Otherwise ended tracks look silent, or a deadline arriving before the final browser event can
  discard valid audio. Dedicated browser tests cover normal completion and delayed stop events.
- Form insertion requires the original captured value to match. Rich-text insertion also requires
  matching markup and range boundary identities/offsets. Validation repeats after page
  `beforeinput` handlers to detect synchronous edits, target removal, readonly state or focus moves.
- Unsafe insertion leaves the editor untouched. A completed result can be explicitly copied or
  discarded from a generic notice for 60 seconds. At most one result per page is held in memory;
  the text is never placed in the recovery DOM or persistent storage. New recording, disable,
  hiding/exit, expiry or successful Copy/Discard clears it. Cancelled work is never recovered.
- Page-generated clicks cannot activate dictation. Native mouse/Enter/Space activation and the
  separate extension-command path remain available. Keyboard control focus resolves to the
  retained supported field and normal stop restores editor focus.

This is the minimum recovery needed by Phase 1's safe-insertion requirement. The Phase 2
onboarding, recording timers/activity feedback and broader recovery/accessibility work are deferred.

### Backend security, audio and operations

- Per-client quotas use the server-resolved transport/client IP only. Raw `X-Forwarded-For` and
  `X-Real-IP` cannot change a direct client's quota. Tests exercise Uvicorn's trusted/untrusted
  proxy-hop handling and IPv4-mapped addresses. Production rejects wildcard/whole-internet proxy
  trust and zero resource guards. Real host ingress settings still require verification.
- An atomic rolling allowance reserves decoded audio duration before provider calls, across all
  clients in one worker. Default: 3,600 seconds per 86,400 seconds. Each attempt rounds up to a
  whole second; failed/cancelled attempts are not refunded. Exhaustion prevents further xAI calls.
  Docker explicitly runs one worker. This is not a durable global or dollar-denominated cap.
- A pre-parser body guard checks actual bytes, including dishonest/missing length headers, limits
  concurrent admitted uploads and expires incomplete bodies after 15 seconds. Audio still has the
  existing 10 MiB file limit; multipart body allowance defaults to 11 MiB. Receive slots release
  on oversized, disconnected and timed-out requests. Downstream failures are not mislabeled as
  upload timeouts.
- WAV duration is calculated from actual decoded mono PCM samples, not unknown frame counts.
  Less than 0.25 seconds and more than 60 seconds are rejected. Long clips are no longer silently
  truncated at 60 seconds. Canonical output headers match actual samples. FFmpeg uses pipe-only
  protocols, bounded probing/output duration, one decoder/filter thread and a 20-second per-pass
  timeout. Synthetic WAV, WebM/Opus and MP3 conversions were exercised using real FFmpeg.
- Privacy documentation now describes multipart temporary-file spooling above 1 MiB and cleanup
  at request completion, rather than claiming all processing is memory-only. A regression observes
  a rolled temporary file closing after validation failure. There is no permanent recording or
  transcript history. Host-crash cleanup and provider retention remain platform responsibilities.
- Request IDs and latency emit through an explicitly configured application logger. Unknown URL
  paths are redacted, safe 500 responses do not log exception text/tracebacks, and Docker disables
  Uvicorn access logging. The local Uvicorn smoke test verified actual startup and structured logs.
- Public Store metadata shows 0.1.12, updated September 7, 2026. Repository/QA/Store/site metadata
  now distinguish that published baseline from these unpublished fixes. Source version is unchanged;
  a future approved package needs a new version.

## Validation evidence

Environment: macOS 15.6.1, Node 22.13.1, Python 3.14.7, Playwright 1.61.1,
bundled Chromium 149.0.7827.55. No live credentials or physical microphone were used.

| Suite | Baseline | Final | Added | Method |
|---|---:|---:|---:|---|
| Extension unit | 52 | 53 | 1 | Node tests |
| Mocked browser workflows | 59 | 86 | 27 | Chromium DOM with injected Chrome/media/provider mocks |
| Unpacked MV3 integration | 0 | 2 | 2 | Actual MV3/MediaRecorder/storage; synthetic mic and stubbed backend |
| Backend | 50 | 95 | 45 | Pytest, in-process ASGI, real FFmpeg; stubbed provider |
| Website | 21 | 21 | 0 | Local Chromium pages |
| **Total** | **182** | **257** | **75** | **All passed; zero final failures/skips** |

Original tests were retained. The existing site version expectation changed only to reflect the
verified public version. Regression coverage includes the `Alpha Beta` / `Dear ` corruption case
for input, textarea and rich text; selected replacement; late completion/focus changes; page hooks
changing targets; cancelled/stale sessions; synthetic activation; keyboard/Undo; recovery
copy/denial/retry/expiry/discard; forged headers; aggregate accounting; malformed/manipulated,
short/long audio; actual upload bounds; temporary-file cleanup; and safe operational logs.

Additional passed checks:

- JavaScript syntax across 20 runtime/test/config files and manifest JSON.
- Extension package input, Chrome Web Store visual asset and website validators.
- Python dependency graph (`pip check`).
- Local Uvicorn startup, `/health`, response request ID and structured request-latency log.
- `git diff --check` and source/diff review for unrelated changes, permissions and retention.
- Visual inspection of the recovery notice screenshot on the local QA fixture: readable message,
  Copy/Discard buttons, no transcript displayed. This is not screen-reader or live-app validation.

## Files created or modified

Created:

- `docs/IMPROVEMENT_ROADMAP.md`, `docs/PHASE_1_REPORT.md`: baseline, phased plan, status/gates and evidence.
- `qa/phase-1-acceptance.md`: reproducible local commands and pending human/deployment checklist.
- `backend/app/core/request_limits.py`, `backend/app/core/logging_config.py`: pre-parser resource guard and request logger.
- `backend/tests/test_request_limits.py`: body/concurrency/timeout/disconnect regressions.
- `extension/tests/browser/installed-extension.spec.js`: unpacked MV3 integration tests.

Modified:

- `extension/content.js`, `extension/dom-utils.js`, `extension/content.css`: lifecycle, activation,
  insertion validation and minimal recovery notice.
- `extension/tests/browser/dictation.spec.js`, `extension/tests/dom-utils.test.js`: regression coverage.
- `backend/app/core/config.py`, `backend/app/core/limits.py`, `backend/app/routes/transcribe.py`:
  deployment trust validation, quotas and provider admission.
- `backend/app/services/audio_normalization.py`, `backend/app/main.py`: decoded duration and safe request handling/logging.
- `backend/tests/test_audio_normalization.py`, `backend/tests/test_config.py`,
  `backend/tests/test_limits.py`, `backend/tests/test_transcribe.py`: backend regression coverage.
- `backend/Dockerfile`, `backend/.env.example`, `backend/.env.production.example`: local deployment
  defaults/templates only; no production settings or secrets changed.
- `README.md`, `extension/README.md`, `backend/README.md`, `backend/DEPLOYMENT.md`: operation, test and limitation notes.
- `PRIVACY.md`, `site/privacy.html`: accurate prepared retention/logging/recovery disclosures.
- `site/index.html`, `scripts/validate_site.py`, `tests/site/site.spec.js`: published version metadata.
- `store/changelog.md`, `store/listing.md`, `store/release-checklist.md`: published versus unpublished release state.
- `qa/manual-qa-checklist.md`, `qa/deployment-smoke-test.md`, `qa/post-publish-monitoring.md`: published baseline.

The pre-existing untracked `SEO Report.pdf` was neither read, changed nor committed.

## Reviewable commits

- `7b80e58` — baseline assessment and gated roadmap.
- `500e79c` — extension recording, activation, insertion and recovery corrections with regressions.
- `5b99f8b` — backend resource budgets, proxy trust, decoded audio and operational safeguards with regressions.
- Final documentation commit — privacy/release corrections, completed roadmap, this report and manual acceptance guide.

These commits remain on the dedicated local branch. No push, merge, deployment or Store publication occurred.

## Preserved behavior

Plain JavaScript, MV3, FastAPI and backend-only xAI remain. No new browser permission, framework,
account, payment, streaming, grammar correction, telemetry or persistent transcript storage was
introduced. Existing supported-field filters, explicit cancellation, language and site preferences,
shortcuts, caret-only movement and native Undo regressions pass. Recording default/max remain
10/30 seconds. The existing native editing path and compatibility fallbacks remain in place.

## Remaining limitations and release risks

1. **Deployment verification is pending.** Actual Render proxy hops, configured start command,
   replica count, ingress body limits and production logs were not inspected or changed. With
   unverified proxy trust, clients may share the proxy's address and quota. Do not guess ranges.
2. **Aggregate protection is bounded to one running worker.** Restarts reset accounting; replicas
   multiply it. Reliable cross-restart/global enforcement needs an approved durable shared store
   or a verified provider/edge hard cap. No new infrastructure or billing configuration was added.
   CORS is not authorization; the endpoint remains public and limits do not eliminate denial of service.
3. **Real usage remains unverified.** No physical microphone, live xAI, Gmail, Outlook, messaging,
   notes or AI chat application, Store-installed extension, screen reader, Docker image or production
   deployment test was performed. Unpacked Chromium with synthetic audio does not establish those results.
4. **Conservative insertion can require recovery.** Any value/markup change may refuse insertion;
   no speculative offset rebasing occurs. Removed/unsupported pending targets retain the existing
   cancellation policy. Clipboard availability depends on browser/site policy; failed copies remain
   retryable until expiry. Background pages deliberately clear recoverable text.
5. **Browser/editor constraints remain.** Existing iframe, Shadow DOM, Permissions Policy and
   framework behavior require the Phase 3 compatibility work. Native Undo is verified in the tested
   Chromium fixtures; existing fallback insertion paths are not a universal Undo guarantee.
6. **No infrastructure retention guarantee is implied.** Temporary spooling is disclosed; abrupt
   host termination and third-party processing follow their platform policies. Cancellation cannot
   guarantee provider processing/billing stops. Prepared privacy copy must ship with the approved release.

No known stale-offset overwrite or wrong-field insertion remains in the tested workflows. This is
an evidence-bound finding, not a claim that all third-party editors have been certified.

## Run, manual acceptance and next decision

Use [the local run and manual acceptance guide](../qa/phase-1-acceptance.md) for exact commands
and scenarios. A manually loaded extension still points to the fixed production backend; the
provider-free automated fixtures are the available isolated local path. Do not accidentally treat
starting a local FastAPI process as redirecting the extension.

Review Phase 1 and its remaining deployment/manual gates. **Phase 2 requires explicit approval**
before work starts. Its next useful scope is first-use practice, clear recording feedback and
accessibility refinements built on the minimal safe-insertion recovery now present. Production
release approval and any durable aggregate-budget infrastructure decision are separate gates.
