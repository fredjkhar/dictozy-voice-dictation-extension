# Phase 4 — optional personal vocabulary

Date: **2026-10-26** (America/Toronto). Branch: `codex/phase-4-personal-vocabulary`.
Accepted Phase 3/policy base: `6577e4a`. Implementation and regression tests: **`2b444fc`**.

**The approved local implementation is complete: 381 automated tests passed, zero failures or
skips.** No critical regression was found. Nothing was deployed, published, pushed, merged to
production or changed in infrastructure. All six existing release gates remain open.

## Implementation and consent

- The existing popup has an optional **Personal vocabulary** section: one word/short phrase per
  line, Save, Clear and a separate assistance switch. Editing/removing lines and saving updates the
  list. Assistance is disabled by default; saving terms does not enable it.
- One `chrome.storage.local` key, `personalVocabulary`, contains `{enabled, terms}`. No sync,
  new permissions, accounts, analytics, automatic extraction or permanent server storage.
  Clear removes this key and disables assistance; disabling alone retains the local list.
- The disclosure precedes opt-in and explains that enabled saved terms accompany every dictation
  through the existing backend to xAI. Changes affect subsequent requests; already sent requests
  cannot be recalled. Treat names or other sensitive terms accordingly.
- The background worker reads current consent and terms at each upload. Disabled, empty or invalid
  settings omit vocabulary entirely. Content-script messages cannot provide vocabulary or consent.
  Storage errors fail safely; the popup preserves unsaved edits and reports unconfirmed changes.
- Client and server enforce at most 100 entries and 50 Unicode code points per normalized term,
  reject nonstrings/empty terms/control characters/lone surrogates, and trim/NFC-normalize/deduplicate
  case-insensitively. The server also bounds JSON size and rejects duplicate/invalid form fields
  with generic errors. Tests verify that private terms do not appear in errors or application logs.

## Provider integration

The extension sends optional `vocabulary_enabled=true` and a JSON `vocabulary` array to the existing
`/api/transcribe` route. Missing/false consent ignores vocabulary. Valid enabled terms become
repeatable multipart **`keyterm`** fields before the audio file in the existing backend-only
`/v1/stt` request. Requests without vocabulary and language formatting retain their behavior.
The API key remains backend-only; transcript text is not rewritten to force matches.

The [official xAI Speech-to-Text documentation](https://docs.x.ai/developers/model-capabilities/audio/speech-to-text)
was checked on this date: `/v1/stt` supports up to 100 keyterms of 50 characters, and model omission
selects `grok-voice-transcribe-2.0`. The existing service omits `model`; this behavior is preserved.
An HTTPX mock transport verified actual multipart serialization, including repeated field names
and ordering. **No live provider calls or paid credentials were used; recognition improvement is
not established.** Production configuration and backend support remain unverified.

## Validation

| Suite | Passed | Method |
|---|---:|---|
| Extension unit | 60 | Node; validation, consent, fresh storage reads and message boundary |
| Extension browser | 150 | 128 mocked workflows; 22 unpacked MV3 tests with synthetic microphone/stub responses |
| Backend | 150 | pytest; validation, safe errors/logs, provider wire format and existing abuse/resource controls |
| Website | 21 | Playwright; existing site/privacy workflows |
| **Total** | **381** | **Zero failed/skipped; full suite run once at completion** |

Added coverage: 6 unit tests, 6 browser tests and 55 backend cases (mostly parameterized validation
cases). Focused runs passed first: 20 unit, 6 browser and 61 backend tests. Critical cases cover
default-off/disabled/unconsented omission; malformed/excessive input; opt-in, edit, delete, disable
and clear; legacy requests; keyboard consent; failed storage writes; unchanged language and
provider transcript. An unpacked extension test changes vocabulary during capture, checks the
next upload, selection replacement and native Undo, then checks disabling and cancellation.

Package, Store asset and site validators, dependency checks and whitespace checks passed.
The popup was visually inspected from an automated 320px-wide rendering. Labels, native controls,
Space activation and status messages have automated coverage. New physical microphone, live-app
or human screen-reader testing was not performed; valid Phase 3 evidence is retained. No routine
manual participation was requested and no mock was treated as live provider validation.

## Files and reproduction

- Runtime: `extension/vocabulary.js`, `popup-vocabulary.js`, `popup.html`, `background.js`;
  `backend/app/core/vocabulary.py`, `routes/transcribe.py`, `services/xai_service.py`.
- Tests: new `extension/tests/vocabulary.test.js`, `browser/vocabulary-settings.spec.js`,
  `backend/tests/test_vocabulary.py`, `test_transcribe_vocabulary.py`; updated background,
  installed-extension and xAI service tests. Packaging includes both new JavaScript files.
- Documentation: this report, roadmap and Phase 3 cross-reference; extension/backend READMEs,
  `PRIVACY.md`, `site/privacy.html`, Store changelog/listing/permission audit/release checklist.
  Privacy changes are **unpublished**. The unrelated `SEO Report.pdf` remains untouched.

With the existing dependencies installed, run from the repository root (browser and site suites
sequentially, because they share a local port):

```bash
npm test
npm run test:browser
PYTHON_DOTENV_DISABLED=1 PYTHONDONTWRITEBYTECODE=1 XAI_API_KEY='' APP_ENV=local backend/.venv/bin/python -m pytest -q -p no:cacheprovider
npm run test:site
python3 scripts/package_extension.py --check-only
python3 scripts/validate_store_assets.py
python3 scripts/validate_site.py
```

For an optional UI check, reload the unpacked `extension/` directory in Chrome, open its popup,
save a harmless phrase under Personal vocabulary and reopen it: assistance stays off and the
phrase persists. Enable, edit/save, disable, then Clear; reopening should show an empty list and
assistance off. No speech or API call is needed. Local FastAPI alone does not redirect the
extension's fixed production endpoint; use the automated fixtures for isolated request tests.

## Risks and next step

Recording lifecycle, 10/30-second limits, shortcuts, safe insertion, native Undo, one-result
memory-only recovery and backend protections are unchanged. Vocabulary is intentionally persistent
locally; all enabled saved terms accompany requests. No new third-party recipient was introduced.
Provider retention remains subject to xAI's policy; DICTOZY adds no permanent server vocabulary store.

All [six release gates](PHASE_3_CLOSEOUT.md#six-release-gates--all-open) stay open: actual Render
proxy/worker/replica/ingress verification; durable aggregate protection; remaining real microphone
and installed-extension acceptance; wider editor compatibility; production logging/deployment
validation; coordinated privacy publication. Optional compatibility follow-ups remain nonblocking
for development under the lean policy.

Ready for Phase 4 review. Any future release needs separate approval and a coordinated backend-first
rollout, since older backends may ignore vocabulary. Live provider behavior and accuracy remain
unverified; they do not block this locally validated implementation. Spoken snippets and all
other productivity features remain deferred.
